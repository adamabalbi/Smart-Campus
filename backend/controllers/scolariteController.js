const Student         = require("../models/Student");
const Card            = require("../models/Card");
const CardApplication = require("../models/CardApplication");
const sendEmail       = require("../utils/sendEmail");
const { logAudit }    = require("../services/auditService");

// ── 1. Demandes d'inscription en attente ──────────────────────────────────────
const getEnrollmentRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const applications = await CardApplication.find(filter)
      .populate({
        path: "studentId",
        select: "matricule nom prenom email filiere niveau departement statutScolarite commentaireScolarite status",
      })
      .populate("processedBy", "nom prenom")
      .sort({ createdAt: -1 });

    return res.status(200).json({ count: applications.length, applications });
  } catch (error) {
    console.error("Erreur getEnrollmentRequests :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 2. Liste des étudiants inscrits ───────────────────────────────────────────
const getEnrolledStudents = async (req, res) => {
  try {
    const { statutScolarite } = req.query;
    const filter = statutScolarite ? { statutScolarite } : {};

    const students = await Student.find(filter)
      .sort({ createdAt: -1 });

    // Récupère le statut carte pour chaque étudiant
    const studentIds = students.map(s => s._id);
    const cards = await Card.find({ studentId: { $in: studentIds } })
      .select("studentId status");

    const cardMap = {};
    cards.forEach(c => { cardMap[c.studentId.toString()] = c.status; });

    const result = students.map(s => ({
      ...s.toObject(),
      statutCarte: cardMap[s._id.toString()] || null,
    }));

    return res.status(200).json({ count: result.length, students: result });
  } catch (error) {
    console.error("Erreur getEnrolledStudents :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 3. Modifier le statut de scolarité d'un étudiant ─────────────────────────
const updateStatutScolarite = async (req, res) => {
  try {
    const { id } = req.params;
    const { statutScolarite, commentaire } = req.body;

    const allowed = ["en_attente", "en_regle", "non_en_regle", "paiement_partiel", "exonere"];
    if (!allowed.includes(statutScolarite)) {
      return res.status(400).json({ message: "Statut de scolarité invalide." });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: "Étudiant introuvable." });
    }

    const oldStatut = student.statutScolarite;
    student.statutScolarite        = statutScolarite;
    student.commentaireScolarite   = commentaire?.trim() || null;
    await student.save();

    await logAudit({ req, action: "scolarite_updated", targetType: "Student", targetId: student._id, description: `Statut scolarité de ${student.prenom} ${student.nom} (${student.matricule}) : ${oldStatut} → ${statutScolarite}`, oldValue: { statutScolarite: oldStatut }, newValue: { statutScolarite, commentaire: student.commentaireScolarite } });

    return res.status(200).json({
      message: "Statut de scolarité mis à jour.",
      statutScolarite:      student.statutScolarite,
      commentaireScolarite: student.commentaireScolarite,
    });
  } catch (error) {
    console.error("Erreur updateStatutScolarite :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 4. Valider une demande d'inscription ──────────────────────────────────────
const validateEnrollment = async (req, res) => {
  try {
    const { id } = req.params;

    const application = await CardApplication.findById(id)
      .populate("studentId", "prenom nom email matricule filiere niveau statutScolarite");

    if (!application) {
      return res.status(404).json({ message: "Demande introuvable." });
    }

    if (application.status !== "pending") {
      return res.status(400).json({ message: `Demande déjà ${application.status}.` });
    }

    const s = application.studentId;

    if (!["en_regle", "exonere"].includes(s.statutScolarite)) {
      return res.status(400).json({
        message: `Impossible de valider : l'étudiant est "${s.statutScolarite}". Mettez d'abord son statut à "en_regle" ou "exonere".`,
      });
    }

    application.status      = "approved";
    application.processedBy = req.user._id;
    await application.save();

    await logAudit({ req, action: "enrollment_validated", targetType: "CardApplication", targetId: application._id, description: `Dossier d'inscription validé — ${s.prenom} ${s.nom} (${s.matricule})`, oldValue: { status: "pending" }, newValue: { status: "approved" } });

    await sendEmail({
      to: s.email,
      subject: "Smart Campus — Votre dossier d'inscription a été validé",
      text: `Bonjour ${s.prenom} ${s.nom},

Votre dossier d'inscription au service de scolarité a été validé avec succès.

Votre situation administrative a été vérifiée : vous êtes en règle.

Votre carte étudiant est en cours de préparation. Vous recevrez un email dès qu'elle sera disponible et pourrez vous présenter au service de scolarité muni(e) de votre pièce d'identité.

Matricule : ${s.matricule}
Filière   : ${s.filiere}
Niveau    : ${s.niveau}

Cordialement,
Service de Scolarité — Smart Campus`,
    });

    return res.status(200).json({ message: "Inscription validée. Étudiant notifié par email." });
  } catch (error) {
    console.error("Erreur validateEnrollment :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── 5. Refuser une demande d'inscription ──────────────────────────────────────
const rejectEnrollment = async (req, res) => {
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

    await logAudit({ req, action: "enrollment_rejected", targetType: "CardApplication", targetId: application._id, description: `Dossier d'inscription refusé — ${s.prenom} ${s.nom}${reason ? ` (motif : ${reason})` : ""}`, oldValue: { status: "pending" }, newValue: { status: "rejected", reason: reason || null } });
    await sendEmail({
      to: s.email,
      subject: "Smart Campus — Dossier d'inscription refusé",
      text: `Bonjour ${s.prenom} ${s.nom},

Votre dossier d'inscription a été refusé par le service de scolarité.
${reason ? `\nMotif : ${reason}` : ""}

Veuillez contacter le service de scolarité pour régulariser votre situation.

Cordialement,
Service de Scolarité — Smart Campus`,
    });

    return res.status(200).json({ message: "Demande refusée. Étudiant notifié." });
  } catch (error) {
    console.error("Erreur rejectEnrollment :", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = {
  getEnrollmentRequests,
  getEnrolledStudents,
  updateStatutScolarite,
  validateEnrollment,
  rejectEnrollment,
};
