const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    matricule: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    nom: {
      type: String,
      required: true,
      trim: true,
    },
    prenom: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    telephone: {
      type: String,
      default: null,
      trim: true,
    },
    filiere: {
      type: String,
      required: true,
      trim: true,
    },
    niveau: {
      type: String,
      required: true,
      trim: true,
    },
    departement: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "disabled"],
      default: "active",
    },
    statutScolarite: {
      type: String,
      enum: ["en_attente", "en_regle", "non_en_regle", "paiement_partiel", "exonere"],
      default: "en_attente",
    },
    commentaireScolarite: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Student", studentSchema, "students");