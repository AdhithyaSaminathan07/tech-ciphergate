const mongoose = require('mongoose');
const Worker = require('./models/Worker');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Connected to MongoDB');
    
    const rfids = ['VB6782', 'VB6782 ', ' VB6782'];
    
    for (const rfid of rfids) {
      const workers = await Worker.find({ rfid: { $regex: new RegExp(rfid.trim(), 'i') } });
      console.log(`Searching for ${rfid}: Found ${workers.length} workers.`);
      workers.forEach(w => {
         console.log(` - Name: ${w.name}, RFID: "${w.rfid}", Subdomain: "${w.subdomain}"`);
      });
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error connecting to MongoDB', err);
    process.exit(1);
  });
