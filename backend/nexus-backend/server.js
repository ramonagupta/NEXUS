require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const emergencyRoutes = require("./routes/emergencyRoutes");

const resourceRoutes = require("./routes/resourceRoutes");

const hospitalRoutes = require("./routes/hospitalRoutes");

const cityRoutes = require("./routes/cityRoutes");


const app = express();

connectDB()




app.use(cors());
app.use(express.json());







app.get("/", (req, res) => {

  res.json({ message: "NEXUS backend is running" })

});

app.use("/api/emergencies", emergencyRoutes)

app.use("/api/resources", resourceRoutes)

app.use("/api/hospitals", hospitalRoutes)

app.use("/api/city", cityRoutes)







app.use((req, res) => {


  res.status(404).json({ message: "Route not found" })

})








const PORT = process.env.PORT || 5000

app.listen(PORT, () => {


  console.log("Server running on port " + PORT)


})
