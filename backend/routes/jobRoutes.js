// routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const jobManager = require('../utils/jobManager');

router.get('/status/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const job = jobManager.getJob(jobId);

    if (!job) {
        return res.status(404).json({ message: 'Job not found.' });
    }

    res.json(job);
});

module.exports = router;