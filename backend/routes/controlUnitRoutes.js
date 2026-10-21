// routes/controlUnitRoutes.js

const express = require("express");
const router = express.Router();

const {
  getControlUnit,
  updateControlUnit,
  getDispatches,
} = require("../controllers/controlUnitController");

router.get("/", getControlUnit);
router.put("/", updateControlUnit);
router.get("/dispatches", getDispatches);

module.exports = router;
