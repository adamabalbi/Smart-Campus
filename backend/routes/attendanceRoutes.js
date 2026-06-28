const express = require("express");
const router = express.Router();
const {
  checkIn,
  checkOut,
  getMyAttendance,
  getCourseAttendance,
  getStudentStats,
  getAlerts,
  exportCourseCsv,
} = require("../controllers/attendanceController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const STAFF = ["super_admin", "admin", "instructor"];

// ---- Pointage par carte NFC (kiosque salle, lecteur de confiance) ----
router.post("/check-in", checkIn);
router.post("/check-out", checkOut);

// ---- Étudiant ----
router.get("/my-attendance", protect, getMyAttendance);

// ---- Enseignant / admin ----
router.get("/alerts", protect, authorizeRoles(...STAFF), getAlerts);
router.get("/course/:courseId/export", protect, authorizeRoles(...STAFF), exportCourseCsv);
router.get("/course/:courseId", protect, authorizeRoles(...STAFF), getCourseAttendance);
router.get("/student/:studentId/stats", protect, authorizeRoles(...STAFF), getStudentStats);

module.exports = router;
