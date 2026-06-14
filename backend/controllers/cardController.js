const bcrypt = require("bcryptjs");

const Card    = require("../models/Card");
const { logError } = require("../utils/secureLogger");
const Student = require("../models/Student");
const User    = require("../models/User");
const Wallet  = require("../models/Wallet");
const { getSettings } = require("../utils/getSettings");
const sendEmail = require("../utils/sendEmail");
const { logAudit } = require("../services/auditService");

// Générer un numéro de carte lisible
const generateCardNumber = () => {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `CARD-${year}-${random}`;
};

// 1. Associer une carte à un étudiant avec création du PIN
const createCard = async (req, res) => {
  try {
    const { studentId, uid, pin, type, expiresAt } = req.body;

    if (!studentId || !uid || !pin) {
      return res.status(400).json({
        message: "studentId, uid et pin sont obligatoires.",
      });
    }

    // UID : 4 à 7 octets = 8 à 14 caractères hexadécimaux (MIFARE, NTAG, NFC)
    if (!/^[0-9A-Fa-f]{8,14}$/.test(uid)) {
      return res.status(400).json({
        message: "UID invalide. Il doit contenir entre 8 et 14 caractères hexadécimaux (ex: 04A1B2C3D4).",
      });
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({
        message: "Le PIN doit contenir entre 4 et 6 chiffres.",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        message: "Étudiant introuvable.",
      });
    }

    if (student.status !== "active") {
      return res.status(400).json({
        message: "Impossible d'associer une carte à un étudiant inactif ou désactivé.",
      });
    }

    const existingCardForStudent = await Card.findOne({ studentId });

    if (existingCardForStudent) {
      return res.status(400).json({
        message: "Cet étudiant possède déjà une carte.",
      });
    }

    const existingCardUID = await Card.findOne({ uid });

    if (existingCardUID) {
      return res.status(400).json({
        message: "Cette carte est déjà enregistrée.",
      });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const card = await Card.create({
      studentId,
      uid,
      cardNumber: generateCardNumber(),
      type: type || "RFID-NFC",
      pinHash,
      pinAttempts: 0,
      pinBlockedUntil: null,
      status: "active",
      expiresAt: expiresAt || null,
    });

    // Créer automatiquement le portefeuille associé
    try {
      await Wallet.create({
        studentId,
        cardId: card._id,
        balance: 0,
        currency: "XOF",
        status: "active",
        dailyLimit: 50000,
        monthlyLimit: 500000,
      });
    } catch (walletErr) {
      logError("Erreur création portefeuille", walletErr);
      // Ne pas bloquer la création de carte si le portefeuille échoue
    }

    // Notification email à l'étudiant (avec PIN temporaire)
    try {
      await sendEmail({
        to: student.email,
        subject: "Smart Campus — Votre carte est disponible",
        text: `Bonjour ${student.prenom} ${student.nom},

Votre carte RFID/NFC a été créée avec succès sur la plateforme Smart Campus.

Informations de votre carte :
  Numéro de carte : ${card.cardNumber}
  Type            : ${card.type}
  PIN temporaire  : ${pin}

IMPORTANT : Ce PIN est temporaire. Vous devez impérativement le modifier depuis votre espace étudiant (section "Ma carte") lors de votre première utilisation.

Veuillez également vous présenter au service de scolarité pour récupérer votre carte physique munie de votre pièce d'identité.

Cordialement,
Plateforme Smart Campus`,
      });
    } catch (emailErr) {
      logError("Email carte non envoyé", emailErr);
    }

    await logAudit({ req, action: "card_created", targetType: "Card", targetId: card._id, description: `Création de la carte ${card.cardNumber} pour ${student.prenom} ${student.nom} (${student.matricule})`, newValue: { cardNumber: card.cardNumber, type: card.type, studentId: card.studentId } });

    return res.status(201).json({
      message: "Carte créée et associée à l'étudiant avec succès.",
      card: {
        id: card._id,
        studentId: card.studentId,
        uid: card.uid,
        cardNumber: card.cardNumber,
        type: card.type,
        status: card.status,
        pinAttempts: card.pinAttempts,
        pinBlockedUntil: card.pinBlockedUntil,
        issuedAt: card.issuedAt,
        expiresAt: card.expiresAt,
      },
    });
  } catch (error) {
    logError("Erreur createCard", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la création de la carte.",
    });
  }
};

// 2. Lister toutes les cartes
const getCards = async (req, res) => {
  try {
    const cards = await Card.find()
      .populate("studentId", "matricule nom prenom email filiere niveau status")
      .select("-pinHash")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Liste des cartes récupérée avec succès.",
      count: cards.length,
      cards,
    });
  } catch (error) {
    logError("Erreur getCards", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération des cartes.",
    });
  }
};

// 3. Consulter une carte par ID
const getCardById = async (req, res) => {
  try {
    const { id } = req.params;

    const card = await Card.findById(id)
      .populate("studentId", "matricule nom prenom email filiere niveau status")
      .select("-pinHash");

    if (!card) {
      return res.status(404).json({
        message: "Carte introuvable.",
      });
    }

    return res.status(200).json({
      message: "Carte récupérée avec succès.",
      card,
    });
  } catch (error) {
    logError("Erreur getCardById", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération de la carte.",
    });
  }
};

// 4. Rechercher une carte par UID
const getCardByUID = async (req, res) => {
  try {
    const { uid } = req.params;

    const card = await Card.findOne({ uid })
      .populate("studentId", "matricule nom prenom email filiere niveau status")
      .select("-pinHash");

    if (!card) {
      return res.status(404).json({
        message: "Carte introuvable avec cet UID.",
      });
    }

    return res.status(200).json({
      message: "Carte récupérée avec succès.",
      card,
    });
  } catch (error) {
    logError("Erreur getCardByUID", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recherche par UID.",
    });
  }
};

// 5. Vérifier le PIN de la carte
const verifyCardPIN = async (req, res) => {
  try {
    const { uid, pin } = req.body;

    if (!uid || !pin) {
      return res.status(400).json({
        message: "uid et pin sont obligatoires.",
      });
    }

    const card = await Card.findOne({ uid });

    if (!card) {
      return res.status(404).json({
        message: "Carte introuvable.",
      });
    }

    if (card.status !== "active") {
      return res.status(403).json({
        message: "Carte non active. Opération refusée.",
      });
    }

    if (card.pinBlockedUntil && card.pinBlockedUntil > new Date()) {
      return res.status(403).json({
        message: "PIN temporairement bloqué. Veuillez réessayer plus tard.",
        pinBlockedUntil: card.pinBlockedUntil,
      });
    }

    const isPINValid = await bcrypt.compare(pin, card.pinHash);

    if (!isPINValid) {
      card.pinAttempts += 1;

      const s = await getSettings();
      if (card.pinAttempts >= s.pin.maxAttempts) {
        card.pinBlockedUntil = new Date(Date.now() + s.pin.blockDurationMinutes * 60 * 1000);
        await card.save();

        return res.status(403).json({
          message: "PIN incorrect. Carte/PIN bloqué temporairement après 3 tentatives.",
          pinAttempts: card.pinAttempts,
          pinBlockedUntil: card.pinBlockedUntil,
        });
      }

      await card.save();

      return res.status(401).json({
        message: "PIN incorrect.",
        pinAttempts: card.pinAttempts,
      });
    }

    card.pinAttempts = 0;
    card.pinBlockedUntil = null;
    await card.save();

    return res.status(200).json({
      message: "PIN vérifié avec succès.",
      pinVerified: true,
    });
  } catch (error) {
    logError("Erreur verifyCardPIN", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la vérification du PIN.",
    });
  }
};

// 6. Modifier le PIN d'une carte
const changeCardPIN = async (req, res) => {
  try {
    const { id } = req.params;
    const { oldPin, newPin } = req.body;

    if (!oldPin || !newPin) {
      return res.status(400).json({
        message: "Ancien PIN et nouveau PIN obligatoires.",
      });
    }

    if (newPin.length < 4 || newPin.length > 6) {
      return res.status(400).json({
        message: "Le nouveau PIN doit contenir entre 4 et 6 chiffres.",
      });
    }

    const card = await Card.findById(id);

    if (!card) {
      return res.status(404).json({
        message: "Carte introuvable.",
      });
    }

    const isOldPINValid = await bcrypt.compare(oldPin, card.pinHash);

    if (!isOldPINValid) {
      return res.status(401).json({
        message: "Ancien PIN incorrect.",
      });
    }

    card.pinHash = await bcrypt.hash(newPin, 10);
    card.pinAttempts = 0;
    card.pinBlockedUntil = null;
    await card.save();

    return res.status(200).json({
      message: "PIN de la carte modifié avec succès.",
    });
  } catch (error) {
    logError("Erreur changeCardPIN", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la modification du PIN.",
    });
  }
};

// 7. Réinitialiser le PIN par l'administrateur
const resetCardPIN = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPin } = req.body;

    if (!newPin) {
      return res.status(400).json({
        message: "Nouveau PIN obligatoire.",
      });
    }

    if (newPin.length < 4 || newPin.length > 6) {
      return res.status(400).json({
        message: "Le nouveau PIN doit contenir entre 4 et 6 chiffres.",
      });
    }

    const card = await Card.findById(id);

    if (!card) {
      return res.status(404).json({
        message: "Carte introuvable.",
      });
    }

    card.pinHash = await bcrypt.hash(newPin, 10);
    card.pinAttempts = 0;
    card.pinBlockedUntil = null;
    await card.save();

    return res.status(200).json({
      message: "PIN réinitialisé avec succès par l'administrateur.",
    });
  } catch (error) {
    logError("Erreur resetCardPIN", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la réinitialisation du PIN.",
    });
  }
};

// 8. Changer le statut de la carte
const updateCardStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["active", "blocked", "lost", "expired", "disabled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message:
          "Statut invalide. Valeurs possibles : active, blocked, lost, expired, disabled.",
      });
    }

    const card = await Card.findById(id);

    if (!card) {
      return res.status(404).json({
        message: "Carte introuvable.",
      });
    }

    const oldStatus = card.status;
    card.status = status;
    await card.save();

    await logAudit({ req, action: status === "blocked" ? "card_blocked" : "card_status_updated", targetType: "Card", targetId: card._id, description: `Carte ${card.cardNumber} : ${oldStatus} → ${status}`, oldValue: { status: oldStatus }, newValue: { status } });

    return res.status(200).json({
      message: "Statut de la carte mis à jour avec succès.",
      card: {
        id: card._id,
        uid: card.uid,
        cardNumber: card.cardNumber,
        status: card.status,
      },
    });
  } catch (error) {
    logError("Erreur updateCardStatus", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise à jour du statut de la carte.",
    });
  }
};

// 9. Modifier les caractéristiques d'une carte (type, expiration)
const updateCard = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, expiresAt } = req.body;

    const allowedTypes = ["RFID-NFC", "MIFARE_CLASSIC_1K", "NTAG"];

    const card = await Card.findById(id);
    if (!card) {
      return res.status(404).json({ message: "Carte introuvable." });
    }

    if (type !== undefined) {
      if (!allowedTypes.includes(type)) {
        return res.status(400).json({ message: "Type de carte invalide." });
      }
      card.type = type;
    }

    if (expiresAt !== undefined) {
      if (expiresAt === null || expiresAt === "") {
        card.expiresAt = null;
      } else {
        const d = new Date(expiresAt);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ message: "Date d'expiration invalide." });
        }
        if (d <= new Date()) {
          return res.status(400).json({ message: "La date d'expiration doit être dans le futur." });
        }
        card.expiresAt = d;
      }
    }

    await card.save();

    return res.status(200).json({
      message: "Carte mise à jour avec succès.",
      card: {
        id:        card._id,
        cardNumber:card.cardNumber,
        type:      card.type,
        expiresAt: card.expiresAt,
        status:    card.status,
      },
    });
  } catch (error) {
    logError("Erreur updateCard", error);
    return res.status(500).json({ message: "Erreur serveur lors de la mise à jour." });
  }
};

module.exports = {
  createCard,
  getCards,
  getCardById,
  getCardByUID,
  verifyCardPIN,
  changeCardPIN,
  resetCardPIN,
  updateCardStatus,
  updateCard,
};