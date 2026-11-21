// routes/resourceRoutes.js

const express = require("express");
const router = express.Router();

const {
  getResources,
  getSummary,
  getResourceByName,
  createResource,
  updateResource,
  deleteResource,
} = require("../controllers/resourceController");

router.get("/summary", getSummary); // before "/:name"
router.post("/", createResource);
router.get("/", getResources);
router.get("/:name", getResourceByName);
router.put("/:name", updateResource);
router.delete("/:name", deleteResource);

module.exports = router;
