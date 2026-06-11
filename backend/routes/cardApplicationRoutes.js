const express = require("express");
const router  = express.Router();

const {
  getApplications,
  approveApplication,
  rejectApplication,
} = require("../controllers/cardApplicationController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

// Consultation : admin + super_admin
router.get("/", protect, authorizeRoles("super_admin", "admin"), getApplications);

// Validation/Rejet : service_scolarite UNIQUEMENT
router.patch("/:id/approve", protect, authorizeRoles("service_scolarite"), approveApplication);
router.patch("/:id/reject",  protect, authorizeRoles("service_scolarite"), rejectApplication);

module.exports = router;
