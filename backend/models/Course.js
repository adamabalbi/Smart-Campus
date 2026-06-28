const mongoose = require("mongoose");

// Créneau d'un cours dans l'emploi du temps.
const slotSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0 = dimanche
    startTime: { type: String, required: true }, // "HH:MM"
    endTime: { type: String, required: true },   // "HH:MM"
    room: { type: String, default: null },
    spaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessSpace",
      default: null,
    },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, default: null, trim: true },
    level: { type: String, default: null, trim: true },
    instructor: { type: String, default: null, trim: true },
    // Compte enseignant lié (rôle instructor) — pour restreindre l'accès aux
    // données de présence à l'enseignant du cours.
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    schedule: { type: [slotSchema], default: [] },
    academicYear: { type: String, required: true, trim: true },
    enrolledStudents: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    ],
  },
  { timestamps: true }
);

courseSchema.index({ code: 1, academicYear: 1 }, { unique: true });
courseSchema.index({ department: 1, level: 1 });
courseSchema.index({ "schedule.spaceId": 1 });

module.exports = mongoose.model("Course", courseSchema, "courses");
