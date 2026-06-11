const mongoose = require("mongoose");

const studentRegistrationSchema = new mongoose.Schema(
  {
    nom:         { type: String, required: true, trim: true },
    prenom:      { type: String, required: true, trim: true },
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    telephone:   { type: String, default: null, trim: true },
    filiere:     { type: String, required: true, trim: true },
    niveau:      { type: String, required: true, trim: true },
    departement: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: ["pending_email_verification", "email_verified", "approved", "rejected"],
      default: "pending_email_verification",
    },
    emailToken:          { type: String, default: null },
    emailTokenExpiresAt: { type: Date,   default: null },
    rejectionReason:     { type: String, default: null },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "StudentRegistration",
  studentRegistrationSchema,
  "student_registrations"
);
