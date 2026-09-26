const express = require("express");
const router = express.Router();

const {

  createHospital,
  getHospitals,
  updateHospital,
  deleteHospital,

} = require("../controllers/hospitalController");

router.post("/", createHospital)

router.get("/", getHospitals)

router.put("/:id", updateHospital)

router.delete("/:id", deleteHospital)


module.exports = router;
