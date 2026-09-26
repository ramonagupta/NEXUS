const express = require("express");
const router = express.Router();

const {

  createResource,
  getResources,
  getResourceById,
  updateResource,
  deleteResource,

} = require("../controllers/resourceController")

router.post("/", createResource)

router.get("/", getResources)

router.get("/:id", getResourceById)

router.put("/:id", updateResource)

router.delete("/:id", deleteResource)


module.exports = router;
