const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
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
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: [
        "super_admin",
        "admin",
        "student",
        "security_agent",
        "payment_agent",
        "librarian",
        "service_manager",
        "service_scolarite",
      ],
      default: "student",
    },
    status: {
      type: String,
      enum: ["active", "blocked", "disabled"],
      default: "active",
    },
    mustChangePassword: {
  type: Boolean,
  default: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema, "users");