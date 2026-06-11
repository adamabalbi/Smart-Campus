const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    otp: {
      expiryMinutes: { type: Number, default: 5,  min: 1, max: 60 },
      maxAttempts:   { type: Number, default: 3,  min: 1, max: 10 },
    },
    password: {
      minLength: { type: Number, default: 8, min: 6, max: 32 },
    },
    pin: {
      maxAttempts:          { type: Number, default: 3,  min: 1, max: 10   },
      blockDurationMinutes: { type: Number, default: 10, min: 1, max: 1440 },
    },
    session: {
      jwtExpiryHours: { type: Number, default: 2, min: 1, max: 24 },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema, "settings");
