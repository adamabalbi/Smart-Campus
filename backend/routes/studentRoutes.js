const express = require("express");
const router  = express.Router();

const {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  updateStudentStatus,
  deleteStudent,
} = require("../controllers/studentController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const admins = ["super_admin", "admin"];

router.post("/",            protect, authorizeRoles(...admins), createStudent);
router.get("/",             protect, authorizeRoles(...admins), getStudents);
router.get("/:id",          protect, authorizeRoles(...admins), getStudentById);
router.put("/:id",          protect, authorizeRoles(...admins), updateStudent);
router.patch("/:id/status", protect, authorizeRoles(...admins), updateStudentStatus);
router.delete("/:id",       protect, authorizeRoles(...admins), deleteStudent);

module.exports = router;
