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
    // Jeton du/des lecteur(s) de confiance pour cet espace (anti-énumération).
    // Si défini (non vide), checkAccess exige que la requête fournisse ce jeton
    // (en-tête X-Reader-Token ou champ readerToken). Vide = pas de contrôle device.
    readerToken: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccessSpace", accessSpaceSchema, "access_spaces");
