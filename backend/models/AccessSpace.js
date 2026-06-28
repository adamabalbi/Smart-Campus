const mongoose = require("mongoose");

// Plage horaire d'un jour : { open: "07:00", close: "19:00" } ou null = fermé.
const daySchema = new mongoose.Schema(
  {
    open: { type: String, default: null },   // "HH:MM" ; null = fermé ce jour
    close: { type: String, default: null },
  },
  { _id: false }
);

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
    // Type fonctionnel de l'espace (multi-niveaux ESP/UCAD).
    spaceType: {
      type: String,
      enum: [
        "entrance",    // entrée principale
        "classroom",   // salle de cours
        "lab",         // laboratoire informatique
        "library",     // bibliothèque
        "cafeteria",   // cantine / restaurant universitaire
        "office",      // salle administrative
        "department",  // département (ex: Génie Informatique)
        "admin",       // salle de direction / staff
      ],
      default: "classroom",
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
    // Départements autorisés (ex: ['GI','GC','GE']). Vide = tous.
    // Distinct de allowedFilieres : un département regroupe plusieurs filières.
    allowedDepartments: {
      type: [String],
      default: [],
    },
    // Niveaux autorisés (ex: ['L3','M1','M2']). Vide = tous.
    // Alias moderne de allowedNiveaux ; checkAccessMulti combine les deux.
    allowedLevels: {
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
    // Horaires hebdomadaires détaillés (prioritaires sur openTime/closeTime
    // quand enforceSchedule=true et qu'au moins un jour est défini).
    schedule: {
      monday: { type: daySchema, default: () => ({}) },
      tuesday: { type: daySchema, default: () => ({}) },
      wednesday: { type: daySchema, default: () => ({}) },
      thursday: { type: daySchema, default: () => ({}) },
      friday: { type: daySchema, default: () => ({}) },
      saturday: { type: daySchema, default: () => ({}) },
      sunday: { type: daySchema, default: () => ({}) },
    },
    // Capacité maximale ; 0/null = pas de limite de capacité.
    capacity: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Occupation temps réel (incrémentée/décrémentée aux entrées/sorties).
    currentOccupancy: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Si true, l'accès exige une vérification du PIN de la carte.
    requiresPinVerification: {
      type: Boolean,
      default: false,
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
