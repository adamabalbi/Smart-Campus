const Card = require("../models/Card");
const { logError } = require("../utils/secureLogger");
const Student = require("../models/Student");
const Wallet = require("../models/Wallet");
const User = require("../models/User");
const NFCLog = require("../models/NFCLog");
const crypto = require('crypto');
const mongoose = require('mongoose');
const { logAudit } = require("../services/auditService");

// Instance du service NFC (sera initialisé dans server.js)
let nfcService = null;

const setNFCService = (service) => {
  nfcService = service;
};

// Validation et authentification par carte NFC
const authenticateByCard = async (req, res) => {
  try {
    const { uid, readerId } = req.body;

    if (!uid) {
      return res.status(400).json({
        message: "UID de carte requis"
      });
    }

    // Hash de l'UID pour recherche sécurisée
    const uidHash = crypto.createHash('sha256').update(uid.toLowerCase()).digest('hex');

    // Recherche de la carte
    const card = await Card.findOne({
      uidHash: uidHash,
      status: "active",
      nfcEnabled: true
    }).populate('studentId');

    if (!card) {
      await logNFCEvent(uid, 'auth', false, 'Card not found', readerId);
      return res.status(404).json({
        message: "Carte non trouvée ou désactivée"
      });
    }

    // Vérification de l'étudiant
    const student = await Student.findById(card.studentId)
      .populate('userId');

    if (!student || student.status !== 'active') {
      await logNFCEvent(uid, 'auth', false, 'Student inactive', readerId);
      return res.status(403).json({
        message: "Étudiant inactif ou non trouvé"
      });
    }

    // Récupération du portefeuille
    const wallet = await Wallet.findOne({ studentId: student._id });

    // Mise à jour de la dernière lecture NFC
    card.lastNfcRead = new Date();
    card.nfcFailures = 0;
    await card.save();

    // Log de l'événement réussi
    await logNFCEvent(uid, 'auth', true, null, readerId);

    res.json({
      success: true,
      message: "Authentification NFC réussie",
      data: {
        student: {
          _id: student._id,
          matricule: student.matricule,
          nom: student.nom,
          prenom: student.prenom,
          niveau: student.niveau,
          filiere: student.filiere
        },
        card: {
          _id: card._id,
          numero: card.numero,
          status: card.status,
          pinRequired: !card.pinValidated
        },
        wallet: wallet ? {
          _id: wallet._id,
          balance: wallet.balance,
          status: wallet.status
        } : null
      }
    });

  } catch (error) {
    logError("Erreur authentification NFC", error);
    await logNFCEvent(req.body.uid, 'auth', false, error.message, req.body.readerId);
    res.status(500).json({
      message: "Erreur serveur lors de l'authentification NFC"
    });
  }
};

// Validation du PIN avec carte NFC
const validatePinWithCard = async (req, res) => {
  try {
    const { uid, pin, readerId } = req.body;

    if (!uid || !pin) {
      return res.status(400).json({
        message: "UID et PIN requis"
      });
    }

    const uidHash = crypto.createHash('sha256').update(uid.toLowerCase()).digest('hex');

    const card = await Card.findOne({
      uidHash: uidHash,
      status: "active",
      nfcEnabled: true
    });

    if (!card) {
      await logNFCEvent(uid, 'pin_validation', false, 'Card not found', readerId);
      return res.status(404).json({
        message: "Carte non trouvée"
      });
    }

    // Vérification du PIN avec bcrypt
    const bcrypt = require('bcryptjs');
    const isPinValid = bcrypt.compareSync(pin, card.pinHash);

    if (!isPinValid) {
      // Incrémenter les échecs
      card.nfcFailures = (card.nfcFailures || 0) + 1;

      // Bloquer la carte après 3 échecs
      if (card.nfcFailures >= 3) {
        card.status = 'blocked';
      }

      await card.save();
      await logNFCEvent(uid, 'pin_validation', false, 'Invalid PIN', readerId);

      return res.status(401).json({
        message: "PIN incorrect",
        failures: card.nfcFailures,
        blocked: card.nfcFailures >= 3
      });
    }

    // PIN correct - utiliser la méthode sécurisée
    card.resetPinAttempts(); // Cette méthode définit pinValidated=true et lastPinValidation
    card.nfcFailures = 0;
    await card.save();

    await logNFCEvent(uid, 'pin_validation', true, null, readerId);

    res.json({
      success: true,
      message: "PIN validé avec succès",
      cardId: card._id
    });

  } catch (error) {
    logError("Erreur validation PIN NFC", error);
    await logNFCEvent(req.body.uid, 'pin_validation', false, error.message, req.body.readerId);
    res.status(500).json({
      message: "Erreur serveur lors de la validation PIN"
    });
  }
};

// Recharge via NFC (pour kiosques)
const rechargeByNFC = async (req, res) => {
  try {
    const { uid, amount, readerId, metadata = {}, idempotencyKey } = req.body;

    if (!uid || !amount) {
      return res.status(400).json({
        message: "UID et montant requis"
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        message: "Montant invalide"
      });
    }

    const uidHash = crypto.createHash('sha256').update(uid.toLowerCase()).digest('hex');

    // Recherche de la carte avec toutes les relations
    const card = await Card.findOne({
      uidHash: uidHash,
      status: "active",
      nfcEnabled: true
    }).populate({
      path: 'studentId',
      populate: { path: 'userId' }
    });

    if (!card) {
      await logNFCEvent(uid, 'recharge', false, 'Card not found', readerId);
      return res.status(404).json({
        message: "Carte non trouvée ou désactivée"
      });
    }

    // Vérification du PIN si requis (avec expiration sécurisée)
    if (!card.pinValidated || card.isPinValidationExpired()) {
      await logNFCEvent(uid, 'recharge', false, 'PIN not validated or expired', readerId);
      return res.status(403).json({
        message: "PIN non validé ou expiré. Validez d'abord votre PIN."
      });
    }

    const student = card.studentId;
    if (!student || student.status !== 'active') {
      await logNFCEvent(uid, 'recharge', false, 'Student inactive', readerId);
      return res.status(403).json({
        message: "Étudiant inactif"
      });
    }

    // Récupération du portefeuille
    const wallet = await Wallet.findOne({ studentId: student._id });
    if (!wallet) {
      await logNFCEvent(uid, 'recharge', false, 'Wallet not found', readerId);
      return res.status(404).json({
        message: "Portefeuille non trouvé"
      });
    }

    // Calcul du nouveau solde
    const balanceBefore = wallet.balance;
    const newBalance = balanceBefore + amount;

    // Vérification des limites
    if (newBalance > wallet.maxBalance) {
      await logNFCEvent(uid, 'recharge', false, 'Balance limit exceeded', readerId);
      return res.status(400).json({
        message: `Solde maximum dépassé (${wallet.maxBalance} XOF)`
      });
    }

    const Transaction = require("../models/Transaction");

    // Idempotence : si la même clé a déjà été traitée, on renvoie la transaction
    // existante sans re-créditer (anti double-traitement en cas de rejeu).
    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey });
      if (existing) {
        return res.json({
          success: true,
          message: "Recharge déjà traitée (idempotence)",
          data: { transaction: existing, wallet: { balance: wallet.balance } }
        });
      }
    }

    // Génération d'un numéro de reçu unique (traçabilité)
    const receiptNumber = "REC-" + new Date().getFullYear() + "-" +
      Date.now().toString(36).toUpperCase() +
      Math.floor(100 + Math.random() * 900);

    // Localisation de la borne (traçabilité)
    const kioskId       = metadata.kioskId || readerId || "kiosk-inconnu";
    const kioskLocation = metadata.location || "Localisation non précisée";

    // Transaction atomique : crédit du wallet + transaction (pending -> validated)
    const session = await mongoose.startSession();
    let transaction;
    try {
      await session.withTransaction(async () => {
        const created = await Transaction.create([{
          studentId: student._id,
          cardId: card._id,
          walletId: wallet._id,
          agentId: null,
          type: "recharge",
          channel: "kiosk",
          amount: amount,
          balanceBefore: balanceBefore,
          balanceAfter: newBalance,
          status: "pending",
          description: `Recharge borne — ${kioskLocation}`,
          pinVerified: true,
          idempotencyKey: idempotencyKey || undefined,
          metadata: {
            ...metadata,
            nfcTransaction: true,
            readerId: readerId,
            kioskId: kioskId,
            location: kioskLocation,
            receiptNumber: receiptNumber,
            uid: uid.substring(0, 4) + '***'
          },
          processedAt: new Date()
        }], { session });
        transaction = created[0];

        wallet.balance = newBalance;
        wallet.lastRecharge = new Date();
        await wallet.save({ session });

        transaction.status = "validated";
        await transaction.save({ session });
      });
    } finally {
      await session.endSession();
    }

    // SÉCURITÉ : Réinitialiser la validation PIN après la transaction
    card.resetPinValidation();
    await card.save();

    // Log de l'événement
    await logNFCEvent(uid, 'recharge', true, null, readerId, {
      amount: amount,
      newBalance: newBalance,
      transactionId: transaction._id
    });

    res.json({
      success: true,
      message: "Recharge NFC effectuée avec succès",
      data: {
        transaction: transaction,
        wallet: {
          balance: newBalance,
          lastRecharge: wallet.lastRecharge
        },
        receipt: {
          receiptNumber: receiptNumber,
          kioskId: kioskId,
          location: kioskLocation,
          studentName: `${student.prenom} ${student.nom}`,
          matricule: student.matricule,
          amount: amount,
          balanceBefore: balanceBefore,
          balanceAfter: newBalance,
          date: transaction.processedAt
        }
      }
    });

  } catch (error) {
    logError("Erreur recharge NFC", error);
    await logNFCEvent(req.body.uid, 'recharge', false, error.message, req.body.readerId);
    res.status(500).json({
      message: "Erreur serveur lors de la recharge NFC"
    });
  }
};

// Statut des lecteurs connectés
const getReadersStatus = async (req, res) => {
  try {
    if (!nfcService) {
      return res.status(503).json({
        message: "Service NFC non disponible"
      });
    }

    const readers = nfcService.getConnectedReaders();

    res.json({
      success: true,
      data: {
        serviceStatus: nfcService.isRunning ? 'running' : 'stopped',
        readersCount: readers.length,
        readers: readers
      }
    });

  } catch (error) {
    logError("Erreur statut lecteurs", error);
    res.status(500).json({
      message: "Erreur serveur lors de la récupération du statut"
    });
  }
};

// Fonction utilitaire pour les logs NFC
const logNFCEvent = async (uid, action, success, errorMessage = null, readerId = null, metadata = {}) => {
  try {
    const NFCLog = require("../models/NFCLog");
    await NFCLog.create({
      cardUid: uid ? crypto.createHash('sha256').update(uid.toLowerCase()).digest('hex') : null,
      action: action,
      success: success,
      timestamp: new Date(),
      deviceId: readerId,
      errorCode: errorMessage,
      metadata: metadata
    });
  } catch (error) {
    logError("Erreur log NFC", error);
  }
};

// Paiement d'un service interne (cantine, bibliothèque, imprimerie) par carte NFC
const payByNFC = async (req, res) => {
  try {
    const { uid, pin, amount, service, serviceLabel, description, readerId, metadata = {}, idempotencyKey } = req.body;

    // Validations de base
    if (!uid || !pin || !amount) {
      return res.status(400).json({ message: "UID, PIN et montant requis." });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: "Le montant doit être supérieur à 0." });
    }

    // Le service doit exister et être actif
    if (service) {
      const Service = require("../models/Service");
      const svc = await Service.findOne({ key: service });
      if (!svc || svc.status !== "active") {
        await logNFCEvent(uid, 'payment', false, 'Service inactive', readerId);
        return res.status(403).json({ message: "Paiement refusé : service indisponible." });
      }
    }

    const bcrypt = require('bcryptjs');
    const uidHash = crypto.createHash('sha256').update(uid.toLowerCase()).digest('hex');

    // 1. La carte existe et est active + NFC activé
    const card = await Card.findOne({
      uidHash: uidHash,
      status: "active",
      nfcEnabled: true
    }).populate({ path: 'studentId', populate: { path: 'userId' } });

    if (!card) {
      await logNFCEvent(uid, 'payment', false, 'Card not found or inactive', readerId);
      return res.status(404).json({ message: "Paiement refusé : carte non active ou introuvable." });
    }

    // 2. Le PIN est correct
    const isPinValid = bcrypt.compareSync(pin, card.pinHash);
    if (!isPinValid) {
      card.nfcFailures = (card.nfcFailures || 0) + 1;
      if (card.nfcFailures >= 3) card.status = 'blocked';
      await card.save();
      await logNFCEvent(uid, 'payment', false, 'Invalid PIN', readerId);
      return res.status(401).json({
        message: "Paiement refusé : PIN incorrect.",
        blocked: card.nfcFailures >= 3
      });
    }

    // 3. L'étudiant est actif
    const student = card.studentId;
    if (!student || student.status !== 'active') {
      await logNFCEvent(uid, 'payment', false, 'Student inactive', readerId);
      return res.status(403).json({ message: "Paiement refusé : étudiant inactif." });
    }

    // 4. Le wallet existe et est actif
    const wallet = await Wallet.findOne({ studentId: student._id });
    if (!wallet) {
      await logNFCEvent(uid, 'payment', false, 'Wallet not found', readerId);
      return res.status(404).json({ message: "Paiement refusé : portefeuille introuvable." });
    }
    if (wallet.status !== 'active') {
      await logNFCEvent(uid, 'payment', false, 'Wallet inactive', readerId);
      return res.status(403).json({ message: "Paiement refusé : portefeuille non actif." });
    }

    // 5. Le solde est suffisant
    const balanceBefore = wallet.balance;
    if (balanceBefore < amount) {
      await logNFCEvent(uid, 'payment', false, 'Insufficient balance', readerId);
      return res.status(400).json({
        message: "Paiement refusé : solde insuffisant.",
        balance: balanceBefore,
        required: amount
      });
    }

    // Réinitialiser les échecs PIN (PIN correct)
    card.nfcFailures = 0;
    await card.save();

    const Transaction = require("../models/Transaction");

    // Idempotence : rejeu déjà traité → renvoyer la transaction existante (pas de re-débit)
    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey });
      if (existing) {
        return res.json({
          success: true,
          message: "Paiement déjà traité (idempotence)",
          aiDecision: null,
          data: { transaction: existing, wallet: { balance: wallet.balance } }
        });
      }
    }

    // 6. Débit du wallet (atomique : solde + transaction)
    const newBalance = balanceBefore - amount;

    // Numéro de reçu (traçabilité)
    const receiptNumber = "PAY-" + new Date().getFullYear() + "-" +
      Date.now().toString(36).toUpperCase() +
      Math.floor(100 + Math.random() * 900);

    const session = await mongoose.startSession();
    let transaction;
    try {
      await session.withTransaction(async () => {
        const created = await Transaction.create([{
          studentId: student._id,
          cardId: card._id,
          walletId: wallet._id,
          agentId: null,
          type: "payment",
          channel: "api",
          amount: amount,
          balanceBefore: balanceBefore,
          balanceAfter: newBalance,
          status: "pending",
          description: description || serviceLabel || `Paiement ${service || 'service'}`,
          pinVerified: true,
          idempotencyKey: idempotencyKey || undefined,
          metadata: {
            ...metadata,
            service: service || null,
            serviceLabel: serviceLabel || null,
            receiptNumber: receiptNumber,
            readerId: readerId,
            uid: uid.substring(0, 4) + '***'
          },
          processedAt: new Date()
        }], { session });
        transaction = created[0];

        wallet.balance = newBalance;
        wallet.lastActivity = new Date();
        await wallet.save({ session });

        transaction.status = "validated";
        await transaction.save({ session });
      });
    } finally {
      await session.endSession();
    }

    await logNFCEvent(uid, 'payment', true, null, readerId, {
      amount: amount,
      newBalance: newBalance,
      transactionId: transaction._id
    });

    await logAudit({ req, actor: { _id: student.userId, role: "student" }, action: "payment", targetType: "Transaction", targetId: transaction._id, description: `Paiement NFC de ${amount} XOF — ${student.prenom} ${student.nom} (${student.matricule}) — ${serviceLabel || service || "service"}`, oldValue: { balance: balanceBefore }, newValue: { balance: newBalance } });

    // ---- Analyse IA (non bloquante) : détection de paiement suspect ----
    let aiResult = null;
    try {
      const { predictPayment } = require("../services/aiService");
      const NFCLog = require("../models/NFCLog");
      const Transaction2 = require("../models/Transaction");
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const [recentOps, failedAttempts] = await Promise.all([
        Transaction2.countDocuments({ studentId: student._id, createdAt: { $gte: oneHourAgo } }),
        NFCLog.countDocuments({ cardUid: uidHash, success: false, timestamp: { $gte: oneHourAgo } }),
      ]);

      const features = {
        operation_type: "payment",
        amount: amount,
        hour: new Date().getHours(),
        card_status: card.status,            // "active"
        balance_before: balanceBefore,
        service_type: service || "unknown",
        recent_operations_count: recentOps,
        failed_attempts_count: failedAttempts,
        is_authorized_service: 1,            // service vérifié actif plus haut
      };

      aiResult = await predictPayment(features);

      // Création d'une alerte si le modèle juge le paiement suspect
      if (aiResult && aiResult.decision === "suspect") {
        const Alert = require("../models/Alert");
        const score = aiResult.score;
        const severity = score == null ? "medium" : (score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low");
        const alert = await Alert.create({
          transactionId: transaction._id,
          studentId: student._id,
          type: "suspicious_payment",
          service: service || null,
          amount: amount,
          score: score,
          severity: severity,
          reason: "Paiement détecté comme suspect par le modèle IA",
          metadata: { features },
        });
        await logAudit({ req, actor: { _id: student.userId, role: "student" }, action: "ai_alert_created", targetType: "Alert", targetId: alert._id, description: `Alerte IA — paiement suspect de ${amount} XOF (score ${score}, sévérité ${severity}) — ${student.prenom} ${student.nom}`, newValue: { score, severity, transactionId: transaction._id } });
      }
    } catch (aiErr) {
      logError("⚠️  Analyse IA ignorée", aiErr);
    }

    res.json({
      success: true,
      message: "Paiement effectué avec succès.",
      aiDecision: aiResult ? aiResult.decision : null,
      data: {
        transaction: transaction,
        wallet: { balance: newBalance },
        receipt: {
          receiptNumber: receiptNumber,
          service: serviceLabel || service || "Service",
          description: description || serviceLabel || "",
          studentName: `${student.prenom} ${student.nom}`,
          matricule: student.matricule,
          amount: amount,
          balanceBefore: balanceBefore,
          balanceAfter: newBalance,
          date: transaction.processedAt
        }
      }
    });

  } catch (error) {
    logError("Erreur paiement NFC", error);
    await logNFCEvent(req.body.uid, 'payment', false, error.message, req.body.readerId);
    res.status(500).json({ message: "Erreur serveur lors du paiement." });
  }
};

module.exports = {
  authenticateByCard,
  validatePinWithCard,
  rechargeByNFC,
  payByNFC,
  getReadersStatus,
  setNFCService
};