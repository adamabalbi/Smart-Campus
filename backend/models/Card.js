const mongoose = require("mongoose");
const crypto = require("crypto");

const cardSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
    },
    uid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    uidHash: {
      type: String,
      unique: true,
      index: true, // Index pour recherche rapide
    },
    cardNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["RFID-NFC", "MIFARE_CLASSIC_1K", "NTAG"],
      default: "RFID-NFC",
    },
    pinHash: {
      type: String,
      required: true,
    },
    pinAttempts: {
      type: Number,
      default: 0,
    },
    pinBlockedUntil: {
      type: Date,
      default: null,
    },
    mustChangePIN: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["active", "blocked", "lost", "expired", "disabled"],
      default: "active",
    },
    // --- Nouveaux champs NFC ---
    nfcEnabled: {
      type: Boolean,
      default: true,
    },
    lastNfcRead: {
      type: Date,
      default: null,
      index: true,
    },
    nfcFailures: {
      type: Number,
      default: 0,
    },
    pinValidated: {
      type: Boolean,
      default: false, // Reset à chaque session
    },
    lastPinValidation: {
      type: Date,
      default: null,
    },
    nfcMetadata: {
      readerType: String,
      lastReaderId: String,
      readCount: { type: Number, default: 0 },
      securityLevel: { type: String, enum: ["low", "medium", "high"], default: "medium" }
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index composés pour performance NFC
cardSchema.index({ uidHash: 1, status: 1, nfcEnabled: 1 });
cardSchema.index({ studentId: 1, status: 1 });
cardSchema.index({ lastNfcRead: -1 });

// Middleware pre-save pour hash automatique de l'UID
cardSchema.pre('save', function() {
  if (this.isModified('uid') && this.uid) {
    this.uidHash = crypto.createHash('sha256').update(this.uid.toLowerCase()).digest('hex');
  }

  // Increment read count on NFC read
  if (this.isModified('lastNfcRead') && this.lastNfcRead) {
    this.nfcMetadata.readCount = (this.nfcMetadata.readCount || 0) + 1;
  }
});

// Méthodes d'instance
cardSchema.methods.validateNFCPin = function(pin) {
  const bcrypt = require('bcryptjs');
  return bcrypt.compareSync(pin, this.pinHash);
};

cardSchema.methods.isPinBlocked = function() {
  return this.pinBlockedUntil && this.pinBlockedUntil > new Date();
};

cardSchema.methods.blockPin = function(minutes = 15) {
  this.pinBlockedUntil = new Date(Date.now() + minutes * 60000);
  this.pinAttempts = 3;
};

cardSchema.methods.resetPinAttempts = function() {
  this.pinAttempts = 0;
  this.pinBlockedUntil = null;
  this.pinValidated = true;
  this.lastPinValidation = new Date();
};

cardSchema.methods.incrementPinAttempts = function() {
  this.pinAttempts += 1;
  this.nfcFailures += 1;

  if (this.pinAttempts >= 3) {
    this.blockPin();
  }
};

// Méthodes statiques
cardSchema.statics.findByUID = function(uid) {
  const uidHash = crypto.createHash('sha256').update(uid).digest('hex');
  return this.findOne({
    uidHash: uidHash,
    status: 'active',
    nfcEnabled: true
  }).populate('studentId');
};

cardSchema.statics.getActiveNFCCards = function() {
  return this.find({
    status: 'active',
    nfcEnabled: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

module.exports = mongoose.model("Card", cardSchema, "cards");