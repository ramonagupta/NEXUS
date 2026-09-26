const mongoose = require("mongoose");

const emergencySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
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


    severity: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },


    priorityScore: {
      type: Number,
      default: 0,
    },


    status: {
      type: String,
      enum: ["pending", "assigned", "in-progress", "resolved"],
      default: "pending",
    },


    assignedResource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
      default: null,
    },


    reportedBy: {
      type: String, 
      default: "anonymous",
    },


  },

  {
    
    timestamps: true
  
  }
);

module.exports = mongoose.model("Emergency", emergencySchema);
