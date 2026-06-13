/**
 * MCP Tool Dispatcher
 * Executes structured FinOps database tools for the AI FinOps Agent.
 * The AI must call these tools BEFORE answering any cost/billing question.
 */

const CostHistory = require('../models/CostHistory');
const ResourceCost = require('../models/ResourceCost');
const AwsResource = require('../models/AwsResource');
const AwsRecommendation = require('../models/AwsRecommendation');
const AwsAnomaly = require('../models/AwsAnomaly');
const AwsForecast = require('../models/AwsForecast');

/**
 * Tool definitions schema (sent to the AI for tool selection)
 */
const TOOL_DEFINITIONS = [
  { name: 'get_monthly_cost', description: 'Get current month-to-date total cloud spend and comparison vs last month', parameters: {} },
  { name: 'get_daily_cost', description: 'Get daily cost breakdown for last N days by service', parameters: { days: 'integer (default 30)' } },
  { name: 'get_top_cost_services', description: 'Get top N services by total spend in the past 30 days', parameters: { limit: 'integer (default 5)' } },
  { name: 'get_top_cost_resources', description: 'Get top N individual resources by total cost', parameters: { limit: 'integer (default 10)' } },
  { name: 'get_cost_by_project', description: 'Get spend grouped by Project tag', parameters: {} },
  { name: 'get_cost_by_team', description: 'Get spend grouped by Team tag', parameters: {} },
  { name: 'get_cost_by_environment', description: 'Get spend grouped by Environment tag', parameters: {} },
  { name: 'get_cost_by_account', description: 'Get total spend grouped by AWS Account ID', parameters: {} },
  { name: 'get_cost_by_owner', description: 'Get spend grouped by Owner tag (team/person responsible)', parameters: {} },
  { name: 'get_idle_resources', description: 'List idle or over-provisioned resources with recommendations', parameters: {} },
  { name: 'get_compute_optimizer_recommendations', description: 'Get rightsizing recommendations from Compute Optimizer', parameters: {} },
  { name: 'get_savings_plan_recommendations', description: 'Get Savings Plan commitment recommendations', parameters: {} },
  { name: 'get_rds_rightsizing', description: 'Get RDS-specific rightsizing suggestions', parameters: {} },
  { name: 'get_unused_ebs', description: 'Get unattached or unused EBS volumes', parameters: {} },
  { name: 'get_anomalies', description: 'Get active billing anomalies and cost spikes above threshold', parameters: { severity: 'string (optional: Critical|High|Medium|Low)' } },
  { name: 'explain_anomaly', description: 'Get detailed explanation of a specific anomaly by service name or resource ID', parameters: { service: 'string' } },
  { name: 'cost_spike_analysis', description: 'Analyze cost spikes comparing vs baselines for a given service', parameters: { service: 'string' } },
  { name: 'forecast_month_end_bill', description: 'Get projected month-end total spend', parameters: {} },
  { name: 'forecast_quarterly_bill', description: 'Get projected quarterly spend', parameters: {} },
  { name: 'forecast_yearly_bill', description: 'Get projected annual spend', parameters: {} },
];

/**
 * Executes an MCP tool by name with given parameters
 * @param {string} toolName
 * @param {object} params
 * @param {string} subdomain
 * @returns {Promise<object>} Tool result
 */
const executeTool = async (toolName, params = {}, subdomain) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  switch (toolName) {
    case 'get_monthly_cost': {
      const [mtd, last] = await Promise.all([
        CostHistory.aggregate([
          { $match: { subdomain, date: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$cost' } } }
        ]),
        CostHistory.aggregate([
          { $match: { subdomain, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
          { $group: { _id: null, total: { $sum: '$cost' } } }
        ])
      ]);
      const mtdSpend = mtd[0]?.total || 0;
      const lastSpend = last[0]?.total || 0;
      const change = lastSpend > 0 ? (((mtdSpend - lastSpend) / lastSpend) * 100).toFixed(1) : 0;
      return { mtdSpend: mtdSpend.toFixed(2), lastMonthSpend: lastSpend.toFixed(2), momChange: `${change}%` };
    }

    case 'get_daily_cost': {
      const days = params.days || 30;
      const since = new Date(now);
      since.setDate(now.getDate() - days);
      const daily = await CostHistory.aggregate([
        { $match: { subdomain, date: { $gte: since } } },
        { $group: { _id: { date: '$date', service: '$service' }, cost: { $sum: '$cost' } } },
        { $sort: { '_id.date': 1 } }
      ]);
      return daily.map(d => ({ date: d._id.date, service: d._id.service, cost: d.cost.toFixed(2) }));
    }

    case 'get_top_cost_services': {
      const limit = params.limit || 5;
      const services = await CostHistory.aggregate([
        { $match: { subdomain, date: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$service', total: { $sum: '$cost' } } },
        { $sort: { total: -1 } },
        { $limit: limit }
      ]);
      return services.map(s => ({ service: s._id, total30d: s.total.toFixed(2) }));
    }

    case 'get_top_cost_resources': {
      const limit = params.limit || 10;
      const resources = await ResourceCost.aggregate([
        { $match: { subdomain, date: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$resourceId', service: { $first: '$service' }, total: { $sum: '$cost' } } },
        { $sort: { total: -1 } },
        { $limit: limit }
      ]);
      return resources.map(r => ({ resourceId: r._id, service: r.service, total30d: r.total.toFixed(2) }));
    }

    case 'get_cost_by_project':
    case 'get_cost_by_team':
    case 'get_cost_by_environment':
    case 'get_cost_by_owner': {
      const tagMap = {
        get_cost_by_project: 'Project',
        get_cost_by_team: 'Team',
        get_cost_by_environment: 'Environment',
        get_cost_by_owner: 'Owner'
      };
      const tag = tagMap[toolName];
      const tagKey = `tags.${tag}`;
      const results = await CostHistory.aggregate([
        { $match: { subdomain, date: { $gte: thirtyDaysAgo }, [tagKey]: { $exists: true } } },
        { $group: { _id: `$${tagKey}`, total: { $sum: '$cost' } } },
        { $sort: { total: -1 } }
      ]);
      return results.map(r => ({ [tag.toLowerCase()]: r._id, total30d: r.total.toFixed(2) }));
    }

    case 'get_cost_by_account': {
      const results = await CostHistory.aggregate([
        { $match: { subdomain, date: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$awsAccountId', total: { $sum: '$cost' } } },
        { $sort: { total: -1 } }
      ]);
      return results.map(r => ({ awsAccountId: r._id || 'Unknown', total30d: r.total.toFixed(2) }));
    }

    case 'get_idle_resources': {
      const idle = await AwsRecommendation.find({ subdomain, recommendationType: 'idle_resource', status: 'Active' });
      return idle.map(r => ({
        resourceId: r.resourceId, resourceName: r.resourceName, resourceType: r.resourceType,
        monthlySavings: r.monthlySavings, riskLevel: r.riskLevel,
        businessImpact: r.impactAnalysis?.businessImpactDescription
      }));
    }

    case 'get_compute_optimizer_recommendations': {
      const recs = await AwsRecommendation.find({ subdomain, recommendationType: 'rightsizing', status: 'Active' });
      return recs.map(r => ({
        resourceId: r.resourceId, resourceName: r.resourceName, resourceType: r.resourceType,
        currentSpec: r.currentDetails, recommendedSpec: r.recommendedDetails,
        currentCost: r.currentCost, projectedCost: r.recommendedCost,
        monthlySavings: r.monthlySavings, annualSavings: r.annualSavings,
        riskLevel: r.riskLevel, confidenceScore: r.confidenceScore
      }));
    }

    case 'get_savings_plan_recommendations': {
      const plans = await AwsRecommendation.find({ subdomain, recommendationType: 'savings_plan', status: 'Active' });
      return plans.map(r => ({
        type: r.recommendedDetails?.type, term: r.recommendedDetails?.term,
        hourlyCommitment: r.recommendedDetails?.hourlyCommitment,
        monthlySavings: r.monthlySavings, annualSavings: r.annualSavings,
        confidenceScore: r.confidenceScore
      }));
    }

    case 'get_rds_rightsizing': {
      const rds = await AwsRecommendation.find({ subdomain, recommendationType: 'rightsizing', resourceType: 'rds', status: 'Active' });
      return rds.map(r => ({
        resourceId: r.resourceId, currentClass: r.currentDetails?.dbInstanceClass,
        recommendedClass: r.recommendedDetails?.dbInstanceClass,
        monthlySavings: r.monthlySavings, annualSavings: r.annualSavings
      }));
    }

    case 'get_unused_ebs': {
      const ebs = await AwsRecommendation.find({ subdomain, recommendationType: 'cleanup', resourceType: 'ebs', status: 'Active' });
      return ebs.map(r => ({
        resourceId: r.resourceId, sizeGb: r.currentDetails?.sizeGb, volumeType: r.currentDetails?.volumeType,
        monthlySavings: r.monthlySavings
      }));
    }

    case 'get_anomalies': {
      const query = { subdomain, status: 'Active' };
      if (params.severity) query.severity = params.severity;
      const anomalies = await AwsAnomaly.find(query).sort({ date: -1 }).limit(20);
      return anomalies.map(a => ({
        service: a.service, date: a.date, severity: a.severity,
        detectedCost: a.detectedCost, baselineCost: a.baselineCost,
        increasePercentage: a.increasePercentage, reason: a.reason
      }));
    }

    case 'explain_anomaly': {
      // Search by service name first, then fall back to resourceId or partial match
      let anomaly = await AwsAnomaly.findOne({ subdomain, service: params.service }).sort({ date: -1 });
      if (!anomaly) {
        // Try case-insensitive partial match on service name
        anomaly = await AwsAnomaly.findOne({
          subdomain,
          service: { $regex: params.service, $options: 'i' }
        }).sort({ date: -1 });
      }
      if (!anomaly) return { message: `No anomaly found for: ${params.service}. Try get_anomalies to see all active anomalies.` };
      return {
        service: anomaly.service, date: anomaly.date, severity: anomaly.severity,
        detectedCost: anomaly.detectedCost, baselineCost: anomaly.baselineCost,
        increasePercentage: anomaly.increasePercentage, reason: anomaly.reason,
        cloudWatchCorrelation: anomaly.cloudWatchCorrelation,
        status: anomaly.status
      };
    }

    case 'cost_spike_analysis': {
      const recent = await CostHistory.find({ subdomain, service: params.service }).sort({ date: -1 }).limit(30);
      if (recent.length < 3) return { message: `Insufficient data for service: ${params.service}` };
      const avg = recent.slice(1).reduce((s, r) => s + r.cost, 0) / (recent.length - 1);
      const latest = recent[0];
      const spike = (((latest.cost - avg) / avg) * 100).toFixed(1);
      return {
        service: params.service, latestDate: latest.date, latestCost: latest.cost.toFixed(2),
        averageCost30d: avg.toFixed(2), spikePercentage: `${spike}%`,
        isAnomaly: Math.abs(spike) >= 30
      };
    }

    case 'forecast_month_end_bill': {
      const f = await AwsForecast.findOne({ subdomain, forecastType: 'month_end' });
      return f ? { forecastType: 'month_end', predictedSpend: f.predictedSpend, confidenceLow: f.confidenceLow, confidenceHigh: f.confidenceHigh, trendAnalysis: f.trendAnalysis } : { message: 'No forecast available yet. Run a sync to generate forecasts.' };
    }

    case 'forecast_quarterly_bill': {
      const f = await AwsForecast.findOne({ subdomain, forecastType: 'quarterly' });
      return f ? { forecastType: 'quarterly', predictedSpend: f.predictedSpend, confidenceLow: f.confidenceLow, confidenceHigh: f.confidenceHigh, trendAnalysis: f.trendAnalysis } : { message: 'No quarterly forecast available yet.' };
    }

    case 'forecast_yearly_bill': {
      const f = await AwsForecast.findOne({ subdomain, forecastType: 'annual' });
      return f ? { forecastType: 'annual', predictedSpend: f.predictedSpend, confidenceLow: f.confidenceLow, confidenceHigh: f.confidenceHigh, trendAnalysis: f.trendAnalysis } : { message: 'No annual forecast available yet.' };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
};

module.exports = { TOOL_DEFINITIONS, executeTool };
