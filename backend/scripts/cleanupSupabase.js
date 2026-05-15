const mongoose = require("mongoose");
require("dotenv").config();

const Worker = require("../models/Worker");

async function cleanupSupabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected");

    const employees = await Worker.find({
      photo: {
        $regex: "supabase.co",
        $options: "i",
      },
    });

    console.log(`Found ${employees.length} broken images`);

    for (const emp of employees) {
      emp.photo = "";
      await emp.save();

      console.log(`Cleaned ${emp.name}`);
    }

    console.log("Cleanup completed");
    process.exit(0);

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

cleanupSupabase();
