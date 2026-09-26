const Hospital = require("../models/Hospital")





async function createHospital(req, res) {


  try {


    const hospital = await Hospital.create(req.body)


    res.status(201).json(hospital)


  }
  
  catch (error) {

    res.status(500).json({ message: error.message })


  }
}









async function getHospitals(req, res) {


  try {


    const hospitals = await Hospital.find()

    res.json(hospitals)


  } 
  
  catch (error) {


    res.status(500).json({ message: error.message })
  }
}










async function updateHospital(req, res) {


  try {


    const hospital = await Hospital.findByIdAndUpdate(req.params.id, req.body, {


      new: true,


    });

    if (!hospital) return res.status(404).json({ message: "Hospital not found" })

    res.json(hospital)

  }
  
  catch (error) {

    res.status(500).json({ message: error.message })

  }
}











async function deleteHospital(req, res) {


  try {


    const hospital = await Hospital.findByIdAndDelete(req.params.id)

    if (!hospital) return res.status(404).json({ message: "Hospital not found" })

    res.json({ message: "Hospital deleted" })

  }
  
  catch (error) {

    res.status(500).json({ message: error.message })
  }
}

module.exports = { createHospital, getHospitals, updateHospital, deleteHospital }


//SAB CHAL RHA🔥🔥
