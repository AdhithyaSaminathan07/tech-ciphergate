const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Holiday = require('../models/Holiday');

dotenv.config();

const updateHolidays = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Find all holidays that don't have the new fields
    const holidaysToUpdate = await Holiday.find({
      $or: [
        { appliesTo: { $exists: false } },
        { workers: { $exists: false } },
        { isPaid: { $exists: false } }
      ]
    });
    
    console.log(`Found ${holidaysToUpdate.length} holidays to update`);
    
    // Update each holiday with default values
    let updatedCount = 0;
    for (const holiday of holidaysToUpdate) {
      await Holiday.findByIdAndUpdate(holiday._id, {
        $set: {
          appliesTo: 'all',
          workers: [],
          isPaid: true
        }
      });
      updatedCount++;
    }
    
    console.log(`Updated ${updatedCount} holidays`);
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

updateHolidays();