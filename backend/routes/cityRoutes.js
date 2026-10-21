

const express = require("express");
const router = express.Router();

const {
  getCityMap,
  getTraffic,
  getFastestRoute,
} = require("../controllers/cityController");

router.get("/map", getCityMap);
router.get("/traffic", getTraffic);
router.get("/fastest-route", getFastestRoute);

module.exports = router;
