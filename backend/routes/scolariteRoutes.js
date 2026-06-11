const express = require("express");
const router  = express.Router();

const {
  getEnrollmentRequests,
  getEnrolledStudents,
  updateStatutScolarite,
  validateEnrollment,
  rejectEnrollment,
} = require("../controllers/scolariteController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const canView     = ["super_admin", "admin", "service_scolarite"];
const scolariteOnly = ["service_scolarite"];

// Consultation : admin, super_admin et service_scolarite
router.get("/applications",  protect, authorizeRoles(...canView), getEnrollmentRequests);
router.get("/students",      protect, authorizeRoles(...canView), getEnrolledStudents);
router.patch("/students/:id/statut", protect, authorizeRoles(...canView), updateStatutScolarite);

// Validation/Rejet : service_scolarite UNIQUEMENT
router.patch("/applications/:id/validate", protect, authorizeRoles(...scolariteOnly), validateEnrollment);
router.patch("/applications/:id/reject",   protect, authorizeRoles(...scolariteOnly), rejectEnrollment);

module.exports = router;
