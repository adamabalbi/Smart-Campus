const mongoose = require("mongoose");

const accessLogSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Card",
      default: null,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // agent de sécurité ayant scanné
    },
    spaceKey: {
      type: String,
      default: null,
    },
    spaceLabel: {
      type: String,
      default: null,
    },
    uidMasked: {
      type: String,
      default: null,
    },
    decision: {
      type: String,
      enum: ["authorized", "denied"],
      required: true,
    },
    reason: {
      type: String,
      enum: [
        "ok",
        "card_not_found",
        "card_blocked",
        "student_inactive",
        "space_not_found",
        "space_inactive",
        "access_not_allowed",
        "outside_allowed_time",
      ],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // RGPD : conservation limitée des données de déplacement (90 jours).
    // L'index TTL (expireAfterSeconds: 0) supprime le document à la date expiresAt.
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: false }
);

accessLogSchema.index({ spaceKey: 1, timestamp: -1 });
accessLogSchema.index({ studentId: 1, timestamp: -1 });
accessLogSchema.index({ decision: 1, timestamp: -1 });

module.exports = mongoose.model("AccessLog", accessLogSchema, "access_logs");
