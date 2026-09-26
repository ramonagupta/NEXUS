const Resource = require("../models/Resource")






async function createResource(req, res) {

  try {

    const resource = await Resource.create(req.body)

    res.status(201).json(resource)

  } catch (error) {

    res.status(500).json({ message: error.message })

  }
}










async function getResources(req, res) {


  try {



    const filter = {}


    if (req.query.status) filter.status = req.query.status


    if (req.query.type) filter.type = req.query.type


    const resources = await Resource.find(filter)


    res.json(resources)

  }
  
  catch (error) {

    res.status(500).json({ message: error.message })

  }
}










async function getResourceById(req, res) {


  try {

    const resource = await Resource.findById(req.params.id)

    if (!resource) return res.status(404).json({ message: "Resource not found" })

    res.json(resource)

  }
  
  catch (error) {

    res.status(500).json({ message: error.message })

  }
}









async function updateResource(req, res) {


  try {


    const resource = await Resource.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    })


    if (!resource) return res.status(404).json({ message: "Resource not found" })

    res.json(resource)


  }
  
  catch (error) {

    res.status(500).json({ message: error.message })

  }
}










async function deleteResource(req, res) {

  try {

    const resource = await Resource.findByIdAndDelete(req.params.id)

    if (!resource) return res.status(404).json({ message: "Resource not found" })

    res.json({ message: "Resource deleted" })

  } catch (error) {

    res.status(500).json({ message: error.message })

  }
}

module.exports = {
  createResource,
  getResources,
  getResourceById,
  updateResource,
  deleteResource,
}

//SB CHAL RHA🔥🔥
