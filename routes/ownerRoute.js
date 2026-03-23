const express = require("express");
const router = express.Router();

const {
  signup,
  login,
  verifyEmail,
  changePassword,
  getMe,
  getOwnerAdminInfo,
  aeroDropOwnerLogin,
  aeroDropClientLogin,
} = require("../controllers/ownerController");

router.get("/info", getOwnerAdminInfo);

router.post("/signup", signup);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.get("/verify-email/:token", verifyEmail);

router.get("/me", getMe);
router.put("/password", changePassword);

router.post("/aerodrop-owner/login", aeroDropOwnerLogin);
router.post("/client/login", aeroDropClientLogin);

module.exports = router;
