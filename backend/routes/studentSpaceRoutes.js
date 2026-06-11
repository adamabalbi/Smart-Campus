const express = require("express");
const router  = express.Router();

const { getMyProfile, updateMyProfile, getMyNotifications, submitCardApplication, changeMyPIN } =
  require("../controllers/studentSpaceController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const studentOnly = [protect, authorizeRoles("student")];

router.get("/me",            ...studentOnly, getMyProfile);
router.patch("/me",          ...studentOnly, updateMyProfile);
router.get("/notifications", ...studentOnly, getMyNotifications);
router.post("/card-application",  ...studentOnly, submitCardApplication);
router.patch("/change-pin",       ...studentOnly, changeMyPIN);

module.exports = router;
