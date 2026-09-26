
const mongoose = require("mongoose");

async function connectDB() {

  try {

    const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_db";

    //JABTAK UNBAN NAHI HO JAATA 🙏

    
    await mongoose.connect(uri);


    console.log("MongoDB connected successfully");

  } catch (error) {

    console.log("MongoDB connection failed:", error.message);

    process.exit(1);

  }

}

module.exports = connectDB;
