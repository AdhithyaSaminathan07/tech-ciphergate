const CostHistory = require('../models/CostHistory');
const AwsAnomaly = require('../models/AwsAnomaly');
const AwsSettings = require('../models/AwsSettings');
const AwsAlertHistory = require('../models/AwsAlertHistory');
const { sendEmail } = require('./emailService');
const axios = require('axios');

/**
 * Evaluates cost history records to detect daily service-level spending anomalies.
 * 
 * @param {string} subdomain - Tenant boundary
 * @param {string} awsAccountId - AWS Account ID
 */
const evaluateAnomalies = async (subdomain, awsAccountId) => {
  console.log(`[Anomaly Engine] Scanning cost anomalies for account: ${awsAccountId}`);

  const settings = await AwsSettings.findOne({ subdomain });
  const alertsEnabled = settings ? settings.alertsEnabled : true;
  const slackUrl = settings?.slackWebhookUrl;
  const emails = settings?.alertEmails;

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

          // Dispatch Notification if alerts are enabled
          if (alertsEnabled) {
            const msg = `Cost Anomaly Detected: service "${service}" in account ${awsAccountId} spiked by ${increasePercent.toFixed(1)}% on ${targetDate.toISOString().split('T')[0]}. Cost: $${targetCost.toFixed(2)} vs Baseline: $${baseline.toFixed(2)}.`;
            console.log(`[Anomaly Engine] Dispatching alert: ${msg}`);

            let status = 'sent';
            let channel = 'both';

            if (slackUrl) {
              try {
                await axios.post(slackUrl, { text: `⚠️ *CIPHERGATE ANOMALY DETECTED* [${severity}]\n${msg}` });
              } catch (err) {
                console.error('[Slack Notification] Webhook post failed:', err.message);
                status = 'failed';
              }
            } else {
              channel = 'email';
            }

            if (emails) {
              const emailList = emails.split(',').map(e => e.trim()).filter(Boolean);
              for (const emailTo of emailList) {
                try {
                  await sendEmail({
                    to: emailTo,
                    subject: `[CipherGate Anomaly Alert] ${severity} spike detected on service: ${service}`,
                    text: msg,
                    html: `
                      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px;">
                        <h2 style="color: #f97316; margin-top: 0;">CipherGate FinOps Alert</h2>
                        <p style="font-size: 14px; color: #475569;"><strong>Alert Severity:</strong> ${severity}</p>
                        <p style="font-size: 14px; color: #1e293b;">${msg}</p>
                        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                        <p style="font-size: 10px; color: #94a3b8; margin-bottom: 0;">This is an automated notification from your CipherGate FinOps management server.</p>
                      </div>
                    `
                  });
                } catch (err) {
                  console.error('[Email Notification] Send failed:', err.message);
                  status = 'failed';
                }
              }
            } else if (!slackUrl) {
              channel = 'none';
            }

            // Save to Alert History
            const alertLog = new AwsAlertHistory({
              subdomain,
              awsAccountId,
              alertType: 'anomaly',
              severity,
              message: msg,
              channel,
              status,
              details: {
                service,
                detectedCost: targetCost,
                baselineCost: baseline
              }
            });
            await alertLog.save();
          }
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

/**
 * Evaluates month-to-date account spends against budget thresholds.
 * 
 * @param {string} subdomain 
 * @param {string} awsAccountId 
 */
const evaluateBudgetsAndAlerts = async (subdomain, awsAccountId) => {
  console.log(`[Budget Alert Engine] Scanning budgets for account: ${awsAccountId}`);

  const AwsBudget = require('../models/AwsBudget');
  const CostHistory = require('../models/CostHistory');
  const AwsSettings = require('../models/AwsSettings');
  const AwsAlertHistory = require('../models/AwsAlertHistory');
  const { sendEmail } = require('./emailService');

  const settings = await AwsSettings.findOne({ subdomain });
  const alertsEnabled = settings ? settings.alertsEnabled : true;
  const slackUrl = settings?.slackWebhookUrl;
  const emails = settings?.alertEmails;

  const now = new Date();
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const budgets = await AwsBudget.find({ subdomain, awsAccountId });

  for (const b of budgets) {
    const spendAgg = await CostHistory.aggregate([
      { 
        $match: { 
          subdomain, 
          awsAccountId: b.awsAccountId, 
          date: { $gte: startOfCurrentMonth } 
        } 
      },
      { $group: { _id: null, total: { $sum: '$cost' } } }
    ]);
    const actualSpend = spendAgg[0]?.total || 0;
    const thresholdLimit = (b.thresholdPercent / 100) * b.monthlyBudget;

    if (actualSpend >= thresholdLimit && b.alertEnabled && alertsEnabled) {
      // Check if alert history already has a budget breach alert for this budget name this month
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const alreadyAlerted = await AwsAlertHistory.findOne({
        subdomain,
        awsAccountId,
        alertType: 'budget',
        message: new RegExp(b.budgetName, 'i'),
        createdAt: { $gte: currentMonthStart }
      });

      if (!alreadyAlerted) {
        const severity = actualSpend >= b.monthlyBudget ? 'Critical' : 'High';
        const pct = ((actualSpend / b.monthlyBudget) * 100).toFixed(1);
        const msg = `Budget Breach: Budget "${b.budgetName}" for account ${awsAccountId} has reached ${pct}% of its $${b.monthlyBudget} limit. Current spend: $${actualSpend.toFixed(2)}.`;

        console.log(`[Budget Alert Engine] Dispatching alert for ${b.budgetName}: ${msg}`);

        let status = 'sent';
        let channel = 'both';

        if (slackUrl) {
          try {
            await axios.post(slackUrl, { text: `🚨 *CIPHERGATE BUDGET ALERT* [${severity}]\n${msg}` });
          } catch (slackErr) {
            console.error('[Slack Notification] Webhook post failed:', slackErr.message);
            status = 'failed';
          }
        } else {
          channel = 'email';
        }

        if (emails) {
          const emailList = emails.split(',').map(e => e.trim()).filter(Boolean);
          for (const emailTo of emailList) {
            try {
              await sendEmail({
                to: emailTo,
                subject: `[CipherGate Budget Alert] ${severity} breach for Budget: ${b.budgetName}`,
                text: msg,
                html: `
                  <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px;">
                    <h2 style="color: #ef4444; margin-top: 0;">CipherGate FinOps Alert</h2>
                    <p style="font-size: 14px; color: #475569;"><strong>Alert Severity:</strong> ${severity}</p>
                    <p style="font-size: 14px; color: #1e293b;">${msg}</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    <p style="font-size: 10px; color: #94a3b8; margin-bottom: 0;">This is an automated notification from your CipherGate FinOps management server.</p>
                  </div>
                `
              });
            } catch (emailErr) {
              console.error('[Email Notification] Send failed:', emailErr.message);
              status = 'failed';
            }
          }
        } else if (!slackUrl) {
          channel = 'none';
        }

        const alertLog = new AwsAlertHistory({
          subdomain,
          awsAccountId,
          alertType: 'budget',
          severity,
          message: msg,
          channel,
          status,
          details: {
            budgetName: b.budgetName,
            monthlyBudget: b.monthlyBudget,
            actualSpend: Number(actualSpend.toFixed(2)),
            thresholdPercent: b.thresholdPercent
          }
        });
        await alertLog.save();
      }
    }
  }
};

module.exports = {
  evaluateAnomalies,
  evaluateBudgetsAndAlerts
};
