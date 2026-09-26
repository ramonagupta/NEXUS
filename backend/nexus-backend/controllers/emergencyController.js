const Emergency = require("../models/Emergency")

const Resource = require("../models/Resource")

const Node = require("../models/Node")

const Road = require("../models/Road")

const { createPriorityQueue, calculatePriorityScore } = require("../utils/priorityQueue")

const { buildGraph, findShortestPath } = require("../utils/dijkstra")









async function createEmergency(req, res) {

  try {

    const { type, description, severity, location, reportedBy } = req.body

    const priorityScore = calculatePriorityScore(severity, 0)

    const emergency = await Emergency.create({
      type,
      description,
      severity,
      priorityScore,
      location,
      reportedBy,
      status: "pending",
    })

    res.status(201).json(emergency)

  }
  
  catch (error) {

    res.status(500).json({ message: error.message })

  }
}








async function getEmergencies(req, res) {

  try {

    const filter = {}

    if (req.query.status) filter.status = req.query.status


    const emergencies = await Emergency.find(filter).sort({ priorityScore: -1 })

    res.json(emergencies)

  }
  
  catch (error) {

    res.status(500).json({ message: error.message })
  }
}

async function getEmergencyById(req, res) {

  try {

    const emergency = await Emergency.findById(req.params.id)

    if (!emergency) return res.status(404).json({ message: "Emergency not found" })

    res.json(emergency)

  }
  
  catch (error) {

    res.status(500).json({ message: error.message })

  }
}













async function updateEmergencyStatus(req, res) {
  try {

    const { status } = req.body

    const emergency = await Emergency.findByIdAndUpdate(

      req.params.id,
      { status },
      { new: true }
    )
    if (!emergency) return res.status(404).json({ message: "Emergency not found" })

    res.json(emergency)

  }
  
  catch (error) {

    res.status(500).json({ message: error.message })
  }
}











async function buildPendingQueue() {

  const pendingEmergencies = await Emergency.find({ status: "pending" })

  const queue = createPriorityQueue()


  pendingEmergencies.forEach((emergency) => {

    const waitMinutes = (Date.now() - emergency.createdAt) / (1000 * 60)

    const score = calculatePriorityScore(emergency.severity, waitMinutes)

    queue.push({ emergency, priorityScore: score })

  })

  return queue
}










async function getPriorityQueue(req, res) {

  try {

    const queue = await buildPendingQueue()

    const ordered = queue.getAll().map((item) => ({

      id: item.emergency._id,
      type: item.emergency.type,
      severity: item.emergency.severity,
      priorityScore: item.priorityScore,
      createdAt: item.emergency.createdAt,

    }))
    res.json(ordered)
  } 
  
  catch (error) {
    res.status(500).json({ message: error.message })
  }
}










async function dispatchNextEmergency(req, res) {

  try {

    const queue = await buildPendingQueue()


    if (queue.isEmpty()) {

      return res.status(404).json({ message: "No pending emergencies" })

    }

    const top = queue.pop()

    const emergency = top.emergency

    
    const resourceTypeMap = {
      medical: "ambulance",
      fire: "rescue_team",
      accident: "ambulance",
      rescue: "rescue_team",
    }

    const neededType = resourceTypeMap[emergency.type] || null

    const resourceFilter = { status: "available" }

    if (neededType) resourceFilter.type = neededType

    const candidates = await Resource.find(resourceFilter)

    if (candidates.length === 0) {

      return res.status(404).json({ message: "No available resource for this emergency" })
    }

   
    const nodes = await Node.find()
    const roads = await Road.find()
    const graph = buildGraph(nodes, roads)


    let bestResource = null

    let bestDistance = Infinity

    let bestPath = []

    for (const candidate of candidates) {

      const result = findShortestPath(

        graph,
        candidate.location.nodeId.toString(),
        emergency.location.nodeId.toString()
      )

      if (result.totalDistance !== null && result.totalDistance < bestDistance) {
        bestDistance = result.totalDistance

        bestResource = candidate

        bestPath = result.path
      }
    }

    if (!bestResource) {
      return res.status(404).json({ message: "No reachable resource found" });
    }



    emergency.status = "assigned"

    emergency.assignedResource = bestResource._id

    emergency.priorityScore = top.priorityScore

    await emergency.save()


    bestResource.status = "busy"


    await bestResource.save()


    res.json({
      emergency,
      assignedResource: bestResource,
      route: bestPath,
      distance: bestDistance,
    })


  } 
  
  catch (error) {
    res.status(500).json({ message: error.message })
  }
}

module.exports = {
  createEmergency,
  getEmergencies,
  getEmergencyById,
  updateEmergencyStatus,
  getPriorityQueue,
  dispatchNextEmergency,
}


//SAB CHAL RHA HAI🔥🔥🔥  
