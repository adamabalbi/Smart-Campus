// Service de journalisation d'audit.
// NON BLOQUANT : une erreur d'écriture du journal ne doit jamais
// faire échouer l'action métier — elle est seulement loguée en console.

const AuditLog = require("../models/AuditLog");

/**
 * Enregistre une action sensible dans le journal d'audit.
 *
 * @param {object} entry
 * @param {object|null} entry.req       - requête Express (pour ip/userAgent/acteur connecté)
 * @param {object|null} entry.actor     - utilisateur acteur (sinon déduit de req.user)
 * @param {string}      entry.action    - ex: "login", "card_blocked", "payment"
 * @param {string}      [entry.targetType]
 * @param {string|object} [entry.targetId]
 * @param {string}      [entry.description]
 * @param {*}           [entry.oldValue]
 * @param {*}           [entry.newValue]
 * @param {string}      [entry.status]  - "success" (défaut) ou "failure"
 */
async function logAudit({ req = null, actor = null, action, targetType = null, targetId = null, description = "", oldValue = null, newValue = null, status = "success" }) {
  try {
    const user = actor || (req && req.user) || null;
    await AuditLog.create({
      actorId: user ? user._id : null,
      actorRole: user ? user.role : "system",
      action,
      targetType,
      targetId: targetId || null,
      description,
      oldValue,
      newValue,
      ipAddress: req ? (req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.socket?.remoteAddress || null) : null,
      userAgent: req ? (req.headers["user-agent"] || null) : null,
      status,
    });
  } catch (err) {
    console.warn("⚠️  Audit non enregistré:", err.message);
  }
}

module.exports = { logAudit };
