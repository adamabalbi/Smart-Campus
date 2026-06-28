const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { logError } = require("../utils/secureLogger");
const Card = require("../models/Card");
const Student = require("../models/Student");
const AccessSpace = require("../models/AccessSpace");
const AccessLog = require("../models/AccessLog");
const { logAudit } = require("../services/auditService");
const { broadcast } = require("../services/realtimeService");

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
  department_not_allowed: "Département non autorisé pour cet espace",
  level_not_allowed: "Niveau non autorisé pour cet espace",
  capacity_exceeded: "Capacité maximale atteinte",
  pin_required: "Vérification du PIN requise",
  pin_invalid: "Code PIN incorrect",
  scolarite_not_ok: "Situation de scolarité non régularisée",
};

// Enregistre un événement d'accès
async function logAccess(data) {
  try {
    await AccessLog.create(data);
  } catch (e) {
    logError("Erreur log accès", e.message);
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

    // 2bis. Lecteur de confiance (anti-énumération) : si l'espace a un readerToken
    // configuré, la requête doit le fournir (en-tête X-Reader-Token ou body).
    // Rétrocompatible : les espaces sans readerToken ne sont pas affectés.
    if (space.readerToken) {
      const provided = req.headers["x-reader-token"] || (req.body && req.body.readerToken);
      if (provided !== space.readerToken) {
        return res.status(401).json({ message: "Lecteur non autorisé pour cet espace." });
      }
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
    logError("Erreur checkAccess", error);
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
    const { allowedFilieres, allowedNiveaux, allowedDepartments, allowedLevels, enforceSchedule, openTime, closeTime, schedule, status, readerToken, spaceType, capacity, requiresPinVerification } = req.body;
    const update = {};

    if (Array.isArray(allowedFilieres)) update.allowedFilieres = allowedFilieres.map(s => s.trim()).filter(Boolean);
    if (Array.isArray(allowedNiveaux)) update.allowedNiveaux = allowedNiveaux.map(s => s.trim()).filter(Boolean);
    if (Array.isArray(allowedDepartments)) update.allowedDepartments = allowedDepartments.map(s => s.trim()).filter(Boolean);
    if (Array.isArray(allowedLevels)) update.allowedLevels = allowedLevels.map(s => s.trim()).filter(Boolean);
    if (typeof enforceSchedule === "boolean") update.enforceSchedule = enforceSchedule;
    if (openTime) update.openTime = openTime;
    if (closeTime) update.closeTime = closeTime;
    if (schedule && typeof schedule === "object") update.schedule = schedule;
    if (status && ["active", "inactive"].includes(status)) update.status = status;
    const SPACE_TYPES = ["entrance", "classroom", "lab", "library", "cafeteria", "office", "department", "admin"];
    if (spaceType && SPACE_TYPES.includes(spaceType)) update.spaceType = spaceType;
    if (capacity !== undefined && !Number.isNaN(Number(capacity))) update.capacity = Math.max(0, parseInt(capacity, 10));
    if (typeof requiresPinVerification === "boolean") update.requiresPinVerification = requiresPinVerification;
    // Jeton lecteur de confiance : "" pour le retirer, sinon la valeur fournie
    if (typeof readerToken === "string") update.readerToken = readerToken.trim() || null;

    const space = await AccessSpace.findOneAndUpdate(
      { key: req.params.key },
      update,
      { new: true }
    );
    if (!space) return res.status(404).json({ message: "Espace introuvable." });

    await logAudit({ req, action: "access_space_rules_updated", targetType: "AccessSpace", targetId: space._id, description: `Règles d'accès de ${space.label} modifiées`, newValue: update });

    return res.json({ message: `Règles de ${space.label} mises à jour.`, space });
  } catch (error) {
    logError("Erreur updateSpaceRules", error);
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
    logError("Erreur getAccessLogs", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// Jours de la semaine indexés comme Date.getDay() (0 = dimanche)
const WEEK_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Convertit "HH:MM" en minutes depuis minuit
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

// Vérifie l'horaire en privilégiant le planning hebdomadaire détaillé.
// Retombe sur openTime/closeTime si aucun jour n'est configuré.
function isWithinScheduleMulti(space) {
  if (!space.enforceSchedule) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();

  const today = space.schedule && space.schedule[WEEK_DAYS[now.getDay()]];
  const hasWeekly = space.schedule && WEEK_DAYS.some(
    (d) => space.schedule[d] && space.schedule[d].open && space.schedule[d].close
  );

  if (hasWeekly) {
    // Planning hebdomadaire : jour sans open/close = fermé
    if (!today || !today.open || !today.close) return false;
    return cur >= toMinutes(today.open) && cur <= toMinutes(today.close);
  }
  // Fallback horaire simple
  return cur >= toMinutes(space.openTime) && cur <= toMinutes(space.closeTime);
}

// Diffuse l'occupation d'un espace à tous les dashboards connectés
function broadcastOccupancy(space) {
  broadcast({
    type: "occupancyUpdate",
    spaceKey: space.key,
    spaceLabel: space.label,
    spaceType: space.spaceType,
    capacity: space.capacity || 0,
    currentOccupancy: space.currentOccupancy || 0,
    timestamp: Date.now(),
  });
}

// POST /api/access/check-multi — contrôle d'accès multi-niveaux
// Body: { uid, spaceKey, direction: 'in'|'out', pin?, agentId? }
const checkAccessMulti = async (req, res) => {
  const { uid, spaceKey, agentId } = req.body;
  const direction = req.body.direction === "out" ? "out" : "in";
  const pin = req.body.pin;

  if (!uid || !spaceKey) {
    return res.status(400).json({ message: "UID et espace requis." });
  }

  const uidMasked = uid.substring(0, 4) + "***";

  const respond = async (decision, reason, extra = {}, httpStatus = 200) => {
    await logAccess({
      studentId: extra.studentId || null,
      cardId: extra.cardId || null,
      agentId: agentId || null,
      spaceKey,
      spaceLabel: extra.spaceLabel || null,
      uidMasked,
      decision,
      direction,
      reason,
    });
    await logAudit({
      req,
      action: decision === "authorized" ? "access_granted" : "access_denied",
      targetType: "Student",
      targetId: extra.studentId || null,
      description: `Contrôle multi-niveaux ${extra.spaceLabel || spaceKey} (${direction === "in" ? "entrée" : "sortie"}) — ${reasonFr[reason]}${extra.student ? ` — ${extra.student.prenom} ${extra.student.nom}` : ""} (carte ${uidMasked})`,
      status: decision === "authorized" ? "success" : "failure",
    });
    return res.status(httpStatus).json({
      authorized: decision === "authorized",
      decision,
      reason,
      message: reasonFr[reason],
      direction,
      studentInfo: extra.student || null,
      spaceInfo: extra.spaceInfo || null,
    });
  };

  try {
    const uidHash = crypto.createHash("sha256").update(uid.toLowerCase()).digest("hex");

    // 1. Espace
    const space = await AccessSpace.findOne({ key: spaceKey });
    if (!space) return respond("denied", "space_not_found");
    if (space.status !== "active") {
      return respond("denied", "space_inactive", { spaceLabel: space.label });
    }

    // 1bis. Lecteur de confiance (anti-énumération)
    if (space.readerToken) {
      const provided = req.headers["x-reader-token"] || (req.body && req.body.readerToken);
      if (provided !== space.readerToken) {
        return res.status(401).json({ message: "Lecteur non autorisé pour cet espace." });
      }
    }

    // 2. Carte
    const card = await Card.findOne({ uidHash }).populate("studentId");
    if (!card) return respond("denied", "card_not_found", { spaceLabel: space.label });
    if (card.status !== "active") {
      return respond("denied", "card_blocked", { spaceLabel: space.label, cardId: card._id });
    }

    // 3. Étudiant
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
      departement: student.departement,
    };
    const spaceInfo = {
      key: space.key,
      label: space.label,
      spaceType: space.spaceType,
      capacity: space.capacity || 0,
      currentOccupancy: space.currentOccupancy || 0,
    };
    const baseExtra = {
      spaceLabel: space.label,
      cardId: card._id,
      studentId: student._id,
      student: studentInfo,
      spaceInfo,
    };

    // --- SORTIE : on décrémente l'occupation sans rejouer toutes les règles ---
    if (direction === "out") {
      if (space.capacity || space.currentOccupancy) {
        space.currentOccupancy = Math.max(0, (space.currentOccupancy || 0) - 1);
        await space.save();
        spaceInfo.currentOccupancy = space.currentOccupancy;
        broadcastOccupancy(space);
      }
      return respond("authorized", "ok", baseExtra);
    }

    // --- ENTRÉE : règles complètes ---
    // 4. Département (allowedDepartments prioritaire, sinon allowedFilieres legacy)
    if (space.allowedDepartments.length > 0) {
      if (!student.departement || !space.allowedDepartments.includes(student.departement)) {
        return respond("denied", "department_not_allowed", baseExtra);
      }
    } else if (space.allowedFilieres.length > 0 && !space.allowedFilieres.includes(student.filiere)) {
      return respond("denied", "department_not_allowed", baseExtra);
    }

    // 5. Niveau (allowedLevels + allowedNiveaux legacy combinés)
    const levels = [...new Set([...(space.allowedLevels || []), ...(space.allowedNiveaux || [])])];
    if (levels.length > 0 && !levels.includes(student.niveau)) {
      return respond("denied", "level_not_allowed", baseExtra);
    }

    // 6. Horaire
    if (!isWithinScheduleMulti(space)) {
      return respond("denied", "outside_allowed_time", baseExtra);
    }

    // 7. PIN (si l'espace l'exige)
    if (space.requiresPinVerification) {
      if (!pin) return respond("denied", "pin_required", baseExtra, 401);
      if (!card.pinHash || !(await bcrypt.compare(pin, card.pinHash))) {
        return respond("denied", "pin_invalid", baseExtra, 401);
      }
    }

    // 8. Capacité (entrée) — atomique : on n'incrémente que si capacity non atteinte
    if (space.capacity && space.capacity > 0) {
      const updated = await AccessSpace.findOneAndUpdate(
        { key: spaceKey, currentOccupancy: { $lt: space.capacity } },
        { $inc: { currentOccupancy: 1 } },
        { new: true }
      );
      if (!updated) {
        return respond("denied", "capacity_exceeded", baseExtra);
      }
      spaceInfo.currentOccupancy = updated.currentOccupancy;
      broadcastOccupancy(updated);
    }

    // ✅ Accès autorisé
    return respond("authorized", "ok", baseExtra);
  } catch (error) {
    logError("Erreur checkAccessMulti", error);
    return res.status(500).json({ message: "Erreur serveur lors de la vérification d'accès." });
  }
};

// GET /api/access/occupancy — occupation temps réel de tous les espaces
const getOccupancy = async (req, res) => {
  try {
    const spaces = await AccessSpace.find({ status: "active" })
      .select("key label spaceType capacity currentOccupancy")
      .sort({ label: 1 });

    const data = spaces.map((s) => {
      const cap = s.capacity || 0;
      const occ = s.currentOccupancy || 0;
      return {
        key: s.key,
        label: s.label,
        spaceType: s.spaceType,
        capacity: cap,
        currentOccupancy: occ,
        occupancyRate: cap > 0 ? Math.round((occ / cap) * 100) : null,
        full: cap > 0 && occ >= cap,
      };
    });

    return res.json({ spaces: data });
  } catch (error) {
    logError("Erreur getOccupancy", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// POST /api/access/occupancy/:key/reset — remettre l'occupation à zéro (admin/agent)
// Utile en fin de journée ou après fermeture d'un espace.
const resetOccupancy = async (req, res) => {
  try {
    const space = await AccessSpace.findOneAndUpdate(
      { key: req.params.key },
      { currentOccupancy: 0 },
      { new: true }
    );
    if (!space) return res.status(404).json({ message: "Espace introuvable." });

    await logAudit({ req, action: "access_occupancy_reset", targetType: "AccessSpace", targetId: space._id, description: `Occupation de ${space.label} réinitialisée à 0` });
    broadcastOccupancy(space);

    return res.json({ message: `Occupation de ${space.label} réinitialisée.`, space });
  } catch (error) {
    logError("Erreur resetOccupancy", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = { checkAccess, checkAccessMulti, getSpaces, updateSpaceStatus, updateSpaceRules, getAccessLogs, getOccupancy, resetOccupancy };
