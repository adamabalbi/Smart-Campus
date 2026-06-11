const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
    },
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Card",
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "XOF",
      enum: ["XOF", "EUR", "USD"],
    },
    status: {
      type: String,
      enum: ["active", "suspended", "closed"],
      default: "active",
    },
    dailyLimit: {
      type: Number,
      default: 50000, // 50,000 XOF par jour
    },
    monthlyLimit: {
      type: Number,
      default: 500000, // 500,000 XOF par mois
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index pour optimiser les requêtes
walletSchema.index({ studentId: 1 });
walletSchema.index({ cardId: 1 });
walletSchema.index({ status: 1 });

module.exports = mongoose.model("Wallet", walletSchema, "wallets");
