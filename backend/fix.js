const mongoose = require('mongoose');
const uri = 'mongodb+srv://techvaseegrah_db_user:ff6JPMGZKvkV1Qjf@ciphergate.yu4qu23.mongodb.net/test?retryWrites=true&w=majority&appName=ciphergate';

async function fix() {
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const Worker = db.collection('workers');
    const Project = db.collection('salaryprojects');
    const Ledger = db.collection('projectpaymentledgers');
    
    // Also log all workers and projects just in case
    const workers = await Worker.find({ name: { $regex: /Rishikumar/i } }).toArray();
    console.log('Workers:', workers.map(w => w.name));
    
    const worker = workers[0];
    if (!worker) {
      console.log('Worker not found');
      return;
    }
    
    const projects = await Project.find({ projectName: { $regex: /Aram Herbal Clinic/i } }).toArray();
    console.log('Projects:', projects.map(p => p.projectName));
    const project = projects[0];
    if (!project) {
      console.log('Project not found');
      return;
    }
    
    const ledgers = await Ledger.find({ employeeId: worker._id, projectId: project._id }).toArray();
    console.log('Found ledgers:', ledgers);
    
    const ledger = ledgers.find(l => l.month === 5 && l.year === 2026);
    if (ledger) {
      const res = await Ledger.updateOne(
        { _id: ledger._id },
        { 
          $set: { 
            paidAmount: 21000, 
            paidPerDayValue: 807.69, 
            projectTotalWorkingDaysAtPayment: 26, 
            currentPerDayValue: 807.69, 
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
