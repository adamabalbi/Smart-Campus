const mongoose = require("mongoose");

const cardApplicationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
    },
    anneeAcademique: { type: String, required: true, trim: true },
    photoUrl:        { type: String, default: null, trim: true },
    notes:           { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: { type: String, default: null },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CardApplication", cardApplicationSchema, "card_applications");
