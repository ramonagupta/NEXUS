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


app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
  res.json({ message: "NEXUS backend is running" });
});


app.use("/api/emergencies", emergencyRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/city", cityRoutes);
app.use("/api/control-unit", controlUnitRoutes);
app.use("/api/traffic", trafficRoutes);


app.get("/api/events", events.stream);


app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

async function startServer() {



  await connectDB();
  await engine.start();
  console.log("C++ engine started");
  await syncFacilities();
  await syncControlUnit();
  await syncTraffic();
  await syncPendingEmergencies();
  await cityMap.load();
  arrivalWatcher.start();

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
  });
}

startServer().catch((error) => {
  console.log("Failed to start:", error.message);
  process.exit(1);
});
