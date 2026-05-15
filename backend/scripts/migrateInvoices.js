const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const Invoice = require('../models/Invoice');

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const invoices = await Invoice.find({ actualDate: { $exists: false } });
    console.log(`Found ${invoices.length} invoices to migrate`);

    for (const invoice of invoices) {
      if (invoice.invoiceDate) {
        const parts = invoice.invoiceDate.split('-');
        if (parts.length === 3) {
          invoice.actualDate = new Date(parts[2], parts[1] - 1, parts[0]);
          await invoice.save();
          console.log(`Migrated invoice ${invoice.invoiceNo}`);
        }
      }
    }

    console.log('Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrate();
