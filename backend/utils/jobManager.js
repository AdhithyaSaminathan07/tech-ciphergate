// utils/jobManager.js

// FIX: Attach the jobs Map to the global object.
// This persists the map across hot reloads in a development environment.
if (!global.jobs) {
  global.jobs = new Map();
}
const jobs = global.jobs;

const jobManager = {
  createJob: (jobId) => {
    jobs.set(jobId, {
      id: jobId,
      state: 'queued',
      progress: 0,
      reason: null,
      returnValue: null,
    });
  },
  getJob: (jobId) => {
    return jobs.get(jobId);
  },
  updateJobProgress: (jobId, progress) => {
    const job = jobs.get(jobId);
    if (job) {
      job.progress = progress;
    }
  },
  completeJob: (jobId, returnValue) => {
    const job = jobs.get(jobId);
    if (job) {
      job.state = 'completed';
      job.progress = 100;
      job.returnValue = returnValue;
    }
  },
  failJob: (jobId, reason) => {
    const job = jobs.get(jobId);
    if (job) {
      job.state = 'failed';
      job.reason = reason;
    }
  },
};

module.exports = jobManager;