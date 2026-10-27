// utils/jobManager.js

// FIX: Attach the jobs Map to the global object.
// This persists the map across hot reloads in a development environment.
if (!global.jobs) {
  global.jobs = new Map();
}
const jobs = global.jobs;

const jobManager = {
  createJob: (jobId, meta = {}) => {
    jobs.set(jobId, {
      id: jobId,
      state: 'queued',
      progress: 0,
      reason: null,
      returnValue: null,
      workersProcessed: 0,
      totalWorkers: meta.totalWorkers || 0,
      totalQuestionsGenerated: 0,
      completedWorkers: [],
      failedWorkers: [],
      createdAt: new Date(),
      ...meta
    });
  },
  getJob: (jobId) => {
    return jobs.get(jobId);
  },
  updateJobProgress: (jobId, progress, meta = {}) => {
    const job = jobs.get(jobId);
    if (job) {
      job.progress = progress;
      if (job.state === 'queued') {
        job.state = 'processing';
      }
      if (meta.workersProcessed !== undefined) job.workersProcessed = meta.workersProcessed;
      if (meta.totalWorkers !== undefined) job.totalWorkers = meta.totalWorkers;
      if (meta.totalQuestionsGenerated !== undefined) job.totalQuestionsGenerated = meta.totalQuestionsGenerated;
      if (meta.completedWorkers !== undefined) job.completedWorkers = meta.completedWorkers;
      if (meta.failedWorkers !== undefined) job.failedWorkers = meta.failedWorkers;
    }
  },
  completeJob: (jobId, returnValue) => {
    const job = jobs.get(jobId);
    if (job) {
      job.state = 'completed';
      job.progress = 100;
      job.returnValue = returnValue;
      if (returnValue?.results) job.completedWorkers = returnValue.results;
      if (returnValue?.failedWorkers) job.failedWorkers = returnValue.failedWorkers;
      if (returnValue?.totalQuestionsGenerated !== undefined) {
        job.totalQuestionsGenerated = returnValue.totalQuestionsGenerated;
      }
    }
  },
  partialFailJob: (jobId, reason, returnValue) => {
    const job = jobs.get(jobId);
    if (job) {
      job.state = 'partial_failure';
      job.progress = 100;
      job.reason = reason;
      job.returnValue = returnValue;
      if (returnValue?.results) job.completedWorkers = returnValue.results;
      if (returnValue?.failedWorkers) job.failedWorkers = returnValue.failedWorkers;
      if (returnValue?.totalQuestionsGenerated !== undefined) {
        job.totalQuestionsGenerated = returnValue.totalQuestionsGenerated;
      }
    }
  },
  failJob: (jobId, reason, returnValue = null) => {
    const job = jobs.get(jobId);
    if (job) {
      job.state = 'failed';
      job.progress = 100;
      job.reason = reason;
      job.returnValue = returnValue;
      if (returnValue?.results) job.completedWorkers = returnValue.results;
      if (returnValue?.failedWorkers) job.failedWorkers = returnValue.failedWorkers;
      if (returnValue?.totalQuestionsGenerated !== undefined) {
        job.totalQuestionsGenerated = returnValue.totalQuestionsGenerated;
      }
    }
  },
};

module.exports = jobManager;