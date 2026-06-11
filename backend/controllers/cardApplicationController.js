const CardApplication = require("../models/CardApplication");
const sendEmail       = require("../utils/sendEmail");

// ── 1. Lister les demandes (admin) ────────────────────────────────────────────
const getApplications = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const applications = await CardApplication.find(filter)
      .populate("studentId", "matricule nom prenom email filiere niveau departement")
      .populate("processedBy", "nom prenom email")
      .sort({ createdAt: -1 });

    return res.status(200).json({ count: applications.length, applications });
  } catch (error) {
    console.error("Erreur getApplications :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 2. Approuver le dossier d'inscription (sans créer la carte) ──────────────
const approveApplication = async (req, res) => {
  try {
    const { id } = req.params;

    const application = await CardApplication.findById(id)
      .populate("studentId", "prenom nom email matricule filiere niveau");

    if (!application) {
      return res.status(404).json({ message: "Dossier introuvable." });
    }

    if (application.status !== "pending") {
      return res.status(400).json({ message: `Dossier déjà ${application.status}.` });
    }

    application.status      = "approved";
    application.processedBy = req.user._id;
    await application.save();

    const s = application.studentId;

    await sendEmail({
      to: s.email,
      subject: "Smart Campus — Votre dossier d'inscription a été validé",
      text: `Bonjour ${s.prenom} ${s.nom},

Votre dossier d'inscription au service de scolarité a été validé avec succès.

Votre carte étudiant est en cours de préparation.
Vous recevrez un email dès qu'elle sera disponible et pourrez alors vous présenter au service de scolarité pour la récupérer muni(e) de votre pièce d'identité.

Matricule : ${s.matricule}
Filière   : ${s.filiere}
Niveau    : ${s.niveau}

Cordialement,
Plateforme Smart Campus`,
    });

    return res.status(200).json({
      message: "Dossier d'inscription approuvé. L'étudiant a été notifié par email.",
    });
  } catch (error) {
    console.error("Erreur approveApplication :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 3. Rejeter une demande ────────────────────────────────────────────────────
const rejectApplication = async (req, res) => {
  try {
    const { id }     = req.params;
    const { reason } = req.body;

    const application = await CardApplication.findById(id)
      .populate("studentId", "prenom nom email");

    if (!application) {
      return res.status(404).json({ message: "Demande introuvable." });
    }

    if (application.status !== "pending") {
      return res.status(400).json({ message: `Demande déjà ${application.status}.` });
    }

    application.status          = "rejected";
    application.rejectionReason = reason || null;
    application.processedBy     = req.user._id;
    await application.save();

    const s = application.studentId;
    await sendEmail({
      to: s.email,
      subject: "Smart Campus — Demande de carte refusée",
      text: `Bonjour ${s.prenom} ${s.nom},

Votre demande de carte étudiant a été refusée.
${reason ? `\nMotif : ${reason}` : ""}

Veuillez contacter l'administration pour plus d'informations.

Cordialement,
Plateforme Smart Campus`,
    });

    return res.status(200).json({ message: "Demande rejetée." });
  } catch (error) {
    console.error("Erreur rejectApplication :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = { getApplications, approveApplication, rejectApplication };
