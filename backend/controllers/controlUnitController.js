const ControlUnit = require("../models/ControlUnit");
const Emergency = require("../models/Emergency");
const engine = require("../utils/cppEngine");
const events = require("../utils/events");
const { cleanName } = require("../utils/validators");
const { exclusive, applyUpdates, broadcast } = require("../utils/emergencyService");

const plain = (doc) => (typeof doc.toObject === "function" ? doc.toObject() : doc);






async function buildOverview() {

  const [unit, resources, emergencies] = await Promise.all([

    engine.getControlUnit(),

    engine.getResources(),

    Emergency.find({}),

  ]);

  const c = unit.controlUnit;



  let totalDispatches = 0;

  let activeDispatches = 0;

  let waitingForAmbulance = 0;


  for (const e of emergencies.map(plain)) {

    const ambulance = e.assignments && e.assignments.

    ambulance;

    if (!ambulance) continue;



    const open = e.status !== "resolved";

    if (ambulance.state === "assigned") {

      totalDispatches++;

      if (open) activeDispatches++;
      
    } else if (ambulance.state === "waiting" && open) {

      waitingForAmbulance++;
    }
  }



  return {

    name: c.name,
    location: c.location,
    locationNode: c.location,
    area: engine.nodeName(c.location),
    status: c.online ? "online" : "offline",



    fleet: c.fleet,
    hospitals: resources.hospitals.map(engine.withNodeId),

    stats: {
      totalDispatches,
      activeDispatches,
      waitingForAmbulance,
    },
  };


}

async function getControlUnit(req, res) {

  try {

    res.json(await buildOverview());

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

}









async function updateControlUnit(req, res) {

  try {

    const existing = await ControlUnit.findOne({});

    if (!existing) return res.status(404).json({ message: "Control unit is not set up yet" });


    const name = req.body.name !== undefined ? cleanName(req.body.name) : existing.name;

    const newLocation = req.body.location ?? req.body.locationNode;

    const location = newLocation !== undefined ? engine.resolveNode(newLocation) : existing.location;



    let online = existing.online;
    
    if (req.body.status !== undefined) {

      if (req.body.status !== "online" && req.body.status !== "offline") {

        return res.status(400).json({ message: "status must be 'online' or 'offline'" });

      }
      online = req.body.status === "online";
    }



    if (!name) {

      return res.status(400).json({ message: "name can't be empty (max 60 characters)" });

    }
    if (!location) {

      return res.status(400).json({ message: "location must be a valid city node (see GET /api/city/map)" });

    }


    const previous = { name: existing.name, location: existing.location, online: existing.online };


    const outcome = await exclusive(async () => {

      const result = await engine.setControlUnit(name, location, online);

      if (!result.ok) return { result };


      try {

        existing.name = name;

        existing.location = location;

        existing.online = online;

        await existing.save();

      } catch (dbError) {

        await engine.setControlUnit(previous.name, previous.location, previous.online);

        throw dbError;

      }


      return { result, changed: await applyUpdates(result.updates) };
      
    });

    if (!outcome.result.ok) {

      return res.status(engine.httpStatus(outcome.result)).json({ message: outcome.result.error });
    }

    broadcast(outcome.changed);



    const overview = await buildOverview();

    events.publish("control-unit", overview);

    res.json(overview);

  } catch (error) {

    res.status(500).json({ message: error.message });
  }
}









async function getDispatches(req, res) {

  try {

    const emergencies = await Emergency.find({});

    const onlyActive = req.query.active === "true";


    const rows = [];

    for (const e of emergencies.map(plain)) {

      const a = e.assignments && e.assignments.ambulance;

      if (!a || a.state !== "assigned") continue;


      const active = e.status !== "resolved";

      if (onlyActive && !active) continue;





      rows.push({
        emergencyId: String(e._id),
        title: e.title || "",
        emergencyType: e.type,
        locationNode: e.location,
        locationName: e.locationName || "",
        injuredPeople: e.injuredPeople,
        priorityScore: e.priorityScore,

        ambulancesSent: a.unitsRequired,
        hospital: a.provider,
        hospitalArea: (a.routeAreas || [])[0] || null,
        routePath: a.route || [],
        distanceKm: a.distanceKm,
        totalSeconds: a.totalSeconds,

        dispatchedBy: a.dispatchedBy,
        dispatchedAt: a.dispatchedAt,
        emergencyStatus: e.status,
        active,
      });

    }

    rows.sort((a, b) => new Date(b.dispatchedAt) - new Date(a.dispatchedAt));

    res.json(rows);


  } catch (error) {

    res.status(500).json({ message: error.message });
    
  }
}

module.exports = { getControlUnit, updateControlUnit, getDispatches };
