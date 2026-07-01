require('dotenv').config();
const connectDB = require('./config/db');
const mongoose = require('mongoose');

async function fix() {
  try {
    await connectDB();
    const db = mongoose.connection.db;
    const Worker = db.collection('workers');
    const Project = db.collection('salaryprojects');
    const Ledger = db.collection('projectpaymentledgers');
    
    const workers = await Worker.find({ name: { $regex: /Rishikumar/i } }).toArray();
    const worker = workers[0];
    if (!worker) {
      console.log('Worker not found');
      return;
    }
    
    const projects = await Project.find({ projectName: { $regex: /Aram Herbal Clinic/i } }).toArray();
    const project = projects[0];
    if (!project) {
      console.log('Project not found');
      return;
    }
    
    const ledgers = await Ledger.find({ employeeId: worker._id, projectId: project._id }).toArray();
    const ledger = ledgers.find(l => l.month === 5 && l.year === 2026);
    
    if (ledger) {
      const res = await Ledger.updateOne(
        { _id: ledger._id },
        { 
          $set: { 
            paidAmount: 21000, 
            paidPerDayValue: 807.6923076923077, 
            projectTotalWorkingDaysAtPayment: 26, 
            currentPerDayValue: 807.6923076923077, 
            currentEntitlement: 21000, 
            adjustmentAmount: 0 
          } 
        }
      );
      console.log('Update result:', res);
    } else {
      console.log('Ledger for May 2026 not found');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

fix();
