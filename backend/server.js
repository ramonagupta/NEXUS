// server.js
// Entry point for the NEXUS backend.

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const engine = require("./utils/cppEngine");
const { syncPendingEmergencies } = require("./utils/emergencyService");
const { syncFacilities, syncControlUnit, syncTraffic } = require("./utils/facilitySync");

const emergencyRoutes = require("./routes/emergencyRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const hospitalRoutes = require("./routes/hospitalRoutes");
const cityRoutes = require("./routes/cityRoutes");
const controlUnitRoutes = require("./routes/controlUnitRoutes");
const trafficRoutes = require("./routes/trafficRoutes");
const events = require("./utils/events");
const cityMap = require("./utils/cityMap");
const arrivalWatcher = require("./utils/arrivalWatcher");

const app = express();

// basic middleware
app.use(cors());
app.use(express.json());

// simple health check route
app.get("/", (req, res) => {
  res.json({ message: "NEXUS backend is running" });
});

// feature routes
app.use("/api/emergencies", emergencyRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/city", cityRoutes);
app.use("/api/control-unit", controlUnitRoutes);
app.use("/api/traffic", trafficRoutes);

// live updates (Server-Sent Events)
app.get("/api/events", events.stream);

// fallback for unknown routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

async function startServer() {
  // 1. database  2. C++ engine  3. load saved hospitals / resources / control unit into the
  // engine, and set up the city's traffic (the backend generates it)  4. put waiting
  // emergencies back into the engine queue
  await connectDB();
  await engine.start();
  console.log("C++ engine started");
  await syncFacilities();
  await syncControlUnit();
  await syncTraffic();
  await syncPendingEmergencies();
  await cityMap.load(); // the road curves the frontend draws
  arrivalWatcher.start(); // marks a report ON SCENE when its unit arrives

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
  });
}

startServer().catch((error) => {
  console.log("Failed to start:", error.message);
  process.exit(1);
});
