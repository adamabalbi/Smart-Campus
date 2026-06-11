const bcrypt          = require("bcryptjs");
const Student         = require("../models/Student");
const Card            = require("../models/Card");
const Wallet          = require("../models/Wallet");
const CardApplication = require("../models/CardApplication");

// ── 1. Profil complet ─────────────────────────────────────────────────────────
const getMyProfile = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ message: "Profil étudiant introuvable." });
    }

    const [card, wallet, cardApplication] = await Promise.all([
      Card.findOne({ studentId: student._id }).select("-pinHash"),
      Wallet.findOne({ studentId: student._id }),
      CardApplication.findOne({ studentId: student._id }),
    ]);

    return res.status(200).json({
      user: req.user,
      student,
      card:            card            || null,
      wallet:          wallet          || null,
      cardApplication: cardApplication || null,
    });
  } catch (error) {
    console.error("Erreur getMyProfile :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 2. Modifier le téléphone uniquement ───────────────────────────────────────
const updateMyProfile = async (req, res) => {
  try {
    const { telephone } = req.body;

    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ message: "Profil étudiant introuvable." });
    }

    if (telephone !== undefined) student.telephone = telephone.trim() || null;

    await student.save();

    return res.status(200).json({
      message: "Téléphone mis à jour.",
      telephone: student.telephone,
    });
  } catch (error) {
    console.error("Erreur updateMyProfile :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 3. Notifications système ──────────────────────────────────────────────────
const getMyNotifications = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    const card    = student ? await Card.findOne({ studentId: student._id }) : null;

    const notifications = [];

    notifications.push({
      id:      "account_created",
      type:    "success",
      message: "Votre compte a été créé avec succès.",
      date:    req.user.createdAt,
    });

    if (req.user.mustChangePassword) {
      notifications.push({
        id:      "change_password",
        type:    "warning",
        message: "Veuillez changer votre mot de passe temporaire dès que possible.",
        date:    req.user.createdAt,
      });
    }

    if (!card) {
      const cardApp = await CardApplication.findOne({ studentId: student?._id });

      if (!cardApp) {
        notifications.push({
          id:      "complete_card_application",
          type:    "warning",
          message: "Étape suivante : complétez votre dossier de demande de carte étudiant. Rendez-vous dans la section \"Ma carte\".",
          date:    req.user.createdAt,
        });
      } else if (cardApp.status === "pending") {
        notifications.push({
          id:      "card_app_pending",
          type:    "info",
          message: "Votre demande de carte est en cours de traitement par l'administration. Vous recevrez un email dès qu'elle sera validée.",
          date:    cardApp.createdAt,
        });
      } else if (cardApp.status === "rejected") {
        notifications.push({
          id:      "card_app_rejected",
          type:    "warning",
          message: `Votre demande de carte a été refusée.${cardApp.rejectionReason ? ` Motif : ${cardApp.rejectionReason}` : " Contactez l'administration."}`,
          date:    cardApp.updatedAt,
        });
      }
    } else {
      notifications.push({
        id:      "card_ready",
        type:    "success",
        message: `Votre carte virtuelle (${card.cardNumber}) est disponible. Veuillez vous présenter au service de scolarité pour récupérer votre carte physique munie de votre pièce d'identité.`,
        date:    card.issuedAt,
      });

      if (card.mustChangePIN) {
        notifications.push({
          id:      "pin_change_required",
          type:    "warning",
          message: "Vous devez changer votre PIN temporaire. Rendez-vous dans la section \"Ma carte\" de votre espace étudiant.",
          date:    card.issuedAt,
        });
      }

      if (card.status === "blocked") {
        notifications.push({
          id:      "card_blocked",
          type:    "warning",
          message: "Votre carte est actuellement bloquée. Contactez l'administration.",
          date:    new Date(),
        });
      }
    }

    return res.status(200).json({ notifications });
  } catch (error) {
    console.error("Erreur getMyNotifications :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 4. Soumettre une demande de carte ─────────────────────────────────────────
const submitCardApplication = async (req, res) => {
  try {
    const { anneeAcademique, photoUrl, notes } = req.body;

    if (!anneeAcademique) {
      return res.status(400).json({ message: "L'année académique est obligatoire." });
    }

    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ message: "Profil étudiant introuvable." });
    }

    const existingCard = await Card.findOne({ studentId: student._id });
    if (existingCard) {
      return res.status(400).json({ message: "Vous possédez déjà une carte." });
    }

    const existingApp = await CardApplication.findOne({ studentId: student._id });
    if (existingApp) {
      return res.status(400).json({
        message: `Une demande est déjà en cours (statut : ${existingApp.status}).`,
      });
    }

    const application = await CardApplication.create({
      studentId: student._id,
      anneeAcademique: anneeAcademique.trim(),
      photoUrl: photoUrl?.trim() || null,
      notes:    notes?.trim()    || null,
    });

    return res.status(201).json({
      message: "Demande de carte soumise avec succès. L'administration va traiter votre dossier.",
      application,
    });
  } catch (error) {
    console.error("Erreur submitCardApplication :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 5. Changer le PIN de sa carte ─────────────────────────────────────────────
const changeMyPIN = async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;

    if (!currentPin || !newPin) {
      return res.status(400).json({ message: "PIN actuel et nouveau PIN obligatoires." });
    }

    if (!/^\d{4,6}$/.test(newPin)) {
      return res.status(400).json({ message: "Le nouveau PIN doit contenir entre 4 et 6 chiffres." });
    }

    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ message: "Profil étudiant introuvable." });
    }

    const card = await Card.findOne({ studentId: student._id });
    if (!card) {
      return res.status(404).json({ message: "Aucune carte associée à votre compte." });
    }

    if (card.status !== "active") {
      return res.status(403).json({ message: "Votre carte n'est pas active." });
    }

    const isValid = await bcrypt.compare(currentPin, card.pinHash);
    if (!isValid) {
      return res.status(401).json({ message: "PIN actuel incorrect." });
    }

    if (currentPin === newPin) {
      return res.status(400).json({ message: "Le nouveau PIN doit être différent de l'ancien." });
    }

    card.pinHash       = await bcrypt.hash(newPin, 10);
    card.mustChangePIN = false;
    card.pinAttempts   = 0;
    card.pinBlockedUntil = null;
    await card.save();

    return res.status(200).json({ message: "PIN modifié avec succès." });
  } catch (error) {
    console.error("Erreur changeMyPIN :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = { getMyProfile, updateMyProfile, getMyNotifications, submitCardApplication, changeMyPIN };
