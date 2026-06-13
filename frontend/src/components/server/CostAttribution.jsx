import React, { useState, useEffect } from 'react';
import { getCostsAttribution } from '../../services/serverService';
import { FiPieChart, FiColumns, FiLayers, FiInfo } from 'react-icons/fi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CostAttribution = () => {
  const [attribution, setAttribution] = useState([]);
  const [groupBy, setGroupBy] = useState('Project');
  const [isLoading, setIsLoading] = useState(true);

  const fetchAttributionData = async () => {
    setIsLoading(true);
    try {
      const data = await getCostsAttribution(groupBy);
      setAttribution(data);
    } catch (error) {
      console.error('Failed to load cost attribution:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttributionData();
  }, [groupBy]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">Cost Attribution</h1>
          <p className="text-slate-500 text-sm mt-1">Attribute unblended cloud costs across company tags and Kubernetes container namespaces.</p>
        </div>

        {/* Group By selector */}
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-sm"
        >
          <option value="Project">Project Tag</option>
          <option value="Team">Team Tag</option>
          <option value="Environment">Environment Tag</option>
          <option value="Owner">Owner Tag</option>
          <option value="Application">Application Tag</option>
          <option value="CostCenter">CostCenter Tag</option>
          <option value="Namespace">EKS Namespace</option>
          <option value="Pod">EKS Pod</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Attribution Bar Chart */}
        <div className="xl:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[400px]">
          <h2 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
            <FiPieChart className="text-teal-600" />
            <span>Spend Share by {groupBy}</span>
          </h2>

          {isLoading ? (
            <div className="flex justify-center items-center h-72">
              <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
          ) : attribution.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 text-center">
              <FiInfo className="w-10 h-10 text-slate-300 mb-3" />
              <h3 className="text-slate-700 font-bold text-sm">No attribution data</h3>
              <p className="text-slate-400 text-xs mt-1">Cost entries mapped with tag labels are required to plot attribution charts.</p>
            </div>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis dataKey="group" type="category" stroke="#94a3b8" fontSize={10} tickLine={false} width={100} />
                  <Tooltip contentStyle={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #f1f5f9', fontSize: '11px', fontWeight: '600' }} />
                  <Bar dataKey="cost" fill="#0d9488" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Attribution Table Grid */}
        <div className="xl:col-span-1 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
          <h2 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
            <FiColumns className="text-teal-600" />
            <span>Attribution Breakdown</span>
          </h2>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
          ) : attribution.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">No records found</div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="pb-3 capitalize">{groupBy}</th>
                      <th className="pb-3 text-right">Cost ($)</th>
                      <th className="pb-3 text-right">Share (%)</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs text-slate-700 divide-y divide-slate-50">
                    {attribution.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 font-semibold text-slate-900 truncate max-w-[120px]">{item.group}</td>
                        <td className="py-3 text-right font-mono font-semibold">${item.cost.toLocaleString()}</td>
                        <td className="py-3 text-right font-mono font-bold text-teal-700">{item.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default CostAttribution;
