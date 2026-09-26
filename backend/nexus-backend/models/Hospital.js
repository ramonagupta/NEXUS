const mongoose = require("mongoose");

const hospitalSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
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


    totalBeds: {
      type: Number,
      default: 0,
    },

    availableBeds: {
      type: Number,
      default: 0,
    },


  },
  { 
    
    timestamps: true
  
  }
);

module.exports = mongoose.model("Hospital", hospitalSchema);
