

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


router.get("/queue", getPriorityQueue);
router.post("/dispatch", dispatchWaiting);
router.post("/reset", resetEmergencies);

router.post("/", createEmergency);
router.get("/", getEmergencies);
router.get("/:id", getEmergencyById);
router.patch("/:id", updateEmergencyStatus);
router.patch("/:id/status", updateEmergencyStatus);
router.delete("/:id", deleteEmergency);

module.exports = router;
