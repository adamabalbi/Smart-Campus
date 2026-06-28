const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    date: { type: Date, required: true }, // jour du cours (minuit)
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },
    status: {
      type: String,
      enum: ["present", "late", "absent", "excused"],
      default: "present",
    },
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Card",
      default: null,
    },
    spaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessSpace",
      default: null,
    },
    createdAt: { type: Date, default: Date.now },
    // RGPD : conservation limitée des données de présence (90 jours).
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: false }
);

// Une seule présence par étudiant / cours / jour (idempotence du pointage).
attendanceSchema.index({ studentId: 1, courseId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ courseId: 1, date: -1 });
attendanceSchema.index({ studentId: 1, date: -1 });

module.exports = mongoose.model("Attendance", attendanceSchema, "attendances");
