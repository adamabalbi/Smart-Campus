const express = require("express");
const router  = express.Router();

const {
  createCard,
  getCards,
  getCardById,
  getCardByUID,
  verifyCardPIN,
  changeCardPIN,
  resetCardPIN,
  updateCardStatus,
  updateCard,
} = require("../controllers/cardController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const admins = ["super_admin", "admin"];
const agents = ["super_admin", "admin", "security_agent", "payment_agent", "librarian"];

// Gestion admin
router.post("/",                protect, authorizeRoles(...admins), createCard);
router.get("/",                 protect, authorizeRoles(...admins), getCards);
router.get("/:id",              protect, authorizeRoles(...admins), getCardById);
router.put("/:id",              protect, authorizeRoles(...admins), updateCard);
router.patch("/:id/status",     protect, authorizeRoles(...admins), updateCardStatus);
router.patch("/:id/reset-pin",  protect, authorizeRoles(...admins), resetCardPIN);
router.patch("/:id/change-pin", protect, authorizeRoles(...admins), changeCardPIN);

// Recherche UID et vérification PIN (agents inclus)
router.get("/uid/:uid",   protect, authorizeRoles(...agents), getCardByUID);
router.post("/verify-pin", protect, authorizeRoles(...agents), verifyCardPIN);

module.exports = router;
