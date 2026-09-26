const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },


    type: {
      type: String,
      required: true,
    },


    status: {
      type: String,
      enum: ["available", "busy", "unavailable"],
      default: "available",
    },


    location: {

      nodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Node",
        required: true,
      },


      lat: Number,
      lng: Number,
    },


    capacity: {

      type: Number,
      default: 1,
    },


  },

  {
    
    timestamps: true
  
  }
);

module.exports = mongoose.model("Resource", resourceSchema);
