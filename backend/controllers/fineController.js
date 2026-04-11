// backend/controllers/fineController.js
const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const CommunityFundWallet = require('../models/CommunityFundWallet');
const CommunityFundTransaction = require('../models/CommunityFundTransaction');

// Add a fine to a worker
const addFine = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, date, reason } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Fine amount must be a valid positive number' });
    }

    if (!date) {
        return res.status(400).json({ message: 'Date is required' });
    }

    if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: 'Reason is required' });
    }

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    // Add the fine to the worker's fines array
    const newFine = {
        amount: Number(amount),
        date: new Date(date),
        reason: reason.trim()
    };
    worker.fines.push(newFine);

    // Update the worker's final salary by deducting the fine amount
    // If finalSalary is not set, use the base salary
    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = Math.max(0, currentSalary - Number(amount));

    await worker.save();

    // ---------------------------------------------------------
    // COMMUNITY FUND INTEGRATION
    // ---------------------------------------------------------
    try {
        // 1. Get or Create Wallet
        let wallet = await CommunityFundWallet.findOne({ subdomain: worker.subdomain });
        if (!wallet) {
            wallet = await CommunityFundWallet.create({
                totalBalance: 0,
                totalFinesCollected: 0,
                subdomain: worker.subdomain
            });
        }

        // 2. Update Wallet
        wallet.totalBalance += Number(amount);
        wallet.totalFinesCollected += Number(amount);
        await wallet.save();

        // 3. Create Transaction Record
        await CommunityFundTransaction.create({
            employeeId: id,
            amount: Number(amount),
            type: 'credit', // Money coming INTO the fund
            source: 'fine',
            reason: reason.trim(),
            referenceId: worker.fines[worker.fines.length - 1]._id, // ID of the fine just added
            createdBy: req.user ? req.user._id : null, // Assuming req.user is set by auth middleware
            subdomain: worker.subdomain
        });
    } catch (error) {
        console.error("Error updating Community Fund:", error);
        // Note: We don't fail the request if community fund update fails, 
        // ensuring the fine is still applied to the employee.
        // You might want to implement a rollback or retry mechanism here in production.
    }
    // ---------------------------------------------------------

    res.status(200).json({
        message: 'Fine added successfully',
        worker
    });
});

// Remove a fine from a worker
const removeFine = asyncHandler(async (req, res) => {
    const { id, fineId } = req.params;

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    // Find the fine to remove
    const fineIndex = worker.fines.findIndex(fine => fine._id.toString() === fineId);
    if (fineIndex === -1) {
        return res.status(404).json({ message: 'Fine not found' });
    }

    // Get the fine amount to add back to the salary
    const fineAmount = worker.fines[fineIndex].amount;

    // Remove the fine from the array
    worker.fines.splice(fineIndex, 1);

    // Update the worker's final salary by adding back the fine amount
    // If finalSalary is not set, use the base salary
    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = currentSalary + fineAmount;

    await worker.save();

    res.status(200).json({
        message: 'Fine removed successfully',
        worker
    });
});

// DELETE A FINE FROM A WORKER
const deleteFine = asyncHandler(async (req, res) => {
    const { id, fineId } = req.params;

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    // Find the fine to delete
    const fineIndex = worker.fines.findIndex(fine => fine._id.toString() === fineId);
    if (fineIndex === -1) {
        return res.status(404).json({ message: 'Fine not found' });
    }

    // Get the fine amount to add back to the salary
    const fineAmount = worker.fines[fineIndex].amount;

    // Remove the fine from the array
    worker.fines.splice(fineIndex, 1);

    // Update the worker's final salary by adding back the fine amount
    // If finalSalary is not set, use the base salary
    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = currentSalary + fineAmount;

    await worker.save();

    // ---------------------------------------------------------
    // COMMUNITY FUND REVERSAL
    // ---------------------------------------------------------
    try {
        const wallet = await CommunityFundWallet.findOne({ subdomain: worker.subdomain });
        if (wallet) {
            wallet.totalBalance -= fineAmount;
            wallet.totalFinesCollected -= fineAmount;
            await wallet.save();
        }

        // Add a reversal transaction
        await CommunityFundTransaction.create({
            employeeId: id,
            amount: fineAmount,
            type: 'debit', // Money leaving the fund (reversal)
            source: 'fine',
            reason: `Reversal of fine: ${worker.name}`, // Or fetch the original reason if needed
            referenceId: fineId, // Reference the deleted fine ID
            createdBy: req.user ? req.user._id : null,
            subdomain: worker.subdomain
        });
    } catch (error) {
        console.error("Error reversing Community Fund:", error);
    }
    // ---------------------------------------------------------

    res.status(200).json({
        message: 'Fine deleted successfully',
        worker
    });
});

const getWorkerFines = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const worker = await Worker.findById(id).select('fines');
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    res.status(200).json({
        message: 'Fines retrieved successfully',
        fines: worker.fines
    });
});

// Get logged-in worker's fines
const getMyFines = asyncHandler(async (req, res) => {
    // req.user is set by the protect middleware
    const id = req.user._id;
    const { fromDate, toDate } = req.query;

    const worker = await Worker.findById(id).select('fines');
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    let fines = worker.fines || [];

    // Apply filters if provided
    if (fromDate || toDate) {
        const start = fromDate ? new Date(fromDate) : new Date(0);
        const end = toDate ? new Date(toDate) : new Date();

        // Set end date to end of day if it's the same as provided (to include all fines on that day)
        end.setHours(23, 59, 59, 999);

        fines = fines.filter(fine => {
            const fineDate = new Date(fine.date);
            return fineDate >= start && fineDate <= end;
        });
    }

    // Sort by date descending (latest first)
    fines.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
        message: 'My fines retrieved successfully',
        fines
    });
});

// Update an existing fine
const updateFine = asyncHandler(async (req, res) => {
    const { id, fineId } = req.params;
    const { amount, date, reason } = req.body;

    // Validate inputs
    if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
        return res.status(400).json({ message: 'Fine amount must be a valid positive number' });
    }

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    // Find the fine to update
    const fineIndex = worker.fines.findIndex(fine => fine._id.toString() === fineId);
    if (fineIndex === -1) {
        return res.status(404).json({ message: 'Fine not found' });
    }

    const oldFine = worker.fines[fineIndex];
    const oldAmount = oldFine.amount;
    const newAmount = amount !== undefined ? Number(amount) : oldAmount;
    const amountDifference = newAmount - oldAmount;

    // Update the fine fields
    if (amount !== undefined) {
        worker.fines[fineIndex].amount = newAmount;
    }
    if (date !== undefined) {
        worker.fines[fineIndex].date = new Date(date);
    }
    if (reason !== undefined && reason.trim().length > 0) {
        worker.fines[fineIndex].reason = reason.trim();
    }

    // Update worker's finalSalary based on amount difference
    // If amount increased, deduct more; if decreased, add back
    if (amountDifference !== 0) {
        const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
        worker.finalSalary = Math.max(0, currentSalary - amountDifference);
    }

    await worker.save();

    // ---------------------------------------------------------
    // COMMUNITY FUND ADJUSTMENT
    // ---------------------------------------------------------
    if (amountDifference !== 0) {
        try {
            const wallet = await CommunityFundWallet.findOne({ subdomain: worker.subdomain });
            if (wallet) {
                wallet.totalBalance += amountDifference;
                wallet.totalFinesCollected += amountDifference;
                await wallet.save();
            }

            // Create a correction transaction to track the change
            await CommunityFundTransaction.create({
                employeeId: id,
                amount: Math.abs(amountDifference),
                type: amountDifference > 0 ? 'credit' : 'debit',
                source: 'fine',
                reason: `Fine adjustment for ${worker.name}: ${amountDifference > 0 ? 'increased' : 'decreased'} by ₹${Math.abs(amountDifference)}`,
                referenceId: fineId,
                createdBy: req.user ? req.user._id : null,
                subdomain: worker.subdomain
            });
        } catch (error) {
            console.error("Error updating Community Fund:", error);
        }
    }
    // ---------------------------------------------------------

    res.status(200).json({
        message: 'Fine updated successfully',
        worker
    });
});

const getAllFines = asyncHandler(async (req, res) => {
    const { month, year, department } = req.query;

    // Build query to find all workers with fines
    let query = { fines: { $exists: true, $ne: [] } };

    // If department is specified, filter by department
    if (department) {
        query.department = department;
    }

    const workers = await Worker.find(query).select('name department fines photo rfid');

    let allFines = [];

    workers.forEach(worker => {
        worker.fines.forEach(fine => {
            // If month and year are provided, filter by that specific month/year
            if (month && year) {
                const fineDate = new Date(fine.date);
                if (fineDate.getMonth() + 1 === parseInt(month) && fineDate.getFullYear() === parseInt(year)) {
                    allFines.push({
                        _id: fine._id,
                        amount: fine.amount,
                        date: fine.date,
                        reason: fine.reason,
                        createdAt: fine.createdAt,
                        workerId: worker._id,
                        workerName: worker.name,
                        department: worker.department,
                        employeeId: worker.rfid,
                        photo: worker.photo
                    });
                }
            } else {
                // If no specific month/year, include all fines
                allFines.push({
                    _id: fine._id,
                    amount: fine.amount,
                    date: fine.date,
                    reason: fine.reason,
                    createdAt: fine.createdAt,
                    workerId: worker._id,
                    workerName: worker.name,
                    department: worker.department,
                    employeeId: worker.rfid,
                    photo: worker.photo
                });
            }
        });
    });

    // Sort fines by date (newest first)
    allFines.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
        message: 'All fines retrieved successfully',
        fines: allFines,
        totalFines: allFines.length,
        totalAmount: allFines.reduce((sum, fine) => sum + fine.amount, 0)
    });
});

module.exports = {
    addFine,
    removeFine,
    deleteFine,
    updateFine,
    getWorkerFines,
    getMyFines,
    getAllFines
};