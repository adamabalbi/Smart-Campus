const express = require("express");
const router = express.Router();

const {
  getWallet,
  getWalletByCardUID,
  rechargeByAgent,
  rechargeByKiosk,
  getTransactionHistory,
  getAgentHistory,
  diagnosticWallets,
  createMissingWallets,
  createWallet,
} = require("../controllers/walletController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

// Routes pour les agents de paiement
router.post(
  "/recharge/agent",
  protect,
  authorizeRoles("payment_agent", "admin", "super_admin"),
  rechargeByAgent
);

router.get(
  "/card/:uid",
  protect,
  authorizeRoles("payment_agent", "admin", "super_admin"),
  getWalletByCardUID
);

// Historique des recharges effectuées par l'agent
router.get(
  "/agent-history",
  protect,
  authorizeRoles("payment_agent", "admin", "super_admin"),
  getAgentHistory
);

// Routes pour les bornes de recharge (kiosk) - pas de protection auth
router.post("/recharge/kiosk", rechargeByKiosk);

// Routes pour les étudiants
router.get(
  "/:studentId",
  protect,
  getWallet
);

router.get(
  "/:studentId/history",
  protect,
  getTransactionHistory
);

// Routes administratives
router.post(
  "/",
  protect,
  authorizeRoles("admin", "super_admin"),
  createWallet
);

// Routes de diagnostic et maintenance
router.get(
  "/diagnostic",
  protect,
  authorizeRoles("admin", "super_admin"),
  diagnosticWallets
);

router.post(
  "/create-missing",
  protect,
  authorizeRoles("admin", "super_admin"),
  createMissingWallets
);

module.exports = router;