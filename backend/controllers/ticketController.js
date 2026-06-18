const Ticket = require('../models/ticketModel');
const { getIO } = require('../utils/socket');

const parseChecklist = (description, existingChecklist = []) => {
    if (!description) return [];

    const lines = description.split('\n');
    const checklist = [];

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        // Match checkbox [ ] or [x] OR bullets (•, -, *) OR numbered lists (1. , 2. )
        // Priority to [ ] or [x]
        const checkboxMatch = trimmed.match(/^\[([ x])\]\s+(.+)$/i);
        const bulletMatch = trimmed.match(/^([•\-\*]|\d+\.)\s+(.+)$/);

        if (checkboxMatch) {
            const isCompleted = checkboxMatch[1].toLowerCase() === 'x';
            const text = checkboxMatch[2].trim();
            checklist.push({
                text,
                completed: isCompleted,
                completedAt: isCompleted ? new Date() : null
            });
        } else if (bulletMatch) {
            const text = bulletMatch[2].trim();
            const existing = existingChecklist.find(item => item.text === text);
            checklist.push({
                text,
                completed: existing ? existing.completed : false,
                completedAt: existing ? existing.completedAt : null
            });
        }
    });

    return checklist;
};


// @desc    Get all tickets
// @route   GET /api/tickets
// @access  Private/Admin
exports.getTickets = async (req, res) => {
    try {
        const subdomain = req.user?.subdomain || req.query.subdomain;
        let query = { isDeleted: { $ne: true } };
        
        if (req.query.isDeleted === 'true') {
            query.isDeleted = true;
        }

        if (subdomain) {
            query.subdomain = subdomain;
        }

        // Add optional assignee filter
        if (req.query.assignee) {
            query.$or = [
                { assignee: req.query.assignee },
                { assignees: { $in: [req.query.assignee] } }
            ];
        }

        const tickets = await Ticket.find(query)
            .populate('assignee', 'name username status')
            .populate('assignees', 'name username department status')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json(tickets);
    } catch (error) {
        res.status(500).json({ message: 'Server error retrieving tickets', error: error.message });
    }
};

// @desc    Create a new ticket
// @route   POST /api/tickets
// @access  Private/Admin
exports.createTicket = async (req, res) => {
    try {
        const { title, description, assignee, assignees, team, priority, status, issueType, storyPoints, labels, startDate, endDate, checklist, referenceFiles } = req.body;
        const subdomain = req.user?.subdomain || req.body.subdomain;
        const reporter = req.user?._id;

        // Clean up empty strings for dates to prevent CastError
        const formattedStartDate = (startDate && startDate.trim() !== '') ? new Date(startDate) : undefined;
        const formattedEndDate = (endDate && endDate.trim() !== '') ? new Date(endDate) : undefined;

        const newTicket = new Ticket({
            title,
            description,
            assignee: assignee || undefined,
            assignees: assignees || [],
            team: team || undefined,
            priority,
            status,
            issueType,
            storyPoints: storyPoints ? Number(storyPoints) : 0,
            labels: labels || [],
            reporter,
            subdomain,
            startDate: formattedStartDate,
            endDate: formattedEndDate,
            checklist: checklist || parseChecklist(description),
            referenceFiles: referenceFiles || []
        });

        newTicket._reviewerId = req.user?._id;
        const savedTicket = await newTicket.save();

        // Update any completions created with temp ID
        const tempId = req.body.tempId;
        if (tempId) {
            const SubTaskCompletion = require('../models/SubTaskCompletion');
            const completions = await SubTaskCompletion.find({ ticketId: tempId, subdomain });
            for (const comp of completions) {
                comp.ticketId = savedTicket._id;
                const idx = parseInt(comp.subTaskId);
                if (!isNaN(idx) && savedTicket.checklist[idx]) {
                    comp.subTaskId = savedTicket.checklist[idx]._id.toString();
                }
                await comp.save();
            }
        }

        // Populate assignees before returning
        await savedTicket.populate([
            { path: 'assignee', select: 'name username status' },
            { path: 'assignees', select: 'name username department status' }
        ]);

        // Trigger push notifications
        try {
            const { sendNotification } = require('../utils/sendNotification');
            const usersToNotify = assignees || (assignee ? [assignee] : []);
            
            for (const userId of usersToNotify) {
                await sendNotification({
                    userId,
                    userModel: 'Worker',
                    subdomain: savedTicket.subdomain,
                    title: 'New Task Assigned',
                    message: `Task: ${savedTicket.title} | Priority: ${savedTicket.priority} ${savedTicket.team ? `| Team: ${savedTicket.team}` : ''}`,
                    type: 'task_assigned',
                    link: '/worker/work-allocation'
                });
            }
        } catch (notifError) {
            console.error('Notification error:', notifError.message);
            // Don't fail the whole request if notification fails
        }

        // Socket emission
        const io = getIO();
        io.to(subdomain).emit('ticket:created', savedTicket);

        res.status(201).json(savedTicket);
    } catch (error) {
        console.error('Create Ticket Error:', error);
        res.status(400).json({ message: 'Invalid ticket data', error: error.message });
    }
};

// @desc    Update a ticket
// @route   PUT /api/tickets/:id
// @access  Private/Admin
exports.updateTicket = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { title, description, assignee, assignees, team, priority, status, issueType, storyPoints, labels, startDate, endDate, checklist, feedback, workerQuery } = req.body;

        const ticket = await Ticket.findById(ticketId);

        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        // Verify subdomain access
        const subdomain = req.user?.subdomain || req.body.subdomain;
        if (subdomain && ticket.subdomain && ticket.subdomain !== subdomain) {
            return res.status(403).json({ message: 'Not authorized to access this ticket' });
        }

        if (title !== undefined) ticket.title = title;
        if (description !== undefined) ticket.description = description;
        if (assignee !== undefined) ticket.assignee = assignee;
        if (assignees !== undefined) ticket.assignees = assignees;
        if (team !== undefined) ticket.team = team;
        if (priority !== undefined) ticket.priority = priority;
        
        // Status Update Logic with Validation
        if (status !== undefined) {
            if (status === 'Done' && req.user.role !== 'admin') {
                return res.status(403).json({ message: 'Non-admin users cannot mark tasks as Done. Move to Review instead.' });
            }
            if (ticket.status === 'Done' && status !== 'Done' && req.user.role !== 'admin') {
                return res.status(403).json({ message: 'Approved/Done tasks cannot be moved back by non-admin users.' });
            }
            const previousStatus = ticket.status;
            ticket.status = status;
            // Flag for performance points if newly moved to Done
            if (status === 'Done' && previousStatus !== 'Done') {
                ticket._justCompletedForPerformance = true;
            }
        }

        if (issueType !== undefined) ticket.issueType = issueType;
        if (storyPoints !== undefined) ticket.storyPoints = storyPoints;
        if (labels !== undefined) ticket.labels = labels;
        
        // Handle empty strings for dates
        if (startDate !== undefined) {
            ticket.startDate = (startDate && startDate.trim() !== '') ? new Date(startDate) : undefined;
        }
        if (endDate !== undefined) {
            ticket.endDate = (endDate && endDate.trim() !== '') ? new Date(endDate) : undefined;
        }
        if (feedback !== undefined) ticket.feedback = feedback;
        if (workerQuery !== undefined) ticket.workerQuery = workerQuery;

        // Ensure checklist is updated if provided
        if (checklist !== undefined) {
            ticket.checklist = checklist;
        } else if (description !== undefined) {
            // Otherwise, if description is updated, re-parse it
            ticket.checklist = parseChecklist(description, ticket.checklist);
        }

        // Auto move to Review (not Done) if all checklist items are completed
        if (ticket.checklist && ticket.checklist.length > 0 && ticket.checklist.every(item => item.completed)) {
            if (ticket.status !== 'Done' && ticket.status !== 'Review') {
                ticket.status = 'Review';
            }
        }

        ticket._reviewerId = req.user?._id;
        const updatedTicket = await ticket.save();
        await updatedTicket.populate([
            { path: 'assignee', select: 'name username status' },
            { path: 'assignees', select: 'name username department status' }
        ]);

        // Trigger performance points if ticket just moved to Done
        if (ticket._justCompletedForPerformance) {
            try {
                const { awardPointsOnTicketDone } = require('./performanceController');
                const ticketSubdomain = updatedTicket.subdomain || subdomain;
                // Run async, don't block response
                awardPointsOnTicketDone(updatedTicket, ticketSubdomain).catch(err =>
                    console.error('Performance points error:', err.message)
                );
            } catch (perfErr) {
                console.error('Performance module error:', perfErr.message);
            }
        }

        // Trigger push notifications
        try {
            const { sendNotification } = require('../utils/sendNotification');
            const usersToNotify = assignees || (assignee ? [assignee] : []);
            
            for (const userId of usersToNotify) {
                await sendNotification({
                    userId,
                    userModel: 'Worker',
                    subdomain: updatedTicket.subdomain,
                    title: 'Task Updated',
                    message: `Updated: ${updatedTicket.title} | Status: ${updatedTicket.status} | Priority: ${updatedTicket.priority}`,
                    type: 'task_updated',
                    link: '/worker/work-allocation'
                });
            }
        } catch (notifError) {
            console.error('Failed to send push notifications:', notifError);
            // Don't fail the request if notifications fail
        }

        // Socket emission
        const io = getIO();
        io.to(updatedTicket.subdomain || subdomain).emit('ticket:updated', updatedTicket);

        res.status(200).json(updatedTicket);
    } catch (error) {
        res.status(400).json({ message: 'Error updating ticket', error: error.message });
    }
};

// @desc    Delete a ticket
// @route   DELETE /api/tickets/:id
// @access  Private/Admin
exports.deleteTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        // Verify subdomain access
        const subdomain = req.user?.subdomain;
        if (subdomain && ticket.subdomain && ticket.subdomain !== subdomain) {
            return res.status(403).json({ message: 'Not authorized to access this ticket' });
        }

        const subdomainForSocket = ticket.subdomain;
        
        ticket.isDeleted = true;
        ticket.deletedAt = new Date();
        ticket.deletedBy = req.user?._id;
        
        await ticket.save();

        // Socket emission
        const io = getIO();
        io.to(subdomainForSocket).emit('ticket:deleted', { id: req.params.id });

        res.status(200).json({ id: req.params.id, message: 'Ticket deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting ticket', error: error.message });
    }
};

// @desc    Upload reference files for a ticket
// @route   POST /api/tickets/:id/reference
// @access  Private/Admin
exports.uploadTicketReference = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const subdomain = req.user.subdomain;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Reference files are mandatory' });
        }

        const mongoose = require('mongoose');
        const fullBaseUrl = `${req.protocol}://${req.get('host')}`;
        const referenceFiles = req.files.map(file => ({
            _id: new mongoose.Types.ObjectId(),
            url: `${fullBaseUrl}/uploads/${file.filename}`,
            name: file.originalname,
            type: file.mimetype,
            size: file.size,
            uploadedAt: new Date()
        }));

        if (ticketId === 'new' || !mongoose.Types.ObjectId.isValid(ticketId)) {
            return res.status(200).json({
                success: true,
                message: 'Reference files uploaded successfully',
                referenceFiles
            });
        }

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }



        if (!ticket.referenceFiles) {
            ticket.referenceFiles = [];
        }
        ticket.referenceFiles.push(...referenceFiles);
        await ticket.save();

        await ticket.populate([
            { path: 'assignee', select: 'name username status' },
            { path: 'assignees', select: 'name username department status' }
        ]);

        // Socket emission
        try {
            const io = getIO();
            if (io) {
                io.to(subdomain).emit('ticket:updated', ticket);
            }
        } catch (socketErr) {
            console.error('Socket emission error:', socketErr.message);
        }

        res.status(200).json({
            success: true,
            message: 'Reference files uploaded successfully',
            ticket
        });
    } catch (error) {
        console.error('Upload Ticket Reference Error:', error);
        res.status(500).json({ success: false, message: 'Error saving reference', error: error.message });
    }
};

// @desc    Delete a ticket reference file
// @route   DELETE /api/tickets/:id/reference/:fileId
// @access  Private/Admin
exports.deleteTicketReference = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const fileId = req.params.fileId;
        const subdomain = req.user.subdomain;

        // Only admin can delete reference files
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete reference files' });
        }

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        const file = ticket.referenceFiles.find(f => f._id.toString() === fileId);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Delete from filesystem
        const filename = file.url.split('/').pop();
        const path = require('path');
        const fs = require('fs');
        const filePath = path.join(__dirname, '..', 'uploads', filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        ticket.referenceFiles.pull(fileId);
        await ticket.save();

        await ticket.populate([
            { path: 'assignee', select: 'name username status' },
            { path: 'assignees', select: 'name username department status' }
        ]);

        const io = getIO();
        if (io) {
            io.to(subdomain).emit('ticket:updated', ticket);
        }

        res.status(200).json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting reference file', error: error.message });
    }
};
