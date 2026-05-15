const Certificate = require('../models/Certificate');
const Worker = require('../models/Worker');

exports.createCertificate = async (req, res) => {
    try {
        const { name, type, content, workerId, subdomain } = req.body;
        const newCertificate = new Certificate({ name, type, content, worker: workerId, subdomain });
        await newCertificate.save();

        // If it's a Relieving Letter and workerId is provided, update worker status
        if (type === 'Relieving' && workerId) {
            const beforeWorker = await Worker.findById(workerId);
            const updatedWorker = await Worker.findByIdAndUpdate(workerId, {
                status: 'Relieved',
                relievedAt: new Date(),
                relievingLetterId: newCertificate._id
            }, { new: true });

            const EmployeeHistory = require('../models/EmployeeHistory');
            if (updatedWorker) {
                await EmployeeHistory.create({
                    employee: updatedWorker._id,
                    actionType: 'Relieved',
                    performedBy: req.user ? req.user._id : null,
                    beforeData: beforeWorker ? beforeWorker.toObject() : {},
                    afterData: updatedWorker.toObject()
                });
            }
        }

        res.status(201).json(newCertificate);
    } catch (error) {
        res.status(500).json({ message: 'Error creating certificate', error: error.message });
    }
};

exports.getCertificatesByType = async (req, res) => {
    try {
        const { type } = req.params;
        const { subdomain } = req.query;
        const query = { type };
        if (subdomain) query.subdomain = subdomain;
        const certificates = await Certificate.find(query).sort({ createdAt: -1 });
        res.status(200).json(certificates);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching certificates', error: error.message });
    }
};

exports.updateCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, content } = req.body;
        const updatedCertificate = await Certificate.findByIdAndUpdate(
            id,
            { name, content },
            { new: true }
        );
        res.status(200).json(updatedCertificate);
    } catch (error) {
        res.status(500).json({ message: 'Error updating certificate', error: error.message });
    }
};

exports.deleteCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        await Certificate.findByIdAndDelete(id);
        res.status(200).json({ message: 'Certificate deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting certificate', error: error.message });
    }
};
