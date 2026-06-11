const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    type: {
      type: String,
      default: "suspicious_payment",
    },
    service: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      default: 0,
    },
    score: {
      type: Number, // probabilité que le paiement soit suspect (0–1)
      default: null,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    reason: {
      type: String,
      default: "Paiement détecté comme suspect par le modèle IA",
    },
    status: {
      type: String,
      enum: ["new", "reviewed", "dismissed"],
      default: "new",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ studentId: 1, createdAt: -1 });

module.exports = mongoose.model("Alert", alertSchema, "alerts");
