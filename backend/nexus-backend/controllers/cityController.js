

const Node = require("../models/Node")



const Road = require("../models/Road")




const { buildGraph, findShortestPath } = require("../utils/dijkstra")










async function addNode(req, res) {


  try {


    const { name, lat, lng } = req.body


    const node = await Node.create({ name, lat, lng })

    res.status(201).json(node);

  }
  
  catch (error) {

    res.status(500).json({ message: error.message })

  }
}









async function addRoad(req, res) {


  try {

    const { fromNode, toNode, distance, twoWay } = req.body

    const road = await Road.create({ fromNode, toNode, distance, twoWay })

    res.status(201).json(road)

    //Road ka object vary karega baad mein karunga

  } catch (error) {


    res.status(500).json({ message: error.message })

  }
}










async function getCityMap(req, res) {

  try {

    const nodes = await Node.find()

    const roads = await Road.find()

    res.json({ nodes, roads })

  } catch (error) {

    res.status(500).json({ message: error.message })

  }

}









async function getFastestRoute(req, res) {

  try {

    const { startId, endId } = req.query


    if (!startId || !endId) {

      return res
        .status(400)

        .json({ message: "startId and endId are required" })
    }

    const nodes = await Node.find()

    const roads = await Road.find()

    const graph = buildGraph(nodes, roads)

    const result = findShortestPath(graph, startId, endId)

    if (result.path.length === 0) {

      return res.status(404).json({ message: "No route found" })
    }

    res.json(result)

  }
  
  catch (error) {


    res.status(500).json({ message: error.message })
  }
}

module.exports = { addNode, addRoad, getCityMap, getFastestRoute };


//Aur Objects Add Honge