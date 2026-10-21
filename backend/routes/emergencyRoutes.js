// routes/emergencyRoutes.js

const express = require("express");
const router = express.Router();

const {
  resetEmergencies,
  createEmergency,
  getEmergencies,
  getEmergencyById,
  getPriorityQueue,
  dispatchWaiting,
  updateEmergencyStatus,
  deleteEmergency,
} = require("../controllers/emergencyController");

// fixed paths first, so ":id" doesn't swallow them
router.get("/queue", getPriorityQueue);
router.post("/dispatch", dispatchWaiting);
router.post("/reset", resetEmergencies);

router.post("/", createEmergency);
router.get("/", getEmergencies);
router.get("/:id", getEmergencyById);
router.patch("/:id", updateEmergencyStatus); // what the frontend calls
router.patch("/:id/status", updateEmergencyStatus); // same thing
router.delete("/:id", deleteEmergency);

module.exports = router;
