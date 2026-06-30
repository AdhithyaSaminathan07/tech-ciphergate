const asyncHandler = require('express-async-handler');
const Worker = require('../models/Worker');
const CommunityFundWallet = require('../models/CommunityFundWallet');
const CommunityFundTransaction = require('../models/CommunityFundTransaction');
const crypto = require('crypto');
const Settings = require('../models/Settings');

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

    const newFine = {
        amount: Number(amount),
        date: new Date(date),
        reason: reason.trim()
    };
    worker.fines.push(newFine);

    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = Math.max(0, currentSalary - Number(amount));

    await worker.save();

    try {
        let wallet = await CommunityFundWallet.findOne({ subdomain: worker.subdomain });
        if (!wallet) {
            wallet = await CommunityFundWallet.create({
                totalBalance: 0,
                totalFinesCollected: 0,
                subdomain: worker.subdomain
            });
        }

        wallet.totalBalance += Number(amount);
        wallet.totalFinesCollected += Number(amount);
        await wallet.save();

        await CommunityFundTransaction.create({
            employeeId: id,
            amount: Number(amount),
            type: 'credit',
            source: 'fine',
            reason: reason.trim(),
            referenceId: worker.fines[worker.fines.length - 1]._id,
            createdBy: req.user ? req.user._id : null,
            subdomain: worker.subdomain
        });
    } catch (error) {
        console.error("Error updating Community Fund:", error);
    }

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

    const fineIndex = worker.fines.findIndex(fine => fine._id.toString() === fineId);
    if (fineIndex === -1) {
        return res.status(404).json({ message: 'Fine not found' });
    }

    const fineAmount = worker.fines[fineIndex].amount;
    worker.fines.splice(fineIndex, 1);

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

    const fineIndex = worker.fines.findIndex(fine => fine._id.toString() === fineId);
    if (fineIndex === -1) {
        return res.status(404).json({ message: 'Fine not found' });
    }

    const fineAmount = worker.fines[fineIndex].amount;
    worker.fines.splice(fineIndex, 1);

    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = currentSalary + fineAmount;

    await worker.save();

    try {
        const wallet = await CommunityFundWallet.findOne({ subdomain: worker.subdomain });
        if (wallet) {
            wallet.totalBalance -= fineAmount;
            wallet.totalFinesCollected -= fineAmount;
            await wallet.save();
        }

        await CommunityFundTransaction.create({
            employeeId: id,
            amount: fineAmount,
            type: 'debit',
            source: 'fine',
            reason: `Reversal of fine: ${worker.name}`,
            referenceId: fineId,
            createdBy: req.user ? req.user._id : null,
            subdomain: worker.subdomain
        });
    } catch (error) {
        console.error("Error reversing Community Fund:", error);
    }

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
    const id = req.user._id;
    const { fromDate, toDate } = req.query;

    const worker = await Worker.findById(id).select('fines');
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    let fines = worker.fines || [];

    if (fromDate || toDate) {
        const start = fromDate ? new Date(fromDate) : new Date(0);
        const end = toDate ? new Date(toDate) : new Date();
        end.setHours(23, 59, 59, 999);

        fines = fines.filter(fine => {
            const fineDate = new Date(fine.date);
            return fineDate >= start && fineDate <= end;
        });
    }

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

    if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
        return res.status(400).json({ message: 'Fine amount must be a valid positive number' });
    }

    const worker = await Worker.findById(id);
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found' });
    }

    const fineIndex = worker.fines.findIndex(fine => fine._id.toString() === fineId);
    if (fineIndex === -1) {
        return res.status(404).json({ message: 'Fine not found' });
    }

    const oldFine = worker.fines[fineIndex];
    const oldAmount = oldFine.amount;
    const newAmount = amount !== undefined ? Number(amount) : oldAmount;
    const amountDifference = newAmount - oldAmount;

    if (amount !== undefined) {
        worker.fines[fineIndex].amount = newAmount;
    }
    if (date !== undefined) {
        worker.fines[fineIndex].date = new Date(date);
    }
    if (reason !== undefined && reason.trim().length > 0) {
        worker.fines[fineIndex].reason = reason.trim();
    }

    if (amountDifference !== 0) {
        const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
        worker.finalSalary = Math.max(0, currentSalary - amountDifference);
    }

    await worker.save();

    if (amountDifference !== 0) {
        try {
            const wallet = await CommunityFundWallet.findOne({ subdomain: worker.subdomain });
            if (wallet) {
                wallet.totalBalance += amountDifference;
                wallet.totalFinesCollected += amountDifference;
                await wallet.save();
            }

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

    res.status(200).json({
        message: 'Fine updated successfully',
        worker
    });
});

const getAllFines = asyncHandler(async (req, res) => {
    const { month, year, department } = req.query;

    let query = { fines: { $exists: true, $ne: [] } };

    if (department) {
        query.department = department;
    }

    const workers = await Worker.find(query).select('name department fines photo rfid');

    let allFines = [];

    workers.forEach(worker => {
        worker.fines.forEach(fine => {
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

    allFines.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
        message: 'All fines retrieved successfully',
        fines: allFines,
        totalFines: allFines.length,
        totalAmount: allFines.reduce((sum, fine) => sum + fine.amount, 0)
    });
});

// Env-secret webhook variant (kept for manual/direct testing — reads amount from env)
const addFineFromWebhook = asyncHandler(async (req, res) => {
    const { secret, username, subdomain, reason } = req.body;

    const expectedSecret = process.env.GOWHATS_FINE_SECRET || '';
    const providedSecret = secret || '';
    const isValidSecret = expectedSecret.length > 0 &&
        providedSecret.length === expectedSecret.length &&
        crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expectedSecret));

    if (!isValidSecret) {
        return res.status(401).json({ message: 'Invalid secret' });
    }

    if (!username || !subdomain) {
        return res.status(400).json({ message: 'username and subdomain are required' });
    }

    const worker = await Worker.findOne({ username, subdomain, status: 'Active' });
    if (!worker) {
        return res.status(404).json({ message: `No active worker found for username="${username}" subdomain="${subdomain}"` });
    }

    const amount = Number(process.env.UNREAD_FINE_AMOUNT || 50);

    const newFine = {
        amount,
        date: new Date(),
        reason: reason ? reason.trim() : 'Unread message SLA violation'
    };
    worker.fines.push(newFine);

    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = Math.max(0, currentSalary - amount);

    await worker.save();

    try {
        let wallet = await CommunityFundWallet.findOne({ subdomain: worker.subdomain });
        if (!wallet) {
            wallet = await CommunityFundWallet.create({
                totalBalance: 0,
                totalFinesCollected: 0,
                subdomain: worker.subdomain
            });
        }
        wallet.totalBalance += amount;
        wallet.totalFinesCollected += amount;
        await wallet.save();

        await CommunityFundTransaction.create({
            employeeId: worker._id,
            amount,
            type: 'credit',
            source: 'fine',
            reason: newFine.reason,
            referenceId: worker.fines[worker.fines.length - 1]._id,
            createdBy: null,
            subdomain: worker.subdomain
        });
    } catch (error) {
        console.error("Error updating Community Fund (webhook fine):", error);
    }

    res.status(200).json({
        message: 'Fine applied successfully',
        fineAmount: amount,
        worker: { _id: worker._id, username: worker.username, finalSalary: worker.finalSalary }
    });
});

// Called by GoWhats cron job — fines a worker for an unread WhatsApp message past SLA.
// Reads enabled/amount/threshold from Settings (Settings-page configurable), not env.
const addFineFromGowhats = asyncHandler(async (req, res) => {
    const { secret, username, subdomain, reason } = req.body;

    if (!secret || secret !== process.env.GOWHATS_FINE_SECRET) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!username || !subdomain) {
        return res.status(400).json({ message: 'username and subdomain are required' });
    }

    const settings = await Settings.findOne({ subdomain });
    if (!settings?.unreadMessageFineConfig?.enabled) {
        return res.status(403).json({ message: 'Unread message fines are disabled for this company' });
    }

    const fineAmount = Number(settings.unreadMessageFineConfig.amountPerMessage);
    if (!fineAmount || fineAmount <= 0) {
        return res.status(400).json({ message: 'No valid fine amount configured' });
    }

    const worker = await Worker.findOne({ username, subdomain });
    if (!worker) {
        return res.status(404).json({ message: 'Worker not found for this username/subdomain' });
    }

    const newFine = {
        amount: fineAmount,
        date: new Date(),
        reason: reason || `Unread WhatsApp message past ${settings.unreadMessageFineConfig.thresholdHours}h SLA`
    };
    worker.fines.push(newFine);

    const currentSalary = worker.finalSalary !== undefined ? worker.finalSalary : worker.salary || 0;
    worker.finalSalary = Math.max(0, currentSalary - fineAmount);
    await worker.save();

    try {
        let wallet = await CommunityFundWallet.findOne({ subdomain: worker.subdomain });
        if (!wallet) {
            wallet = await CommunityFundWallet.create({
                totalBalance: 0,
                totalFinesCollected: 0,
                subdomain: worker.subdomain
            });
        }
        wallet.totalBalance += fineAmount;
        wallet.totalFinesCollected += fineAmount;
        await wallet.save();

        await CommunityFundTransaction.create({
            employeeId: worker._id,
            amount: fineAmount,
            type: 'credit',
            source: 'fine',
            reason: newFine.reason,
            referenceId: worker.fines[worker.fines.length - 1]._id,
            createdBy: null,
            subdomain: worker.subdomain
        });
    } catch (error) {
        console.error('Error updating Community Fund (gowhats fine):', error);
    }

    res.status(200).json({ message: 'Fine applied', workerId: worker._id, fineAmount });
});

module.exports = {
    addFine,
    removeFine,
    deleteFine,
    updateFine,
    getWorkerFines,
    getMyFines,
    getAllFines,
    addFineFromWebhook,
    addFineFromGowhats
};