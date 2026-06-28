const crypto  = require("crypto");
const { logError } = require("../utils/secureLogger");
const bcrypt   = require("bcryptjs");
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);

const StudentRegistration = require("../models/StudentRegistration");
const User    = require("../models/User");
const Student = require("../models/Student");
const Wallet  = require("../models/Wallet");

const generateTempPassword = require("../utils/generateTempPassword");
const sendEmail            = require("../utils/sendEmail");
const { logAudit }         = require("../services/auditService");

// ── 1. Soumettre une demande d'inscription (public) ──────────────────────────
const submitRegistration = async (req, res) => {
  try {
    const { nom, prenom, email, telephone, filiere, niveau, departement } = req.body;

    if (!nom || !prenom || !email || !filiere || !niveau) {
      return res.status(400).json({ message: "Veuillez remplir tous les champs obligatoires." });
    }

    // Sécurité : valider le format des champs texte libres saisis publiquement.
    // Empêche l'injection de balises HTML/scripts (XSS stocké rendu plus tard
    // dans les tableaux de bord du personnel). Mêmes règles que la création de
    // comptes staff (validateUserCreation).
    const NAME_RE = /^[a-zA-ZÀ-ÿ\s'-]{2,50}$/;
    const TEXT_RE = /^[a-zA-ZÀ-ÿ0-9\s'._-]{1,60}$/;
    if (!NAME_RE.test(nom) || !NAME_RE.test(prenom)) {
      return res.status(400).json({ message: "Nom/prénom invalide (2 à 50 lettres)." });
    }
    if (!TEXT_RE.test(filiere) || !TEXT_RE.test(niveau) || (departement && !TEXT_RE.test(departement))) {
      return res.status(400).json({ message: "Filière, niveau ou département invalide." });
    }
    if (telephone && !/^[0-9 +().-]{6,20}$/.test(telephone)) {
      return res.status(400).json({ message: "Numéro de téléphone invalide." });
    }

    const existingReg  = await StudentRegistration.findOne({ email });
    const existingUser = await User.findOne({ email });

    if (existingReg || existingUser) {
      return res.status(400).json({ message: "Cet email est déjà utilisé." });
    }

    const emailToken          = crypto.randomBytes(32).toString("hex");
    const emailTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const registration = await StudentRegistration.create({
      nom, prenom, email, telephone, filiere, niveau, departement,
      emailToken,
      emailTokenExpiresAt,
    });

    // URL publique du backend : priorité à PUBLIC_BACKEND_URL, sinon déduite de
    // la requête (protocole/host réels, corrects derrière le proxy Render grâce
    // à app.set('trust proxy')). Évite le localhost codé en dur sur le cloud.
    const baseUrl = (process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const verifyUrl = `${baseUrl}/api/registration/verify-email/${emailToken}`;

    await sendEmail({
      to: email,
      subject: "Smart Campus — Confirmez votre adresse email",
      text: `Bonjour ${prenom} ${nom},

Merci de votre demande d'inscription sur la plateforme Smart Campus.

Cliquez sur le lien suivant pour confirmer votre adresse email :
${verifyUrl}

Ce lien expire dans 24 heures.

Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.

Cordialement,
Plateforme Smart Campus`,
    });

    await logAudit({ req, action: "registration_submitted", targetType: "StudentRegistration", targetId: registration._id, description: `Demande d'inscription soumise — ${prenom} ${nom} (${email})` });

    return res.status(201).json({
      message: "Demande enregistrée. Un email de confirmation a été envoyé.",
      registrationId: registration._id,
    });
  } catch (error) {
    logError("Erreur submitRegistration", error);
    return res.status(500).json({ message: "Erreur serveur lors de l'inscription." });
  }
};

// ── 2. Vérifier l'email via le lien (public) ─────────────────────────────────
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const registration = await StudentRegistration.findOne({ emailToken: token });

    const html = (title, msg, color) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f3f4f6; margin:0; }
    .box { background:#fff; border-radius:10px; padding:2rem; max-width:420px; text-align:center; box-shadow:0 4px 16px rgba(0,0,0,.08); }
    h2 { color:${color}; margin-bottom:.5rem; }
    p  { color:#6b7280; font-size:14px; }
  </style>
</head>
<body>
  <div class="box">
    <h2>${title}</h2>
    <p>${msg}</p>
  </div>
</body>
</html>`;

    if (!registration) {
      return res.status(400).send(html(
        "Lien invalide",
        "Ce lien de vérification est invalide ou a déjà été utilisé.",
        "#dc2626"
      ));
    }

    if (registration.emailTokenExpiresAt < new Date()) {
      return res.status(400).send(html(
        "Lien expiré",
        "Ce lien de vérification a expiré. Veuillez soumettre une nouvelle demande.",
        "#d97706"
      ));
    }

    if (registration.status !== "pending_email_verification") {
      return res.status(200).send(html(
        "Déjà vérifié",
        "Votre email a déjà été confirmé. Votre dossier est en cours de traitement.",
        "#2563eb"
      ));
    }

    registration.status              = "email_verified";
    registration.emailToken          = null;
    registration.emailTokenExpiresAt = null;
    await registration.save();

    await logAudit({ req, action: "registration_email_verified", targetType: "StudentRegistration", targetId: registration._id, description: `Email confirmé — ${registration.email}` });

    return res.status(200).send(html(
      "Email confirmé ✓",
      "Votre adresse email a été vérifiée avec succès. Votre dossier est maintenant en attente de validation par l'administration.",
      "#16a34a"
    ));
  } catch (error) {
    logError("Erreur verifyEmail", error);
    return res.status(500).send("<p>Erreur serveur.</p>");
  }
};

// ── 3. Lister les inscriptions (admin / super_admin) ─────────────────────────
const getRegistrations = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const registrations = await StudentRegistration.find(filter)
      .populate("processedBy", "nom prenom email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Liste des inscriptions récupérée.",
      count: registrations.length,
      registrations,
    });
  } catch (error) {
    logError("Erreur getRegistrations", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// Génère un matricule unique : ETU + année + séquence 4 chiffres
const generateMatricule = async () => {
  const year  = new Date().getFullYear();
  const count = await Student.countDocuments();
  let matricule;
  let attempts = 0;

  do {
    matricule = `ETU${year}${String(count + 1 + attempts).padStart(4, "0")}`;
    attempts++;
  } while (await Student.findOne({ matricule }) && attempts < 100);

  return matricule;
};

// ── 4. Approuver une inscription (admin / super_admin) ────────────────────────
const approveRegistration = async (req, res) => {
  try {
    const { id } = req.params;

    const registration = await StudentRegistration.findById(id);
    if (!registration) {
      return res.status(404).json({ message: "Demande introuvable." });
    }

    if (registration.status !== "email_verified") {
      return res.status(400).json({
        message: `Impossible d'approuver une demande avec le statut "${registration.status}".`,
      });
    }

    const existingUser = await User.findOne({ email: registration.email });
    if (existingUser) {
      return res.status(400).json({ message: "Un compte existe déjà avec cet email." });
    }

    const matricule = await generateMatricule();

    const tempPassword   = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    const user = await User.create({
      nom:                registration.nom,
      prenom:             registration.prenom,
      email:              registration.email,
      password:           hashedPassword,
      role:               "student",
      status:             "active",
      mustChangePassword: true,
    });

    const student = await Student.create({
      userId:      user._id,
      matricule,
      nom:         registration.nom,
      prenom:      registration.prenom,
      email:       registration.email,
      telephone:   registration.telephone,
      filiere:     registration.filiere,
      niveau:      registration.niveau,
      departement: registration.departement,
      status:      "active",
    });

    // Le portefeuille est créé à l'attribution de la carte (cardController),
    // car il requiert un cardId.

    registration.status      = "approved";
    registration.processedBy = req.user._id;
    await registration.save();

    await logAudit({ req, action: "registration_approved", targetType: "Student", targetId: student._id, description: `Inscription validée — ${registration.prenom} ${registration.nom} (${matricule})`, oldValue: { status: "email_verified" }, newValue: { status: "approved", matricule } });

    await sendEmail({
      to: registration.email,
      subject: "Bienvenue sur Smart Campus — Votre compte a été validé",
      text: `Bonjour ${registration.prenom} ${registration.nom},

Votre compte Smart Campus a été validé avec succès.

Vos identifiants de connexion :

  Email     : ${registration.email}
  Matricule : ${matricule}
  Mot de passe temporaire : ${tempPassword}

PROCHAINE ÉTAPE — Obtenir votre carte étudiant :

  1. Connectez-vous sur la plateforme Smart Campus.
  2. Rendez-vous dans la section "Ma carte".
  3. Complétez votre dossier de demande de carte étudiant.
  4. Une fois validé par l'administration, votre carte sera prête.

Pour des raisons de sécurité, changez votre mot de passe temporaire dès votre première connexion.

Cordialement,
Plateforme Smart Campus`,
    });

    return res.status(200).json({
      message: "Inscription approuvée. Le compte étudiant et le portefeuille ont été créés.",
      student: { id: student._id, matricule, email: student.email },
    });
  } catch (error) {
    logError("Erreur approveRegistration", error);
    return res.status(500).json({ message: "Erreur serveur lors de l'approbation." });
  }
};

// ── 5. Rejeter une inscription (admin / super_admin) ──────────────────────────
const rejectRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const registration = await StudentRegistration.findById(id);
    if (!registration) {
      return res.status(404).json({ message: "Demande introuvable." });
    }

    if (!["email_verified", "pending_email_verification"].includes(registration.status)) {
      return res.status(400).json({ message: "Cette demande ne peut plus être rejetée." });
    }

    const previousStatus = registration.status;
    registration.status          = "rejected";
    registration.rejectionReason = reason || null;
    registration.processedBy     = req.user._id;
    await registration.save();

    await logAudit({ req, action: "registration_rejected", targetType: "StudentRegistration", targetId: registration._id, description: `Inscription refusée — ${registration.email}${reason ? ` (motif : ${reason})` : ""}`, oldValue: { status: previousStatus }, newValue: { status: "rejected", reason: reason || null } });

    await sendEmail({
      to: registration.email,
      subject: "Smart Campus — Demande d'inscription refusée",
      text: `Bonjour ${registration.prenom} ${registration.nom},

Votre demande d'inscription sur la plateforme Smart Campus a été refusée.
${reason ? `\nMotif : ${reason}` : ""}

Pour toute question, contactez l'administration.

Cordialement,
Plateforme Smart Campus`,
    });

    return res.status(200).json({ message: "Inscription rejetée." });
  } catch (error) {
    logError("Erreur rejectRegistration", error);
    return res.status(500).json({ message: "Erreur serveur lors du rejet." });
  }
};

module.exports = {
  submitRegistration,
  verifyEmail,
  getRegistrations,
  approveRegistration,
  rejectRegistration,
};
