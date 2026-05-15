const Invoice = require('../models/Invoice');

// @desc    Get Sales Velocity Metrics
// @route   GET /api/sales-velocity
// @access  Private/Admin
const getSalesVelocityMetrics = async (req, res) => {
  try {
    const totalInvoices = await Invoice.countDocuments();
    
    // Opportunities: Total invoices created (every invoice was an opportunity)
    const opportunities = totalInvoices;

    // Won Invoices: Invoices that reached Stage 2 (Payment Received) or later
    const wonInvoicesCount = await Invoice.countDocuments({ 
      status: { $in: ['Payment Received', 'Work completion', 'Closure agreement'] } 
    });

    // Win Rate: (Won Invoices / Total Invoices) * 100
    const winRate = totalInvoices > 0 ? (wonInvoicesCount / totalInvoices) * 100 : 0;

    // Cycle Time: Average difference between createdAt and paymentDetails.date
    const paidInvoices = await Invoice.find({ 
      status: { $in: ['Payment Received', 'Work completion', 'Closure agreement'] },
      'paymentDetails.date': { $exists: true }
    });
    
    let totalCycleTime = 0;
    let countWithDate = 0;
    
    paidInvoices.forEach(invoice => {
      if (invoice.paymentDetails && invoice.paymentDetails.date) {
        const duration = (new Date(invoice.paymentDetails.date) - new Date(invoice.createdAt)) / (1000 * 60 * 60 * 24); // in days
        if (duration >= 0) {
          totalCycleTime += duration;
          countWithDate++;
        }
      }
    });

    const avgCycleTime = countWithDate > 0 ? totalCycleTime / countWithDate : 0;

    // Average Deal Size: Based on total value of invoices
    const allInvoices = await Invoice.find();
    let totalValue = 0;
    
    allInvoices.forEach(invoice => {
      if (invoice.items && invoice.items.length > 0) {
        const invTotal = invoice.items.reduce((sum, item) => sum + item.total, 0);
        totalValue += invTotal;
      }
    });

    const avgDealSize = allInvoices.length > 0 ? totalValue / allInvoices.length : 0;

    // Sales Velocity (V) = (Opportunities * Win Rate * Avg Deal Size) / Sales Cycle
    const closeRateFraction = winRate / 100;
    const salesVelocity = avgCycleTime > 0 
      ? (opportunities * closeRateFraction * avgDealSize) / avgCycleTime 
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalOpportunities: opportunities,
        winRate: winRate.toFixed(1),
        avgCycleTime: avgCycleTime.toFixed(1),
        avgDealSize: avgDealSize.toFixed(2),
        salesVelocity: salesVelocity.toFixed(2),
        totalProjects: totalInvoices,
        closedProjects: wonInvoicesCount
      }
    });
  } catch (error) {
    console.error('Error calculating sales velocity:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  getSalesVelocityMetrics
};

