const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    // Qui a fait l'action
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null = système (kiosk, lecteur NFC, IA…)
    },
    actorRole: {
      type: String,
      default: "system",
    },
    // Quoi
    action: {
      type: String,
      required: true,
      // ex: login, logout, student_created, registration_approved,
      // scolarite_updated, card_created, card_blocked, recharge,
      // payment, ai_alert_created, alert_reviewed, access_granted,
      // access_denied, user_status_updated…
    },
    // Sur quel élément
    targetType: {
      type: String,
      default: null, // User, Student, Card, Wallet, Transaction, Alert, AccessSpace…
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      default: "",
    },
    // Avant / après (pour les modifications)
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Contexte technique
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    // Résultat
    status: {
      type: String,
      enum: ["success", "failure"],
      default: "success",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema, "audit_logs");
