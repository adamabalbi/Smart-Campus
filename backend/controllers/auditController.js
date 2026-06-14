const AuditLog = require("../models/AuditLog");
const { logError } = require("../utils/secureLogger");

// GET /api/audit
// Filtres : action, actorRole, targetType, status, actorId, targetId,
//           from / to (dates ISO), q (recherche dans description)
// Pagination : page (1+), limit (max 100)
const getAuditLogs = async (req, res) => {
  try {
    const { action, actorRole, targetType, status, actorId, targetId, from, to, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "25", 10)));

    const filter = {};
    if (action) filter.action = action;
    if (actorRole) filter.actorRole = actorRole;
    if (targetType) filter.targetType = targetType;
    if (status) filter.status = status;
    if (actorId) filter.actorId = actorId;
    if (targetId) filter.targetId = targetId;
    if (q) filter.description = { $regex: q, $options: "i" };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("actorId", "nom prenom email role")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return res.json({
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logError("Erreur getAuditLogs", error);
    return res.status(500).json({ message: "Erreur lors de la récupération de l'historique." });
  }
};

// GET /api/audit/actions — liste distincte des actions présentes (pour les filtres UI)
const getAuditActions = async (req, res) => {
  try {
    const actions = await AuditLog.distinct("action");
    return res.json({ actions: actions.sort() });
  } catch (error) {
    logError("Erreur getAuditActions", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des actions." });
  }
};

module.exports = { getAuditLogs, getAuditActions };
