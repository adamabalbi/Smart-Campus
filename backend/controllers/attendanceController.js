const crypto = require("crypto");
const { logError } = require("../utils/secureLogger");
const Card = require("../models/Card");
const Student = require("../models/Student");
const Course = require("../models/Course");
const Attendance = require("../models/Attendance");
const AccessSpace = require("../models/AccessSpace");
const { logAudit } = require("../services/auditService");
const { broadcast } = require("../services/realtimeService");

const hashUID = (uid) => crypto.createHash("sha256").update(String(uid).toLowerCase()).digest("hex");
const toMinutes = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Fenêtres de pointage (minutes après l'heure de début)
const LATE_AFTER = 15;   // > 15 min = retard
const REFUSE_AFTER = 30; // > 30 min = accès refusé

// Trouve le cours actuellement en séance dans un espace donné (par spaceId ou room).
async function findCurrentCourse(space) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();

  const filter = {
    "schedule.dayOfWeek": day,
    $or: [{ "schedule.spaceId": space._id }, { "schedule.room": space.key }, { "schedule.room": space.label }],
  };
  const courses = await Course.find(filter);

  for (const course of courses) {
    for (const slot of course.schedule) {
      const matchSpace = (slot.spaceId && slot.spaceId.toString() === space._id.toString()) ||
        slot.room === space.key || slot.room === space.label;
      if (slot.dayOfWeek !== day || !matchSpace) continue;
      const start = toMinutes(slot.startTime);
      const end = toMinutes(slot.endTime);
      // On accepte le pointage de (start - 15) jusqu'à end
      if (cur >= start - 15 && cur <= end) {
        return { course, slot, start, end };
      }
    }
  }
  return null;
}

// POST /api/attendance/check-in — pointage d'entrée par carte NFC
// Body: { uid, spaceKey, readerId? }
const checkIn = async (req, res) => {
  try {
    const { uid, spaceKey, readerId } = req.body;
    if (!uid || !spaceKey) return res.status(400).json({ message: "UID et espace requis." });

    const space = await AccessSpace.findOne({ key: spaceKey });
    if (!space) return res.status(404).json({ message: "Espace introuvable." });

    // Lecteur de confiance (anti-énumération), cohérent avec le contrôle d'accès.
    if (space.readerToken) {
      const provided = req.headers["x-reader-token"] || req.body.readerToken;
      if (provided !== space.readerToken) {
        return res.status(401).json({ message: "Lecteur non autorisé pour cet espace." });
      }
    }

    const card = await Card.findOne({ uidHash: hashUID(uid), status: "active" }).populate("studentId");
    if (!card) return res.status(404).json({ message: "Carte inconnue ou inactive." });
    const student = card.studentId;
    if (!student || student.status !== "active") {
      return res.status(403).json({ message: "Étudiant inactif." });
    }

    const current = await findCurrentCourse(space);
    if (!current) {
      return res.status(404).json({ message: "Aucun cours en séance dans cette salle actuellement." });
    }
    const { course, start } = current;

    // L'étudiant est-il inscrit au cours ?
    const enrolled = course.enrolledStudents.some((id) => id.toString() === student._id.toString());
    if (!enrolled) {
      return res.status(403).json({ message: `${student.prenom} ${student.nom} n'est pas inscrit(e) à ce cours.` });
    }

    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const delay = cur - start;

    // Au-delà de 30 min après le début : accès refusé (pas de présence)
    if (delay > REFUSE_AFTER) {
      return res.status(403).json({
        message: `Accès refusé : plus de ${REFUSE_AFTER} min de retard.`,
        status: "absent",
        course: { code: course.code, name: course.name },
      });
    }

    const status = delay > LATE_AFTER ? "late" : "present";
    const today = startOfDay(now);

    // Idempotence : une présence par étudiant/cours/jour
    const existing = await Attendance.findOne({ studentId: student._id, courseId: course._id, date: today });
    if (existing) {
      return res.json({
        success: true,
        message: "Présence déjà enregistrée aujourd'hui.",
        attendance: existing,
        course: { code: course.code, name: course.name },
        student: { nom: student.nom, prenom: student.prenom, matricule: student.matricule },
      });
    }

    const attendance = await Attendance.create({
      studentId: student._id,
      courseId: course._id,
      date: today,
      checkInTime: now,
      status,
      cardId: card._id,
      spaceId: space._id,
    });

    await logAudit({ req, actor: { _id: student.userId, role: "student" }, action: "attendance_check_in", targetType: "Attendance", targetId: attendance._id, description: `Pointage ${status} — ${student.prenom} ${student.nom} (${student.matricule}) — ${course.code} ${course.name}`, newValue: { status, courseId: course._id } });

    // Diffusion temps réel pour la liste de présence de l'enseignant
    broadcast({
      type: "attendanceUpdate",
      courseId: course._id.toString(),
      courseCode: course.code,
      student: { nom: student.nom, prenom: student.prenom, matricule: student.matricule },
      status,
      checkInTime: now,
      timestamp: Date.now(),
    });

    return res.json({
      success: true,
      message: status === "late" ? "Présence enregistrée (en retard)." : "Présence enregistrée.",
      attendance,
      course: { code: course.code, name: course.name },
      student: { nom: student.nom, prenom: student.prenom, matricule: student.matricule },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.json({ success: true, message: "Présence déjà enregistrée (idempotence)." });
    }
    logError("Erreur checkIn", error);
    return res.status(500).json({ message: "Erreur serveur lors du pointage." });
  }
};

// POST /api/attendance/check-out — pointage de sortie par carte NFC
const checkOut = async (req, res) => {
  try {
    const { uid, spaceKey } = req.body;
    if (!uid || !spaceKey) return res.status(400).json({ message: "UID et espace requis." });

    const space = await AccessSpace.findOne({ key: spaceKey });
    if (!space) return res.status(404).json({ message: "Espace introuvable." });

    const card = await Card.findOne({ uidHash: hashUID(uid), status: "active" }).populate("studentId");
    if (!card || !card.studentId) return res.status(404).json({ message: "Carte inconnue." });
    const student = card.studentId;

    const current = await findCurrentCourse(space);
    const today = startOfDay();
    const filter = { studentId: student._id, date: today };
    if (current) filter.courseId = current.course._id;

    const attendance = await Attendance.findOneAndUpdate(
      filter,
      { checkOutTime: new Date() },
      { new: true, sort: { checkInTime: -1 } }
    );
    if (!attendance) return res.status(404).json({ message: "Aucune présence à clôturer." });

    return res.json({ success: true, message: "Sortie enregistrée.", attendance });
  } catch (error) {
    logError("Erreur checkOut", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/attendance/my-attendance — l'étudiant consulte ses présences
const getMyAttendance = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profil étudiant introuvable." });

    const records = await Attendance.find({ studentId: student._id })
      .populate("courseId", "code name")
      .sort({ date: -1 })
      .limit(200);

    return res.json({ count: records.length, attendance: records });
  } catch (error) {
    logError("Erreur getMyAttendance", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/attendance/course/:courseId — liste de présence d'un cours (enseignant/admin)
// Query: date? (défaut = aujourd'hui)
const getCourseAttendance = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId).populate("enrolledStudents", "nom prenom matricule");
    if (!course) return res.status(404).json({ message: "Cours introuvable." });

    // Restriction : un enseignant ne voit que ses propres cours
    if (req.user.role === "instructor" && course.instructorId && course.instructorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Accès restreint à vos cours." });
    }

    const date = req.query.date ? startOfDay(new Date(req.query.date)) : startOfDay();
    const records = await Attendance.find({ courseId: course._id, date })
      .populate("studentId", "nom prenom matricule");

    const byStudent = {};
    records.forEach((r) => { if (r.studentId) byStudent[r.studentId._id.toString()] = r; });

    // Fusion : tous les inscrits, présents ou marqués absents
    const list = course.enrolledStudents.map((s) => {
      const rec = byStudent[s._id.toString()];
      return {
        studentId: s._id,
        nom: s.nom, prenom: s.prenom, matricule: s.matricule,
        status: rec ? rec.status : "absent",
        checkInTime: rec ? rec.checkInTime : null,
        checkOutTime: rec ? rec.checkOutTime : null,
      };
    });

    const present = list.filter((l) => l.status === "present" || l.status === "late").length;
    return res.json({
      course: { _id: course._id, code: course.code, name: course.name },
      date,
      total: list.length,
      present,
      absent: list.length - present,
      attendance: list,
    });
  } catch (error) {
    logError("Erreur getCourseAttendance", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// Calcule le taux de présence d'un étudiant (toutes séances ou par cours)
async function computeRate(studentId, courseId = null) {
  const match = { studentId };
  if (courseId) match.courseId = courseId;
  const records = await Attendance.find(match);
  const total = records.length;
  const attended = records.filter((r) => r.status === "present" || r.status === "late").length;
  return { total, attended, rate: total > 0 ? Math.round((attended / total) * 100) : null };
}

// GET /api/attendance/student/:studentId/stats — taux de présence (enseignant/admin)
const getStudentStats = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).select("nom prenom matricule");
    if (!student) return res.status(404).json({ message: "Étudiant introuvable." });

    const overall = await computeRate(student._id);

    // Détail par cours
    const courseIds = await Attendance.distinct("courseId", { studentId: student._id });
    const courses = await Course.find({ _id: { $in: courseIds } }).select("code name");
    const perCourse = [];
    for (const c of courses) {
      const r = await computeRate(student._id, c._id);
      perCourse.push({ courseId: c._id, code: c.code, name: c.name, ...r });
    }

    return res.json({ student, overall, perCourse, belowThreshold: overall.rate != null && overall.rate < 75 });
  } catch (error) {
    logError("Erreur getStudentStats", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/attendance/alerts — étudiants sous le seuil de 75% (enseignant/admin)
// Query: courseId? pour cibler un cours.
const getAlerts = async (req, res) => {
  try {
    const { courseId } = req.query;
    const match = {};
    if (courseId) match.courseId = new (require("mongoose").Types.ObjectId)(courseId);

    const agg = await Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$studentId",
          total: { $sum: 1 },
          attended: { $sum: { $cond: [{ $in: ["$status", ["present", "late"]] }, 1, 0] } },
        },
      },
      { $addFields: { rate: { $multiply: [{ $divide: ["$attended", "$total"] }, 100] } } },
      { $match: { rate: { $lt: 75 } } },
      { $sort: { rate: 1 } },
    ]);

    const ids = agg.map((a) => a._id);
    const students = await Student.find({ _id: { $in: ids } }).select("nom prenom matricule filiere niveau");
    const map = {}; students.forEach((s) => { map[s._id.toString()] = s; });

    const alerts = agg.map((a) => ({
      student: map[a._id.toString()] || null,
      total: a.total,
      attended: a.attended,
      rate: Math.round(a.rate),
    }));

    return res.json({ count: alerts.length, threshold: 75, alerts });
  } catch (error) {
    logError("Erreur getAlerts", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/attendance/course/:courseId/export — export CSV de la liste de présence
const exportCourseCsv = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId).populate("enrolledStudents", "nom prenom matricule");
    if (!course) return res.status(404).json({ message: "Cours introuvable." });
    if (req.user.role === "instructor" && course.instructorId && course.instructorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Accès restreint à vos cours." });
    }

    const date = req.query.date ? startOfDay(new Date(req.query.date)) : startOfDay();
    const records = await Attendance.find({ courseId: course._id, date }).populate("studentId", "nom prenom matricule");
    const byStudent = {};
    records.forEach((r) => { if (r.studentId) byStudent[r.studentId._id.toString()] = r; });

    const rows = [["Matricule", "Nom", "Prenom", "Statut", "Heure_arrivee"]];
    course.enrolledStudents.forEach((s) => {
      const rec = byStudent[s._id.toString()];
      rows.push([
        s.matricule, s.nom, s.prenom,
        rec ? rec.status : "absent",
        rec && rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString("fr-FR") : "",
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="presence_${course.code}_${date.toISOString().slice(0, 10)}.csv"`);
    return res.send("﻿" + csv); // BOM pour Excel
  } catch (error) {
    logError("Erreur exportCourseCsv", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = {
  checkIn,
  checkOut,
  getMyAttendance,
  getCourseAttendance,
  getStudentStats,
  getAlerts,
  exportCourseCsv,
};
