import React, { useState, useEffect } from 'react';
import { getRecommendations, getCommitmentCoverage } from '../../services/serverService';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FiPercent, FiTrendingUp, FiActivity, FiDollarSign, FiInfo } from 'react-icons/fi';

const SavingsOpportunities = () => {
  const [savingsPlans, setSavingsPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [coverageScore, setCoverageScore] = useState(0);
  const [hourlyCommitment, setHourlyCommitment] = useState(0);
  const [coverageData, setCoverageData] = useState([]);

  const fetchCommitments = async () => {
    setIsLoading(true);
    try {
      const data = await getRecommendations({ type: 'savings_plan' });
      setSavingsPlans(data);
    } catch (error) {
      console.error('Error fetching savings plans recommendations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCoverage = async () => {
    try {
      const res = await getCommitmentCoverage();
      setCoverageScore(res.coverageScore || 0);
      setHourlyCommitment(res.hourlyCommitment || 0);
      setCoverageData(res.coverageData || []);
    } catch (error) {
      console.error('Error fetching coverage telemetry:', error);
    }
  };

  useEffect(() => {
    fetchCommitments();
    fetchCoverage();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">Savings Plans & Commitments</h1>
          <p className="text-slate-500 text-sm mt-1">
            Optimize EC2, Lambda, and Fargate costs by modeling commitment-based savings plans.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Coverage Percentage */}
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
            <FiPercent size={20} />
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold tracking-wide">Commitment Coverage</h3>
            <p className="text-xl font-bold text-slate-900 mt-1">{coverageScore}%</p>
            <span className="text-[10px] text-slate-400 font-semibold">Percent of compute spend covered</span>
          </div>
        </div>

        {/* Total savings commitments */}
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <FiTrendingUp size={20} />
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold tracking-wide">Active Plan Coverage</h3>
            <p className="text-xl font-bold text-slate-900 mt-1">${hourlyCommitment > 0 ? `${hourlyCommitment.toFixed(2)}/hr` : '0.00/hr'}</p>
            <span className="text-[10px] text-slate-400 font-semibold">Current committed run rates</span>
          </div>
        </div>

        {/* Savings target */}
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <FiDollarSign size={20} />
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold tracking-wide">Potential Monthly Savings</h3>
            <p className="text-xl font-bold text-slate-900 mt-1">
              ${(savingsPlans.reduce((sum, item) => sum + item.monthlySavings, 0) || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400 font-semibold">Available optimization target</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Coverage Chart */}
        <div className="xl:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[400px] flex flex-col justify-between">
          <h2 className="text-base font-bold text-slate-900 mb-6">Commitment Coverage Curve</h2>
          {coverageData.length > 0 ? (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={coverageData}>
                  <defs>
                    <linearGradient id="colorCover" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDemand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #f1f5f9', fontSize: '11px', fontWeight: '600' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                  <Area type="monotone" dataKey="Savings Plan Coverage" stroke="#0d9488" strokeWidth={2} fillOpacity={1} fill="url(#colorCover)" stackId="1" />
                  <Area type="monotone" dataKey="On-Demand Spend" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorDemand)" stackId="1" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
              <FiInfo className="w-8 h-8 mb-2 text-slate-300 animate-pulse" />
              <span>No commitment coverage telemetry cataloged. Sync the Cost Lake.</span>
            </div>
          )}
        </div>

        {/* Commitment Recommendations Column */}
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-6">
          <h2 className="text-base font-bold text-slate-900">Active Commitments Advice</h2>

          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
          ) : savingsPlans.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <FiInfo className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <span>No savings recommendations available.</span>
            </div>
          ) : (
            savingsPlans.map(plan => (
              <div key={plan._id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-4">
                <div className="space-y-1">
                  <span className="px-2 py-0.5 rounded text-[8px] font-bold bg-indigo-50 text-indigo-700">
                    {plan.recommendedDetails.type || 'Compute Savings Plan'}
                  </span>
                  <h3 className="text-xs font-bold text-slate-800 mt-1">AWS Compute Savings Plan Purchase</h3>
                  <p className="text-[10px] text-slate-400">Term: {plan.recommendedDetails.term || '3-Year'} | Risk: {plan.riskLevel}</p>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Recommended Rate</span>
                    <span className="font-bold text-slate-900 font-mono">${plan.recommendedDetails.hourlyCommitment || hourlyCommitment}/hr</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Monthly Cost</span>
                    <span className="font-bold text-slate-900 font-mono">${plan.recommendedCost.toLocaleString()}/mo</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Monthly Savings</span>
                    <span className="font-bold text-emerald-600 font-mono">${plan.monthlySavings.toLocaleString()}</span>
                  </div>
                </div>

                <div className="text-[9px] leading-relaxed text-slate-400 bg-white p-2.5 rounded-lg border border-slate-100">
                  <strong>Advice Note:</strong> Commitments are binding contracts. Verify coverage rates across other linked regions before finalizing purchase.
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SavingsOpportunities;
