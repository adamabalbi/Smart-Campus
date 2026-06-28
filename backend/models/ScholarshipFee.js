const mongoose = require("mongoose");

// Une tranche (échéance) de paiement des frais de scolarité.
const installmentSchema = new mongoose.Schema(
  {
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    paidDate: { type: Date, default: null },
    paidAmount: { type: Number, default: 0, min: 0 },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "late"],
      default: "pending",
    },
  },
  { _id: true }
);

const scholarshipFeeSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    academicYear: {
      type: String,
      required: true, // ex: "2025-2026"
      trim: true,
    },
    totalAmount: { type: Number, required: true, min: 0 }, // en XOF
    amountPaid: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["unpaid", "partial", "paid", "exempted"],
      default: "unpaid",
    },
    installments: { type: [installmentSchema], default: [] },
    // Dernier numéro de reçu généré pour ce dossier (les reçus sont aussi
    // tracés dans Transaction.metadata.receiptNumber).
    receiptNumber: { type: String, default: null },
  },
  { timestamps: true }
);

// Un seul dossier de frais par étudiant et par année académique.
scholarshipFeeSchema.index({ studentId: 1, academicYear: 1 }, { unique: true });
scholarshipFeeSchema.index({ status: 1 });

// Recalcule remainingAmount + status à partir de totalAmount/amountPaid.
// N'écrase pas le statut "exempted" (géré explicitement par l'admin).
scholarshipFeeSchema.methods.recompute = function () {
  this.remainingAmount = Math.max(0, this.totalAmount - this.amountPaid);
  if (this.status === "exempted") return this;
  if (this.amountPaid <= 0) this.status = "unpaid";
  else if (this.remainingAmount <= 0) this.status = "paid";
  else this.status = "partial";
  return this;
};

module.exports = mongoose.model("ScholarshipFee", scholarshipFeeSchema, "scholarship_fees");
