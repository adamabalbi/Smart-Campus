const crypto = require("crypto");
const Card = require("../models/Card");
const Student = require("../models/Student");
const AccessSpace = require("../models/AccessSpace");
const AccessLog = require("../models/AccessLog");
const { logAudit } = require("../services/auditService");

// Messages français par raison
const reasonFr = {
  ok: "Accès autorisé",
  card_not_found: "Carte inconnue",
  card_blocked: "Carte bloquée",
  student_inactive: "Étudiant inactif",
  space_not_found: "Espace introuvable",
  space_inactive: "Espace indisponible",
  access_not_allowed: "Accès non autorisé",
  outside_allowed_time: "Accès hors horaire",
};

// Enregistre un événement d'accès
async function logAccess(data) {
  try {
    await AccessLog.create(data);
  } catch (e) {
    console.error("Erreur log accès:", e.message);
  }
}

// Vérifie si l'heure courante est dans la plage autorisée
function isWithinSchedule(openTime, closeTime) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);
  return cur >= (oh * 60 + om) && cur <= (ch * 60 + cm);
}

// POST /api/access/check  — vérification d'accès à un espace
const checkAccess = async (req, res) => {
  const { uid, spaceKey, agentId } = req.body;

  if (!uid || !spaceKey) {
    return res.status(400).json({ message: "UID et espace requis." });
  }

  const uidMasked = uid.substring(0, 4) + "***";

  // Helper pour répondre + journaliser
  const respond = async (decision, reason, extra = {}) => {
    await logAccess({
      studentId: extra.studentId || null,
      cardId: extra.cardId || null,
      agentId: agentId || null,
      spaceKey,
      spaceLabel: extra.spaceLabel || null,
      uidMasked,
      decision,
      reason,
    });
    await logAudit({
      req,
      action: decision === "authorized" ? "access_granted" : "access_denied",
      targetType: "Student",
      targetId: extra.studentId || null,
      description: `Contrôle d'accès ${extra.spaceLabel || spaceKey} — ${reasonFr[reason]}${extra.student ? ` — ${extra.student.prenom} ${extra.student.nom}` : ""} (carte ${uidMasked})`,
      status: decision === "authorized" ? "success" : "failure",
    });
    return res.json({
      decision,
      reason,
      message: reasonFr[reason],
      authorized: decision === "authorized",
      student: extra.student || null,
      card: extra.card || null,
      space: extra.spaceLabel || null,
    });
  };

  try {
    const uidHash = crypto.createHash("sha256").update(uid.toLowerCase()).digest("hex");

    // 1. L'espace existe
    const space = await AccessSpace.findOne({ key: spaceKey });
    if (!space) {
      return respond("denied", "space_not_found");
    }
    // 2. L'espace est actif
    if (space.status !== "active") {
      return respond("denied", "space_inactive", { spaceLabel: space.label });
    }

    // 3. La carte existe
    const card = await Card.findOne({ uidHash }).populate("studentId");
    if (!card) {
      return respond("denied", "card_not_found", { spaceLabel: space.label });
    }
    // 4. La carte est active
    if (card.status !== "active") {
      return respond("denied", "card_blocked", { spaceLabel: space.label, cardId: card._id });
    }

    // 5. L'étudiant existe et est actif
    const student = card.studentId;
    if (!student || student.status !== "active") {
      return respond("denied", "student_inactive", {
        spaceLabel: space.label,
        cardId: card._id,
        studentId: student ? student._id : null,
      });
    }

    const studentInfo = {
      nom: student.nom,
      prenom: student.prenom,
      matricule: student.matricule,
      filiere: student.filiere,
      niveau: student.niveau,
    };
    const cardInfo = { status: card.status, cardNumber: card.cardNumber };
    const baseExtra = {
      spaceLabel: space.label,
      cardId: card._id,
      studentId: student._id,
      student: studentInfo,
      card: cardInfo,
    };

    // 6. Règle filière (si configurée)
    if (space.allowedFilieres.length > 0 && !space.allowedFilieres.includes(student.filiere)) {
      return respond("denied", "access_not_allowed", baseExtra);
    }
    // 7. Règle niveau (si configurée)
    if (space.allowedNiveaux.length > 0 && !space.allowedNiveaux.includes(student.niveau)) {
      return respond("denied", "access_not_allowed", baseExtra);
    }
    // 8. Règle horaire (si activée)
    if (space.enforceSchedule && !isWithinSchedule(space.openTime, space.closeTime)) {
      return respond("denied", "outside_allowed_time", baseExtra);
    }

    // ✅ Accès autorisé
    return respond("authorized", "ok", baseExtra);
  } catch (error) {
    console.error("Erreur checkAccess:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la vérification d'accès." });
  }
};

// GET /api/access/spaces — liste des espaces
const getSpaces = async (req, res) => {
  try {
    const spaces = await AccessSpace.find().sort({ label: 1 });
    return res.json({ spaces });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/access/spaces/:key/status — activer/désactiver (admin)
const updateSpaceStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }
    const space = await AccessSpace.findOneAndUpdate(
      { key: req.params.key },
      { status },
      { new: true }
    );
    if (!space) return res.status(404).json({ message: "Espace introuvable." });

    await logAudit({ req, action: "access_space_status_updated", targetType: "AccessSpace", targetId: space._id, description: `Espace ${space.label} ${status === "active" ? "activé" : "désactivé"}`, newValue: { status } });

    return res.json({
      message: `Espace ${space.label} ${status === "active" ? "activé" : "désactivé"}.`,
      space,
    });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/access/spaces/:key — modifier les règles d'un espace (admin)
const updateSpaceRules = async (req, res) => {
  try {
    const { allowedFilieres, allowedNiveaux, enforceSchedule, openTime, closeTime, status } = req.body;
    const update = {};

    if (Array.isArray(allowedFilieres)) update.allowedFilieres = allowedFilieres.map(s => s.trim()).filter(Boolean);
    if (Array.isArray(allowedNiveaux)) update.allowedNiveaux = allowedNiveaux.map(s => s.trim()).filter(Boolean);
    if (typeof enforceSchedule === "boolean") update.enforceSchedule = enforceSchedule;
    if (openTime) update.openTime = openTime;
    if (closeTime) update.closeTime = closeTime;
    if (status && ["active", "inactive"].includes(status)) update.status = status;

    const space = await AccessSpace.findOneAndUpdate(
      { key: req.params.key },
      update,
      { new: true }
    );
    if (!space) return res.status(404).json({ message: "Espace introuvable." });

    await logAudit({ req, action: "access_space_rules_updated", targetType: "AccessSpace", targetId: space._id, description: `Règles d'accès de ${space.label} modifiées`, newValue: update });

    return res.json({ message: `Règles de ${space.label} mises à jour.`, space });
  } catch (error) {
    console.error("Erreur updateSpaceRules:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/access/logs — historique des accès (agent sécurité / admin)
const getAccessLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, decision, spaceKey, date } = req.query;
    const filter = {};
    if (decision) filter.decision = decision;
    if (spaceKey) filter.spaceKey = spaceKey;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.timestamp = { $gte: start, $lt: end };
    }

    const logs = await AccessLog.find(filter)
      .populate("studentId", "nom prenom matricule")
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AccessLog.countDocuments(filter);

    const formatted = logs.map((l) => ({
      ...l.toObject(),
      studentName: l.studentId ? `${l.studentId.prenom} ${l.studentId.nom}` : "—",
      studentMatricule: l.studentId ? l.studentId.matricule : "—",
      messageFr: reasonFr[l.reason] || l.reason,
    }));

    return res.json({
      logs: formatted,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Erreur getAccessLogs:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = { checkAccess, getSpaces, updateSpaceStatus, updateSpaceRules, getAccessLogs };
