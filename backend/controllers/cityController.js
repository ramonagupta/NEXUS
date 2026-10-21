const engine = require("../utils/cppEngine");

const cityMap = require("../utils/cityMap");



async function getCityMap(req, res) {

  try {

    const city = await engine.getCity();

    const shapes = await cityMap.load();


    res.json({
      mapSize: shapes.mapSize,
      geo: city.geo,
      stationTypes: shapes.stationTypes,
      rivers: shapes.rivers,
      areas: shapes.areas,
      nodes: city.nodes,
      roads: city.roads.map((r) => ({ ...r, ...shapes.roadShapes.get(r.id) })),
      trafficLevels: city.trafficLevels,
      maxTrafficRatio: city.maxTrafficRatio,
    });


  } catch (error) {

    res.status(500).json({ message: error.message });

  }
}



async function getTraffic(req, res) {


  try {

    const city = await engine.getCity();


    res.json(
      city.roads.map((r) => ({
        id: r.id,
        from: r.from,
        to: r.to,
        load: r.load,
        capacity: r.capacity,
        ratio: r.ratio,
        level: r.level,
        speedFactor: r.speedFactor,
      }))


    );

  } catch (error) {


    res.status(500).json({ message: error.message });


  }
}



async function getFastestRoute(req, res) {
  
  try {

    const start = engine.resolveNode(req.query.start);

    const end = engine.resolveNode(req.query.end);

    const vehicle = String(req.query.vehicle || "ambulance").trim().toLowerCase();


    if (!start || !end) {

      return res.status(400).json({ message: "start and end must be valid map nodes" });

    }
    if (!engine.VEHICLES.includes(vehicle)) 
      {
      return res.status(400).json({


        message: "vehicle must be one of: " + engine.VEHICLES.join(", "),


      });

    }

    const result = await engine.getRoute(start, end, vehicle);


    if (!result.ok) {

      return res.status(400).json({ message: result.error });

    }
    if (!result.found) {

      return res.status(404).json({ message: "No route found" });


    }



    res.json({
      vehicle: result.vehicle,
      route: result.route,
      routeAreas: result.routeAreas,
      distanceKm: result.distanceKm,
      baseTimeSeconds: result.baseTimeSeconds,
      trafficDelaySeconds: result.trafficDelaySeconds,
      totalSeconds: result.totalSeconds,
      jammedSegmentCount: result.jammedSegmentCount,
      isOnSite: result.isOnSite,
    });


  } catch (error) 
  
  {



    res.status(500).json({ message: error.message });
  }
}


module.exports = { getCityMap, getTraffic, getFastestRoute };
