// routes/controlUnitRoutes.js
// /api/control-unit            the medical unit (as before)
// /api/control-unit/all        the three units together
// /api/control-unit/:kind      medical | fire | police

const express = require("express");
const router = express.Router();

const {
  getControlUnit,
  getAllControlUnits,
  updateControlUnit,
  getDispatches,
} = require("../controllers/controlUnitController");

router.get("/", getControlUnit);
router.put("/", updateControlUnit);
router.get("/dispatches", getDispatches);

// fixed paths first, so ":kind" doesn't swallow them
router.get("/all", getAllControlUnits);
router.get("/:kind", getControlUnit);
router.put("/:kind", updateControlUnit);
router.get("/:kind/dispatches", getDispatches);

module.exports = router;
