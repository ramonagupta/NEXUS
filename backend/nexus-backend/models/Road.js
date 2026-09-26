const mongoose = require("mongoose");

const roadSchema = new mongoose.Schema(
  {
    fromNode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Node",
      required: true,
    },


    toNode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Node",
      required: true,
    },


    distance: {
      type: Number,
      required: true,
    },


    twoWay: {
      type: Boolean,
      default: true,
    },


  },


  {
    
    timestamps: true
  
  }
);

module.exports = mongoose.model("Road", roadSchema);
