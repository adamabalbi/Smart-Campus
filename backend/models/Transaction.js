const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Card",
      required: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null pour les recharges via borne
    },
    type: {
      type: String,
      enum: ["recharge", "payment", "refund", "transfer"],
      required: true,
    },
    channel: {
      type: String,
      enum: ["agent", "kiosk", "online", "api"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "validated", "failed", "cancelled", "refunded"],
      default: "pending",
    },
    description: {
      type: String,
      maxlength: 500,
    },
    pinVerified: {
      type: Boolean,
      default: false,
    },
    metadata: {
      // Données additionnelles selon le contexte
      kioskId: String,
      location: String,        // Localisation de la borne (traçabilité)
      service: String,         // Service interne payé (cantine, bibliotheque, imprimerie)
      serviceLabel: String,    // Libellé lisible du service
      receiptNumber: String,
      paymentMethod: String,
      readerId: String,        // Identifiant du lecteur NFC
      nfcTransaction: Boolean,
      uid: String,             // UID masqué de la carte
      errorCode: String,
      errorMessage: String,
    },
    processedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Index pour optimiser les requêtes
transactionSchema.index({ studentId: 1 });
transactionSchema.index({ cardId: 1 });
transactionSchema.index({ walletId: 1 });
transactionSchema.index({ agentId: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ channel: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });

// Index composé pour l'historique par étudiant
transactionSchema.index({ studentId: 1, createdAt: -1 });

// Middleware pour mettre à jour processedAt quand le statut change
transactionSchema.pre('save', function() {
  if (this.isModified('status') && this.status === 'validated') {
    this.processedAt = new Date();
  }
});

module.exports = mongoose.model("Transaction", transactionSchema);