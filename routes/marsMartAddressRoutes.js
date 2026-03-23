const express = require("express");
const router = express.Router();

const {
  getAeroDropAddresses,
  addAeroDropAddress,
  updateAeroDropAddress,
  deleteAeroDropAddress,
} = require("../controllers/marsMartAddressController");

const { protect } = require("../middleware/authMiddleware");

router.get("/address", protect, getAeroDropAddresses);
router.post("/address/add", protect, addAeroDropAddress);
router.put("/address/:id", protect, updateAeroDropAddress);
router.delete("/address/:id", protect, deleteAeroDropAddress);

module.exports = router;
