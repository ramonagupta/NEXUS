

const express = require("express");
const router = express.Router();

const {
  getTraffic,
  saveTraffic,
  setRoad,
  randomizeTraffic,
  clearTraffic,
} = require("../controllers/trafficController");

router.get("/", getTraffic);
router.put("/", saveTraffic);
router.patch("/roads/:id", setRoad);
router.post("/randomize", randomizeTraffic);
router.post("/clear", clearTraffic);

module.exports = router;
