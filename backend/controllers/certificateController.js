const Certificate = require('../models/Certificate');
const Worker = require('../models/Worker');

exports.createCertificate = async (req, res) => {
    try {
        const { name, type, content, workerId } = req.body;
        const newCertificate = new Certificate({ name, type, content, worker: workerId });
        await newCertificate.save();

        // If it's a Relieving Letter and workerId is provided, update worker status
        if (type === 'Relieving' && workerId) {
            await Worker.findByIdAndUpdate(workerId, {
                status: 'Relieved',
                relievedAt: new Date(),
                relievingLetterId: newCertificate._id
            });
        }

        res.status(201).json(newCertificate);
    } catch (error) {
        res.status(500).json({ message: 'Error creating certificate', error: error.message });
    }
};

exports.getCertificatesByType = async (req, res) => {
    try {
        const { type } = req.params;
        const certificates = await Certificate.find({ type }).sort({ createdAt: -1 });
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
