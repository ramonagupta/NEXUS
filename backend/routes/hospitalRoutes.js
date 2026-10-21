// routes/hospitalRoutes.js

const express = require("express");
const router = express.Router();

const {
  getHospitals,
  getHospitalByName,
  createHospital,
  updateHospital,
  deleteHospital,
} = require("../controllers/hospitalController");

router.post("/", createHospital);
router.get("/", getHospitals);
router.get("/:name", getHospitalByName);
router.put("/:name", updateHospital);
router.delete("/:name", deleteHospital);

module.exports = router;
