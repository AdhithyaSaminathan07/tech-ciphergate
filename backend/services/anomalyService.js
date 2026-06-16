const CostHistory = require('../models/CostHistory');
const AwsAnomaly = require('../models/AwsAnomaly');

/**
 * Evaluates cost history records to detect daily service-level spending anomalies.
 * 
 * @param {string} subdomain - Tenant boundary
 * @param {string} awsAccountId - AWS Account ID
 */
const evaluateAnomalies = async (subdomain, awsAccountId) => {
  console.log(`[Anomaly Engine] Scanning cost anomalies for account: ${awsAccountId}`);

  // Fetch unique services and dates
  const costRecords = await CostHistory.find({ subdomain, awsAccountId }).sort({ date: 1 });
  if (costRecords.length < 10) {
    console.log('[Anomaly Engine] Insufficient historical cost data to perform anomaly baseline comparison.');
    return;
  }

  // Group costs by service
  const serviceCosts = {};
  costRecords.forEach(rec => {
    if (!serviceCosts[rec.service]) {
      serviceCosts[rec.service] = [];
    }
    serviceCosts[rec.service].push({
      date: rec.date,
      cost: rec.cost,
      id: rec._id
    });
  });

  const anomaliesToSave = [];

  for (const service of Object.keys(serviceCosts)) {
    const history = serviceCosts[service];

    // Evaluate each date (starting after 10 days to ensure a baseline exists)
    for (let i = 10; i < history.length; i++) {
      const targetRecord = history[i];
      const targetCost = targetRecord.cost;
      const targetDate = targetRecord.date;

      // Baselines: average of previous 7 days and 30 days
      const prev7Days = history.slice(Math.max(0, i - 7), i).map(h => h.cost);
      const prev30Days = history.slice(Math.max(0, i - 30), i).map(h => h.cost);

      const avg7 = prev7Days.reduce((sum, c) => sum + c, 0) / prev7Days.length;
      const avg30 = prev30Days.reduce((sum, c) => sum + c, 0) / prev30Days.length;

      // Use the 30-day average as primary baseline, falling back to 7-day if 30-day is empty
      const baseline = avg30 > 0 ? avg30 : avg7;

      if (baseline <= 0) continue;

      const increasePercent = ((targetCost - baseline) / baseline) * 100;

      // Anomaly thresholds: 30%, 50%, 100%
      if (increasePercent >= 30) {
        let severity = 'Low';
        if (increasePercent >= 100) {
          severity = 'Critical';
        } else if (increasePercent >= 50) {
          severity = 'High';
        } else {
          severity = 'Medium';
        }

        // Check if anomaly already exists for this date and service
        const exists = await AwsAnomaly.findOne({
          subdomain,
          awsAccountId,
          date: targetDate,
          service
        });

        if (!exists) {
          // CloudWatch correlation can be populated from real metrics if needed
          let correlation = {};

          anomaliesToSave.push({
            subdomain,
            awsAccountId,
            date: targetDate,
            service,
            detectedCost: targetCost,
            baselineCost: Number(baseline.toFixed(2)),
            increasePercentage: Number(increasePercent.toFixed(1)),
            severity,
            status: 'Active',
            reason: `Unusual cost increase of ${increasePercent.toFixed(1)}% over 30-day baseline.`,
            cloudWatchCorrelation: correlation
          });
        }
      }
    }
  }

  if (anomaliesToSave.length > 0) {
    await AwsAnomaly.insertMany(anomaliesToSave);
    console.log(`[Anomaly Engine] Logged ${anomaliesToSave.length} billing anomalies.`);
  } else {
    console.log('[Anomaly Engine] No new cost anomalies detected.');
  }
};

module.exports = {
  evaluateAnomalies
};
