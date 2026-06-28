const express = require("express");
const router = express.Router();
const {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  enrollStudents,
  unenrollStudent,
} = require("../controllers/courseController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const ADMIN = ["super_admin", "admin"];

// Lecture : admin + enseignant (l'enseignant ne voit que ses cours, filtré côté contrôleur)
router.get("/", protect, authorizeRoles("super_admin", "admin", "instructor"), listCourses);
router.get("/:id", protect, authorizeRoles("super_admin", "admin", "instructor"), getCourse);

// Écriture : admin uniquement
router.post("/", protect, authorizeRoles(...ADMIN), createCourse);
router.patch("/:id", protect, authorizeRoles(...ADMIN), updateCourse);
router.post("/:id/enroll", protect, authorizeRoles(...ADMIN), enrollStudents);
router.delete("/:id/enroll/:studentId", protect, authorizeRoles(...ADMIN), unenrollStudent);

module.exports = router;
