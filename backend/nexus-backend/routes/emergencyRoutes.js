const express = require("express");
const router = express.Router();

const {

  createEmergency,
  getEmergencies,
  getEmergencyById,
  updateEmergencyStatus,
  getPriorityQueue,
  dispatchNextEmergency,

} = require("../controllers/emergencyController")

router.post("/", createEmergency)

router.get("/", getEmergencies)

router.get("/queue", getPriorityQueue)

router.post("/dispatch", dispatchNextEmergency)

router.get("/:id", getEmergencyById)

router.patch("/:id/status", updateEmergencyStatus)


module.exports = router;
