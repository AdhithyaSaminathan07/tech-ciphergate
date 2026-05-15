const SubTaskCompletion = require('../models/SubTaskCompletion');
const Ticket = require('../models/ticketModel');
const { getIO } = require('../utils/socket');
const path = require('path');
const fs = require('fs');

// @desc    Upsert sub-task completion with proof
// @route   POST /api/tickets/completions/upload
// @access  Private/Worker
exports.upsertCompletion = async (req, res) => {
    try {
        const { ticketId, subTaskId } = req.body;
        const workerId = req.user._id;
        const subdomain = req.user.subdomain;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Proof files are mandatory' });
        }

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        // Check if worker is assigned to this ticket
        const isAssigned = ticket.assignees?.some(id => id.toString() === workerId.toString()) ||
            (ticket.assignee && ticket.assignee.toString() === workerId.toString());

        if (!isAssigned) {
            return res.status(403).json({ message: 'You are not assigned to this task' });
        }

        const fullBaseUrl = `${req.protocol}://${req.get('host')}`;
        const proofFiles = req.files.map(file => ({
            url: `${fullBaseUrl}/uploads/${file.filename}`,
            name: file.originalname,
            type: file.mimetype,
            size: file.size,
            uploadedAt: new Date()
        }));

        let completion = await SubTaskCompletion.findOne({ ticketId, subTaskId, workerId });

        if (completion) {
            // Append new files
            completion.proofFiles.push(...proofFiles);
            completion.isCompleted = true;
            completion.status = 'Submitted'; // Reset to submitted on new upload
            completion.completedAt = new Date();
            await completion.save();
        } else {
            completion = await SubTaskCompletion.create({
                ticketId,
                subTaskId,
                workerId,
                isCompleted: true,
                status: 'Submitted',
                proofFiles,
                completedAt: new Date(),
                subdomain
            });
        }

        // Socket emission (wrapped to prevent crash)
        try {
            const io = getIO();
            if (io) {
                io.to(subdomain).emit('subtask:completion_updated', {
                    ticketId,
                    subTaskId,
                    workerId,
                    completion
                });
            }
        } catch (socketErr) {
            console.error('Socket emission error:', socketErr.message);
        }

        // Check if all assigned employees have completed all sub-tasks
        const allCompletions = await SubTaskCompletion.find({ ticketId, isCompleted: true });
        const checklistCount = ticket.checklist?.length || 0;
        const totalAssigneesCount = (ticket.assignees?.length || (ticket.assignee ? 1 : 0));
        const requiredCompletionsCount = checklistCount * totalAssigneesCount;

        if (requiredCompletionsCount > 0 && allCompletions.length >= requiredCompletionsCount) {
            if (ticket.status !== 'Done' && ticket.status !== 'Review') {
                ticket.status = 'Review';
                await ticket.save();

                // Populate for complete UI update on worker side
                await ticket.populate([
                    { path: 'assignee', select: 'name username status' },
                    { path: 'assignees', select: 'name username department status' }
                ]);

                try {
                    const io = getIO();
                    if (io) io.to(subdomain).emit('ticket:updated', ticket);
                } catch (socketErr) {}
            }
        }

        // Trigger notification for Admin (wrapped to prevent crash)
        try {
            const Admin = require('../models/Admin');
            const admin = await Admin.findOne({ subdomain });
            if (admin) {
                const subTask = ticket.checklist?.find(item => item._id && item._id.toString() === subTaskId.toString());
                const { sendNotification } = require('../utils/sendNotification');
                await sendNotification({
                    userId: admin._id,
                    userModel: 'Admin',
                    subdomain,
                    title: 'Proof Submitted',
                    message: `${req.user.name || 'Worker'} submitted proof for: "${subTask ? subTask.text : 'Sub-task'}" in task: ${ticket.title}`,
                    type: 'proof_submitted',
                    link: `/admin/work-allocation`
                });
            }
        } catch (notifErr) {
            console.error('Notification error in upsertCompletion:', notifErr.message);
        }

        res.status(200).json({
            success: true,
            message: 'Proof uploaded successfully',
            fileUrl: proofFiles[proofFiles.length - 1].url,
            completion
        });
    } catch (error) {
        console.error('Upsert Completion Error:', error);
        res.status(500).json({ success: false, message: 'Error saving completion', error: error.message });
    }
};

// @desc    Get completions for a ticket
// @route   GET /api/tickets/:ticketId/completions
// @access  Private
exports.getTicketCompletions = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const completions = await SubTaskCompletion.find({ ticketId })
            .populate('workerId', 'name username department');

        res.status(200).json(completions);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching completions', error: error.message });
    }
};

// @desc    Delete a proof file
// @route   DELETE /api/tickets/completions/:completionId/proof/:fileId
// @access  Private/Worker
exports.deleteProofFile = async (req, res) => {
    try {
        const { completionId, fileId } = req.params;
        const completion = await SubTaskCompletion.findById(completionId);

        if (!completion) {
            return res.status(404).json({ message: 'Completion record not found' });
        }

        if (completion.workerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete this file' });
        }

        const file = completion.proofFiles.find(f => f._id.toString() === fileId);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Delete from filesystem
        const filename = file.url.split('/').pop();
        const filePath = path.join(__dirname, '..', 'uploads', filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        completion.proofFiles.pull(fileId);

        // If no files left, maybe mark as not completed? 
        // User says mandatory proof for completion.
        if (completion.proofFiles.length === 0) {
            completion.isCompleted = false;
            completion.completedAt = null;
        }

        await completion.save();

        const io = getIO();
        io.to(completion.subdomain).emit('subtask:completion_updated', {
            ticketId: completion.ticketId,
            subTaskId: completion.subTaskId,
            workerId: completion.workerId,
            completion
        });

        res.status(200).json(completion);
    } catch (error) {
        res.status(500).json({ message: 'Error deleting file', error: error.message });
    }
};

// @desc    Delete a reference file
// @route   DELETE /api/tickets/completions/:completionId/reference/:fileId
// @access  Private/Admin
exports.deleteReferenceFile = async (req, res) => {
    try {
        const { completionId, fileId } = req.params;
        const completion = await SubTaskCompletion.findById(completionId);

        if (!completion) {
            return res.status(404).json({ message: 'Completion record not found' });
        }

        // Only admin can delete reference files
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete reference files' });
        }

        const file = completion.referenceFiles.find(f => f._id.toString() === fileId);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Delete from filesystem
        const filename = file.url.split('/').pop();
        const filePath = path.join(__dirname, '..', 'uploads', filename);
        const fs = require('fs');
        const path = require('path');
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        completion.referenceFiles.pull(fileId);
        await completion.save();

        const { getIO } = require('../utils/socket');
        const io = getIO();
        io.to(completion.subdomain).emit('subtask:completion_updated', {
            ticketId: completion.ticketId,
            subTaskId: completion.subTaskId,
            workerId: completion.workerId,
            completion
        });

        res.status(200).json({ success: true, completion });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting reference file', error: error.message });
    }
};

// @desc    Review sub-task completion (Approve/Reject)
// @route   PUT /api/tickets/completions/:completionId/review
// @access  Private/Admin
exports.reviewCompletion = async (req, res) => {
    try {
        const { completionId } = req.params;
        const { status } = req.body; // 'Approved' or 'Rejected'

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Must be Approved or Rejected.' });
        }

        const completion = await SubTaskCompletion.findById(completionId);
        if (!completion) {
            return res.status(404).json({ message: 'Completion record not found' });
        }

        completion.status = status;
        if (status === 'Approved') {
            completion.isCompleted = true;
        } else if (status === 'Rejected') {
            completion.isCompleted = false;
        }
        await completion.save();

        const io = getIO();
        io.to(completion.subdomain).emit('subtask:completion_updated', {
            ticketId: completion.ticketId,
            subTaskId: completion.subTaskId,
            workerId: completion.workerId,
            completion
        });

        const ticket = await Ticket.findById(completion.ticketId);

        // If rejected, move ticket back from Review to In Progress
        if (status === 'Rejected') {
            if (ticket && ticket.status === 'Review') {
                ticket.status = 'In Progress';
                await ticket.save();

                // Populate for complete UI update on worker side
                await ticket.populate([
                    { path: 'assignee', select: 'name username status' },
                    { path: 'assignees', select: 'name username department status' }
                ]);

                io.to(ticket.subdomain).emit('ticket:updated', ticket);
            }
        }

        // Trigger notification for Worker
        const { sendNotification } = require('../utils/sendNotification');
        await sendNotification({
            userId: completion.workerId,
            userModel: 'Worker',
            subdomain: completion.subdomain,
            title: status === 'Approved' ? 'Submission Approved' : 'Submission Rejected',
            message: status === 'Approved'
                ? `Your proof for "${ticket.title}" has been approved.`
                : `Your proof for "${ticket.title}" was rejected. Please re-upload.`,
            type: status === 'Approved' ? 'proof_approved' : 'proof_rejected',
            link: `/worker/work-allocation`
        });

        res.status(200).json(completion);
    } catch (error) {
        res.status(500).json({ message: 'Error reviewing completion', error: error.message });
    }
};

// @desc    Upload reference files by Admin
// @route   POST /api/tickets/completions/reference
// @access  Private/Admin
exports.uploadReference = async (req, res) => {
    try {
        const { ticketId, subTaskId, workerId } = req.body;
        const subdomain = req.user.subdomain;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Reference files are mandatory' });
        }

        const fullBaseUrl = `${req.protocol}://${req.get('host')}`;
        const referenceFiles = req.files.map(file => ({
            url: `${fullBaseUrl}/uploads/${file.filename}`,
            name: file.originalname,
            type: file.mimetype,
            size: file.size,
            uploadedAt: new Date()
        }));

        let completion = await SubTaskCompletion.findOne({ ticketId, subTaskId, workerId });

        if (completion) {
            // Append new files
            if (!completion.referenceFiles) completion.referenceFiles = [];
            completion.referenceFiles.push(...referenceFiles);
            await completion.save();
        } else {
            completion = await SubTaskCompletion.create({
                ticketId,
                subTaskId,
                workerId,
                isCompleted: false, // Not completed yet
                status: 'Pending',
                referenceFiles,
                subdomain
            });
        }

        // Socket emission
        try {
            const io = require('../utils/socket').getIO();
            if (io) {
                io.to(subdomain).emit('subtask:completion_updated', {
                    ticketId,
                    subTaskId,
                    workerId,
                    completion
                });
            }
        } catch (socketErr) {
            console.error('Socket emission error:', socketErr.message);
        }

        res.status(200).json({
            success: true,
            message: 'Reference files uploaded successfully',
            completion
        });
    } catch (error) {
        console.error('Upload Reference Error:', error);
        res.status(500).json({ success: false, message: 'Error saving reference', error: error.message });
    }
};

