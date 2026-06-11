const bcrypt = require("bcryptjs");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const Student = require("../models/Student");
const Card = require("../models/Card");
const { getSettings } = require("../utils/getSettings");
const { logAudit } = require("../services/auditService");

// Récupérer le portefeuille d'un étudiant
const getWallet = async (req, res) => {
  try {
    const { studentId } = req.params;

    const wallet = await Wallet.findOne({ studentId })
      .populate("studentId", "nom prenom matricule email")
      .populate("cardId", "uid status");

    if (!wallet) {
      return res.status(404).json({
        message: "Portefeuille introuvable.",
      });
    }

    return res.status(200).json({
      message: "Portefeuille récupéré avec succès.",
      wallet,
    });
  } catch (error) {
    console.error("Erreur getWallet :", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération du portefeuille.",
    });
  }
};

// Récupérer le portefeuille par UID de carte
const getWalletByCardUID = async (req, res) => {
  try {
    const { uid } = req.params;
    console.log("🔍 Recherche carte avec UID:", uid);
    console.log("👤 Utilisateur authentifié:", req.user ? req.user.email : "non authentifié");

    const card = await Card.findOne({ uid: uid.toUpperCase() });
    console.log("🔗 Carte trouvée:", card ? `ID: ${card._id}, Status: ${card.status}` : "Aucune carte trouvée");

    if (!card) {
      console.log("❌ Carte introuvable pour UID:", uid);
      return res.status(404).json({
        message: "Carte introuvable.",
      });
    }

    const wallet = await Wallet.findOne({ cardId: card._id })
      .populate("studentId", "nom prenom matricule email")
      .populate("cardId", "uid status");

    console.log("💳 Portefeuille trouvé:", wallet ? `ID: ${wallet._id}, Balance: ${wallet.balance}` : "Aucun portefeuille trouvé");

    if (!wallet) {
      console.log("❌ Portefeuille introuvable pour carte ID:", card._id);
      return res.status(404).json({
        message: "Portefeuille introuvable pour cette carte.",
      });
    }

    console.log("✅ Succès - Portefeuille récupéré pour:", wallet.studentId.nom);
    return res.status(200).json({
      message: "Portefeuille récupéré avec succès.",
      wallet,
      card,
    });
  } catch (error) {
    console.error("Erreur getWalletByCardUID :", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération du portefeuille.",
    });
  }
};

// Vérifications avant recharge
const validateRechargeConditions = async (card, student, wallet, pin, amount) => {
  console.log("🔐 DEBUG: Validation des conditions de recharge");
  console.log("🔐 DEBUG: Card PIN défini:", !!card?.pinHash);
  console.log("🔐 DEBUG: PIN saisi:", pin ? "Oui" : "Non");
  console.log("🔐 DEBUG: Card PIN (début):", card?.pinHash?.substring(0, 10) + "...");

  const errors = [];

  // Vérifier que la carte existe et est active
  if (!card || card.status !== "active") {
    errors.push("Carte inactive ou introuvable.");
  }

  // Vérifier que l'étudiant existe et est actif
  if (!student || student.status !== "active") {
    errors.push("Étudiant inactif ou introuvable.");
  }

  // Vérifier que le portefeuille existe et est actif
  if (!wallet || wallet.status !== "active") {
    errors.push("Portefeuille inactif ou introuvable.");
  }

  // Vérifier le PIN si fourni
  if (pin && card) {
    if (!card.pinHash) {
      console.log("❌ DEBUG: PIN de la carte non défini en base!");
      errors.push("PIN de la carte non configuré.");
    } else {
      console.log("🔐 DEBUG: Comparaison PIN en cours...");
      const isPinValid = await bcrypt.compare(pin, card.pinHash);
      console.log("🔐 DEBUG: PIN valide:", isPinValid);
      if (!isPinValid) {
        errors.push("Code PIN incorrect.");
      }
    }
  }

  // Vérifier le montant
  if (!amount || amount <= 0) {
    errors.push("Montant invalide.");
  }

  // Vérifier les plafonds (exemple simple)
  if (amount > 100000) { // 100,000 XOF max par recharge
    errors.push("Montant dépassant la limite autorisée.");
  }

  return errors;
};

// Recharge par agent
const rechargeByAgent = async (req, res) => {
  try {
    console.log("💳 DEBUG: Début recharge par agent");
    const { uid, amount, pin } = req.body;
    const agentId = req.user._id;
    console.log("💳 DEBUG: Données reçues - UID:", uid, "Montant:", amount, "Agent:", req.user.email);

    if (!uid || !amount || !pin) {
      console.log("❌ DEBUG: Données manquantes", { uid: !!uid, amount: !!amount, pin: !!pin });
      return res.status(400).json({
        message: "UID de carte, montant et PIN requis.",
      });
    }

    // Récupérer la carte et les données associées
    const card = await Card.findOne({ uid: uid.toUpperCase() });
    if (!card) {
      return res.status(404).json({
        message: "Carte introuvable.",
      });
    }

    const student = await Student.findById(card.studentId);
    const wallet = await Wallet.findOne({ cardId: card._id });

    // Vérifications avant recharge
    const validationErrors = await validateRechargeConditions(
      card, student, wallet, pin, parseFloat(amount)
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: validationErrors.join(" "),
      });
    }

    // Calculer les nouveaux soldes
    const rechargeAmount = parseFloat(amount);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + rechargeAmount;

    // Créer la transaction
    const transaction = await Transaction.create({
      studentId: student._id,
      cardId: card._id,
      walletId: wallet._id,
      agentId,
      type: "recharge",
      channel: "agent",
      amount: rechargeAmount,
      balanceBefore,
      balanceAfter,
      status: "validated",
      description: "Recharge effectuée par un agent habilité",
      pinVerified: true,
      processedAt: new Date(),
    });

    // Mettre à jour le solde du portefeuille
    wallet.balance = balanceAfter;
    wallet.lastActivity = new Date();
    await wallet.save();

    await logAudit({ req, actor: { _id: student.userId, role: "student" }, action: "recharge", targetType: "Transaction", targetId: transaction._id, description: `Recharge agent de ${rechargeAmount} XOF — ${student.prenom} ${student.nom} (${student.matricule})`, oldValue: { balance: balanceBefore }, newValue: { balance: balanceAfter } });

    return res.status(200).json({
      message: "Recharge effectuée avec succès.",
      transaction: {
        id: transaction._id,
        amount: rechargeAmount,
        balanceBefore,
        balanceAfter,
        createdAt: transaction.createdAt,
      },
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
      },
    });
  } catch (error) {
    console.error("Erreur rechargeByAgent :", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recharge.",
    });
  }
};

// Recharge via borne (kiosk)
const rechargeByKiosk = async (req, res) => {
  try {
    const { uid, amount, pin } = req.body;

    if (!uid || !amount || !pin) {
      return res.status(400).json({
        message: "UID de carte, montant et PIN requis.",
      });
    }

    // Récupérer la carte et les données associées
    const card = await Card.findOne({ uid: uid.toUpperCase() });
    if (!card) {
      return res.status(404).json({
        message: "Carte introuvable.",
      });
    }

    const student = await Student.findById(card.studentId);
    const wallet = await Wallet.findOne({ cardId: card._id });

    // Vérifications avant recharge
    const validationErrors = await validateRechargeConditions(
      card, student, wallet, pin, parseFloat(amount)
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: validationErrors.join(" "),
      });
    }

    // Calculer les nouveaux soldes
    const rechargeAmount = parseFloat(amount);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + rechargeAmount;

    // Créer la transaction
    const transaction = await Transaction.create({
      studentId: student._id,
      cardId: card._id,
      walletId: wallet._id,
      agentId: null,
      type: "recharge",
      channel: "kiosk",
      amount: rechargeAmount,
      balanceBefore,
      balanceAfter,
      status: "validated",
      description: "Recharge effectuée via borne électronique",
      pinVerified: true,
      processedAt: new Date(),
      metadata: {
        kioskId: req.ip, // Utiliser l'IP comme identifiant temporaire
        receiptNumber: `REC${Date.now()}`,
      },
    });

    // Mettre à jour le solde du portefeuille
    wallet.balance = balanceAfter;
    wallet.lastActivity = new Date();
    await wallet.save();

    await logAudit({ req, actor: { _id: student.userId, role: "student" }, action: "recharge", targetType: "Transaction", targetId: transaction._id, description: `Recharge kiosk de ${rechargeAmount} XOF — ${student.prenom} ${student.nom} (${student.matricule})`, oldValue: { balance: balanceBefore }, newValue: { balance: balanceAfter } });

    return res.status(200).json({
      message: "Recharge effectuée avec succès.",
      transaction: {
        id: transaction._id,
        amount: rechargeAmount,
        balanceBefore,
        balanceAfter,
        receiptNumber: transaction.metadata.receiptNumber,
        createdAt: transaction.createdAt,
      },
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
      },
    });
  } catch (error) {
    console.error("Erreur rechargeByKiosk :", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recharge.",
    });
  }
};

// Historique des transactions d'un étudiant
const getTransactionHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { page = 1, limit = 20, type } = req.query;

    const filter = { studentId };
    if (type) filter.type = type;

    const transactions = await Transaction.find(filter)
      .populate("agentId", "nom prenom")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(filter);

    return res.status(200).json({
      message: "Historique récupéré avec succès.",
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Erreur getTransactionHistory :", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération de l'historique.",
    });
  }
};

// Historique des recharges effectuées par un agent
const getAgentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, date, channel } = req.query;

    // Vue globale : toutes les recharges (agent + bornes kiosque)
    const filter = {
      type: type || "recharge",
    };

    // Filtre optionnel par canal si fourni (agent / kiosk)
    if (channel) {
      filter.channel = channel;
    }

    // Filtre par date si fourni
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);

      filter.createdAt = {
        $gte: startDate,
        $lt: endDate
      };
    }

    const transactions = await Transaction.find(filter)
      .populate({
        path: "studentId",
        select: "nom prenom matricule"
      })
      .populate({
        path: "agentId",
        select: "nom prenom"
      })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(filter);

    // Formater les données pour l'affichage
    const formattedTransactions = transactions.map(t => {
      const obj = t.toObject();
      // Source : nom de l'agent OU localisation de la borne
      let source;
      if (t.channel === "agent") {
        source = t.agentId ? `Agent : ${t.agentId.prenom} ${t.agentId.nom}` : "Agent";
      } else if (t.channel === "kiosk") {
        source = `Borne : ${obj.metadata?.location || "—"}`;
      } else {
        source = t.channel;
      }
      return {
        ...obj,
        studentName: t.studentId ? `${t.studentId.prenom} ${t.studentId.nom}` : null,
        studentMatricule: t.studentId ? t.studentId.matricule : null,
        channel: t.channel,
        source,
        receiptNumber: obj.metadata?.receiptNumber || null,
      };
    });

    return res.status(200).json({
      message: "Historique récupéré avec succès.",
      transactions: formattedTransactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Erreur getAgentHistory :", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération de l'historique.",
    });
  }
};

// Diagnostic des cartes et portefeuilles
const diagnosticWallets = async (req, res) => {
  try {
    const cards = await Card.find()
      .populate("studentId", "nom prenom matricule")
      .select("uid studentId status");

    const wallets = await Wallet.find()
      .populate("studentId", "nom prenom matricule")
      .populate("cardId", "uid")
      .select("studentId cardId balance status");

    const diagnosticData = cards.map(card => {
      const wallet = wallets.find(w => w.cardId && w.cardId._id.toString() === card._id.toString());
      return {
        cardUID: card.uid,
        studentName: card.studentId ? `${card.studentId.prenom} ${card.studentId.nom}` : "N/A",
        studentMatricule: card.studentId ? card.studentId.matricule : "N/A",
        cardStatus: card.status,
        hasWallet: !!wallet,
        walletBalance: wallet ? wallet.balance : 0,
        walletStatus: wallet ? wallet.status : "N/A"
      };
    });

    return res.status(200).json({
      message: "Diagnostic terminé",
      totalCards: cards.length,
      totalWallets: wallets.length,
      cardsWithoutWallet: diagnosticData.filter(d => !d.hasWallet).length,
      data: diagnosticData
    });
  } catch (error) {
    console.error("Erreur diagnosticWallets :", error);
    return res.status(500).json({
      message: "Erreur serveur lors du diagnostic.",
    });
  }
};

// Créer les portefeuilles manquants pour toutes les cartes
const createMissingWallets = async (req, res) => {
  try {
    const cards = await Card.find().populate("studentId");
    let created = 0;

    for (const card of cards) {
      if (card.studentId) {
        // Vérifier si le portefeuille existe déjà
        const existingWallet = await Wallet.findOne({
          $or: [
            { studentId: card.studentId._id },
            { cardId: card._id }
          ]
        });

        if (!existingWallet) {
          await Wallet.create({
            studentId: card.studentId._id,
            cardId: card._id,
            balance: 0,
            currency: "XOF",
            status: "active",
            dailyLimit: 50000,
            monthlyLimit: 500000,
          });
          created++;
        }
      }
    }

    return res.status(200).json({
      message: `${created} portefeuille(s) manquant(s) créé(s) avec succès.`,
      created,
      totalCards: cards.length
    });
  } catch (error) {
    console.error("Erreur createMissingWallets :", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la création des portefeuilles.",
    });
  }
};

// Créer un portefeuille pour un nouvel étudiant
const createWallet = async (req, res) => {
  try {
    const { studentId, cardId } = req.body;

    if (!studentId || !cardId) {
      return res.status(400).json({
        message: "studentId et cardId requis.",
      });
    }

    // Vérifier que le portefeuille n'existe pas déjà
    const existingWallet = await Wallet.findOne({ studentId });
    if (existingWallet) {
      return res.status(400).json({
        message: "Un portefeuille existe déjà pour cet étudiant.",
      });
    }

    const wallet = await Wallet.create({
      studentId,
      cardId,
      balance: 0,
      currency: "XOF",
      status: "active",
    });

    return res.status(201).json({
      message: "Portefeuille créé avec succès.",
      wallet,
    });
  } catch (error) {
    console.error("Erreur createWallet :", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la création du portefeuille.",
    });
  }
};

module.exports = {
  getWallet,
  getWalletByCardUID,
  rechargeByAgent,
  rechargeByKiosk,
  getTransactionHistory,
  getAgentHistory,
  diagnosticWallets,
  createMissingWallets,
  createWallet,
};