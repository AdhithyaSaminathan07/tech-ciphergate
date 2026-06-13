const CostHistory = require('../models/CostHistory');
const AwsForecast = require('../models/AwsForecast');

/**
 * Calculates multi-horizon spending projections using linear regression trend analysis.
 * 
 * @param {string} subdomain - Tenant subdomain
 * @param {string} awsAccountId - AWS Account ID
 */
const generateForecasts = async (subdomain, awsAccountId) => {
  console.log(`[Forecasting Engine] Calculating spending trends for account: ${awsAccountId}`);

  // Fetch past 60 days of daily aggregates
  const history = await CostHistory.aggregate([
    { $match: { subdomain, awsAccountId } },
    { $group: { _id: '$date', dailyTotal: { $sum: '$cost' } } },
    { $sort: { _id: 1 } }
  ]);

  if (history.length < 5) {
    console.log('[Forecasting Engine] Insufficient historical cost aggregates to calculate projections.');
    return;
  }

  // Linear Regression: y = mx + b
  const n = history.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  history.forEach((h, idx) => {
    const x = idx;
    const y = h.dailyTotal;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });

  const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const b = (sumY - m * sumX) / n;

  // Let's get current month configuration
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const remainingDaysInMonth = Math.max(1, daysInMonth - currentDay);

  // Projections:
  // 1. Month-End Forecast: MTD Spend + Projected daily spend for remaining days
  const averageCurrentDaily = sumY / n;
  const mtdAgg = await CostHistory.aggregate([
    { $match: { subdomain, awsAccountId, date: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } } },
    { $group: { _id: null, total: { $sum: '$cost' } } }
  ]);
  const mtdSpend = mtdAgg[0]?.total || 0;

  // Extrapolate daily projection
  let projectedRemainingSpend = 0;
  for (let i = 1; i <= remainingDaysInMonth; i++) {
    const projectedDayCost = Math.max(0, m * (n + i) + b);
    projectedRemainingSpend += projectedDayCost;
  }
  const monthEndSpend = mtdSpend + projectedRemainingSpend;

  // 2. Quarterly Forecast (Next 90 Days)
  let quarterlySpend = 0;
  for (let i = 1; i <= 90; i++) {
    const projectedDayCost = Math.max(0, m * (n + i) + b);
    quarterlySpend += projectedDayCost;
  }

  // 3. Annual Forecast (Next 365 Days)
  let annualSpend = 0;
  for (let i = 1; i <= 365; i++) {
    const projectedDayCost = Math.max(0, m * (n + i) + b);
    annualSpend += projectedDayCost;
  }

  // Baseline Comparison (Last 30 days total run rate)
  const baselineMonthRunRate = averageCurrentDaily * 30;

  // Save forecasts
  await AwsForecast.deleteMany({ subdomain, awsAccountId });

  const forecasts = [
    {
      subdomain,
      awsAccountId,
      forecastType: 'month_end',
      targetDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      predictedSpend: Number(monthEndSpend.toFixed(2)),
      baselineSpend: Number(baselineMonthRunRate.toFixed(2)),
      confidenceLow: Number((monthEndSpend * 0.92).toFixed(2)),
      confidenceHigh: Number((monthEndSpend * 1.08).toFixed(2)),
      trendAnalysis: m > 0 ? 'Spending trend is upward. Compute requirements scaling.' : 'Spending trend is flat/downward.'
    },
    {
      subdomain,
      awsAccountId,
      forecastType: 'quarterly',
      targetDate: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      predictedSpend: Number(quarterlySpend.toFixed(2)),
      baselineSpend: Number((baselineMonthRunRate * 3).toFixed(2)),
      confidenceLow: Number((quarterlySpend * 0.88).toFixed(2)),
      confidenceHigh: Number((quarterlySpend * 1.15).toFixed(2)),
      trendAnalysis: m > 0 ? 'Quarterly run rates rising due to incremental server scaling.' : 'Quarterly run rates holding stable.'
    },
    {
      subdomain,
      awsAccountId,
      forecastType: 'annual',
      targetDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      predictedSpend: Number(annualSpend.toFixed(2)),
      baselineSpend: Number((baselineMonthRunRate * 12).toFixed(2)),
      confidenceLow: Number((annualSpend * 0.82).toFixed(2)),
      confidenceHigh: Number((annualSpend * 1.25).toFixed(2)),
      trendAnalysis: m > 0 ? 'Annual trajectory projection tracks double-digit infrastructure scaling.' : 'Annual budget projections are within baseline limits.'
    }
  ];

  for (const f of forecasts) {
    const doc = new AwsForecast(f);
    await doc.save();
  }

  console.log(`[Forecasting Engine] Generated 3 forecast periods for account ${awsAccountId}.`);
};

module.exports = {
  generateForecasts
};
