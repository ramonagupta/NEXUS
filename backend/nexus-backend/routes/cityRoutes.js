const express = require("express");

const router = express.Router();

const {
  addNode,
  addRoad,
  getCityMap,
  getFastestRoute,

} = require("../controllers/cityController")

router.post("/nodes", addNode)

router.post("/roads", addRoad)

router.get("/map", getCityMap)

router.get("/fastest-route", getFastestRoute)



module.exports = router;
