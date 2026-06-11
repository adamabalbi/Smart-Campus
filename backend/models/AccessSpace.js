const mongoose = require("mongoose");

const accessSpaceSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // identifiant technique : salle-info, bibliotheque, labo...
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    // --- Règles d'accès avancées (vides = tout le monde autorisé) ---
    allowedFilieres: {
      type: [String],
      default: [],
    },
    allowedNiveaux: {
      type: [String],
      default: [],
    },
    // Plage horaire autorisée (format "HH:MM"). Null = pas de restriction.
    enforceSchedule: {
      type: Boolean,
      default: false,
    },
    openTime: {
      type: String,
      default: "00:00",
    },
    closeTime: {
      type: String,
      default: "23:59",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccessSpace", accessSpaceSchema, "access_spaces");
