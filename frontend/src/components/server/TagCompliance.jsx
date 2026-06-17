import React, { useState, useEffect } from 'react';
import { getTagCompliance } from '../../services/serverService';
import { FiAlertTriangle, FiCheckCircle, FiInfo, FiTag } from 'react-icons/fi';

const TagCompliance = () => {
  const [data, setData] = useState({
    overallScore: 0,
    tags: { Project: 0, Environment: 0, Team: 0, Owner: 0, Application: 0, CostCenter: 0 },
    nonCompliantCount: 0,
    nonCompliant: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedMissingTag, setSelectedMissingTag] = useState('All');

  const fetchCompliance = async () => {
    setIsLoading(true);
    try {
      const result = await getTagCompliance();
      setData(result);
    } catch (error) {
      console.error('Failed to load tag compliance:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompliance();
  }, []);

  const requiredTags = ['Project', 'Environment', 'Team', 'Owner', 'Application', 'CostCenter'];

  // Filter non-compliant resources
  const filteredResources = data.nonCompliant.filter(res => {
    const matchesSearch = 
      (res.resourceId || '').toLowerCase().includes(search.toLowerCase()) ||
      (res.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (res.type || '').toLowerCase().includes(search.toLowerCase());
    
    const matchesTag = 
      selectedMissingTag === 'All' || 
      res.missingTags.includes(selectedMissingTag);

    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950 font-sans">Tag Compliance</h1>
        <p className="text-slate-500 text-sm mt-1">
          Monitor metadata hygiene and track compliance coverage against required organizational billing keys.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overall Score Card */}
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between items-center text-center">
          <h2 className="text-sm font-bold text-slate-500 tracking-wide">Overall Tag Hygiene</h2>
          
          <div className="relative my-4 flex items-center justify-center">
            {/* Simple SVG Circular Progress */}
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="52"
                stroke="#f1f5f9"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="64"
                cy="64"
                r="52"
                stroke={data.overallScore >= 80 ? '#10b981' : data.overallScore >= 50 ? '#f59e0b' : '#ef4444'}
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - data.overallScore / 100)}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-3xl font-extrabold text-slate-800 font-sans">{data.overallScore}%</span>
              <span className="text-[10px] text-slate-400 font-semibold tracking-wider">Health Score</span>
            </div>
          </div>

          <div className="text-xs font-semibold text-slate-500">
            {data.overallScore >= 80 ? (
              <span className="text-emerald-600 flex items-center gap-1"><FiCheckCircle /> Healthy Tag Configuration</span>
            ) : (
              <span className="text-amber-600 flex items-center gap-1"><FiAlertTriangle /> Tags require remediation</span>
            )}
          </div>
        </div>

        {/* Required Tags Grid */}
        <div className="md:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <h2 className="text-sm font-bold text-slate-500 tracking-wide mb-4">Required Key Coverage</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {requiredTags.map(tag => {
              const score = data.tags[tag] || 0;
              return (
                <div key={tag} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <FiTag className="text-indigo-500" size={12} />
                      {tag}
                    </span>
                    <span className="font-bold text-slate-900">{score}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${ score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500' }`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Non-Compliant Resource Browser */}
      <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Non-Compliant Resource Inventory</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Showing {filteredResources.length} of {data.nonCompliantCount} resources missing one or more required tags.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search resource..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-sm w-full sm:w-44"
            />
            
            <select
              value={selectedMissingTag}
              onChange={(e) => setSelectedMissingTag(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-sm"
            >
              <option value="All">All Missing Tags</option>
              {requiredTags.map(tag => (
                <option key={tag} value={tag}>Missing {tag}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FiCheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
            <h4 className="text-slate-700 font-bold text-xs">Perfect Compliance</h4>
            <p className="text-slate-400 text-[10px] mt-0.5">All discovered resources have complete metadata configurations.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 tracking-wider">
                  <th className="pb-3">Resource ID</th>
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Missing Tags</th>
                </tr>
              </thead>
              <tbody className="text-xs text-slate-700 divide-y divide-slate-50">
                {filteredResources.map((res, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 font-semibold font-mono text-slate-900 truncate max-w-[180px]">
                      {res.resourceId}
                    </td>
                    <td className="py-3 text-slate-600 truncate max-w-[120px]">{res.name}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 capitalize">
                        {res.type}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {res.missingTags.map(tag => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-100"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TagCompliance;
