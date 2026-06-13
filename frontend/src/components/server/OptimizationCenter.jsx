import React, { useState, useEffect } from 'react';
import { getRecommendations, getRecommendationById, approveRecommendation, rejectRecommendation } from '../../services/serverService';
import { FiCheck, FiX, FiInfo, FiTrendingDown, FiShield, FiClock, FiCode, FiCornerDownRight, FiCopy } from 'react-icons/fi';

const OptimizationCenter = () => {
  const [recommendations, setRecommendations] = useState([]);
  const [selectedRec, setSelectedRec] = useState(null);
  const [workflowDetails, setWorkflowDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [notes, setNotes] = useState('');
  const [iacTab, setIacTab] = useState('terraform');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchRecs = async () => {
    setIsLoading(true);
    try {
      const typeParam = activeTab === 'all' ? undefined : activeTab;
      const data = await getRecommendations({ type: typeParam });
      setRecommendations(data);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecs();
  }, [activeTab]);

  const selectRecommendation = async (rec) => {
    try {
      const details = await getRecommendationById(rec._id);
      setSelectedRec(details.recommendation);
      setWorkflowDetails(details.workflow);
      setNotes(details.workflow?.notes || '');
    } catch (error) {
      console.error('Error fetching recommendation details:', error);
    }
  };

  const handleApprove = async () => {
    if (!selectedRec) return;
    setIsSubmitting(true);
    try {
      const response = await approveRecommendation(selectedRec._id, notes);
      setSelectedRec(response.recommendation);
      setWorkflowDetails(response.workflow);
      // Refresh list
      const updatedList = recommendations.map(item => 
        item._id === selectedRec._id ? response.recommendation : item
      );
      setRecommendations(updatedList);
    } catch (error) {
      console.error('Failed to approve:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRec) return;
    setIsSubmitting(true);
    try {
      const response = await rejectRecommendation(selectedRec._id, notes);
      setSelectedRec(response.recommendation);
      setWorkflowDetails(response.workflow);
      // Refresh list
      const updatedList = recommendations.map(item => 
        item._id === selectedRec._id ? response.recommendation : item
      );
      setRecommendations(updatedList);
    } catch (error) {
      console.error('Failed to reject:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">Optimization Center</h1>
          <p className="text-slate-500 text-sm mt-1">
            Review sizing analysis, decommission idle systems, and inspect generated IaC remediation blocks.
          </p>
        </div>

        {/* Tab filters */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600 shadow-inner">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('rightsizing')}
            className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'rightsizing' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
          >
            Rightsizing
          </button>
          <button
            onClick={() => setActiveTab('idle_resource')}
            className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'idle_resource' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
          >
            Idle
          </button>
          <button
            onClick={() => setActiveTab('cleanup')}
            className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'cleanup' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
          >
            Cleanup
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Recommendation Cards List */}
        <div className="xl:col-span-2 space-y-4">
          {isLoading ? (
            <div className="bg-white/80 backdrop-blur-md p-12 rounded-2xl border border-slate-100 flex justify-center items-center">
              <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-md p-12 rounded-2xl border border-slate-100 text-center flex flex-col items-center justify-center">
              <FiCheck className="w-10 h-10 text-emerald-500 bg-emerald-50 p-2 rounded-full mb-3" />
              <h3 className="text-slate-700 font-bold text-sm">Perfect Resource Optimization</h3>
              <p className="text-slate-400 text-xs mt-1">Compute Optimizer has detected no idle resources or over-provisioned specs.</p>
            </div>
          ) : (
            recommendations.map(rec => (
              <div
                key={rec._id}
                onClick={() => selectRecommendation(rec)}
                className={`bg-white/90 p-5 rounded-2xl border transition cursor-pointer hover:border-teal-500/30 hover:shadow-md ${
                  selectedRec?._id === rec._id ? 'border-teal-500 ring-2 ring-teal-500/10' : 'border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.01)]'
                }`}
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {rec.recommendationType}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        rec.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                        rec.status === 'Rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {rec.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 font-sans">{rec.resourceName || rec.resourceId}</h3>
                    <p className="text-xs text-slate-400 font-medium">Type: <span className="uppercase">{rec.resourceType}</span> | Account ID: {rec.awsAccountId}</p>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Monthly Savings</span>
                    <span className="text-lg font-black text-emerald-600 font-mono">${rec.monthlySavings.toLocaleString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-50 text-[10px] font-bold text-slate-500">
                  <div>
                    <span className="text-slate-400 block font-semibold">Risk Level</span>
                    <span className={`font-extrabold ${
                      rec.riskLevel === 'High' ? 'text-rose-600' : rec.riskLevel === 'Medium' ? 'text-amber-600' : 'text-emerald-600'
                    }`}>{rec.riskLevel}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold">Implementation Effort</span>
                    <span className="text-slate-700">{rec.implementationEffort}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold">Confidence Score</span>
                    <span className="text-slate-700 font-mono">{rec.confidenceScore}%</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Side Detail Panel / Drawer */}
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[500px]">
          {selectedRec ? (
            <div className="space-y-6">
              <div>
                <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-indigo-50 text-indigo-700">
                  {selectedRec.recommendationType}
                </span>
                <h2 className="text-base font-bold text-slate-900 mt-2 font-sans">{selectedRec.resourceName || selectedRec.resourceId}</h2>
                <p className="text-slate-400 text-xs mt-0.5 font-mono truncate">{selectedRec.resourceId}</p>
              </div>

              {/* Specs Compare (if rightsizing) */}
              {selectedRec.recommendationType === 'rightsizing' && (
                <div className="bg-slate-50 p-4 rounded-xl space-y-3 border border-slate-100 text-xs">
                  <h4 className="font-bold text-slate-800">Provisioning Adjustment</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Current</span>
                      <span className="font-semibold text-rose-700">{selectedRec.currentDetails.instanceType || selectedRec.currentDetails.dbInstanceClass || 'Provisioned'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Recommended</span>
                      <span className="font-semibold text-emerald-700 flex items-center gap-1">
                        <FiCornerDownRight />
                        {selectedRec.recommendedDetails.instanceType || selectedRec.recommendedDetails.dbInstanceClass || 'Downsized'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Impact analysis metrics */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Impact Analysis</h4>
                
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-50">
                    <span className="text-slate-400 font-semibold">Downtime Risk</span>
                    <span className={`font-bold ${
                      selectedRec.impactAnalysis?.downtimeRisk === 'High' ? 'text-rose-600' :
                      selectedRec.impactAnalysis?.downtimeRisk === 'Medium' ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {selectedRec.impactAnalysis?.downtimeRisk || 'None'}
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-50">
                    <span className="text-slate-400 font-semibold">Annual Savings</span>
                    <span className="font-bold text-emerald-600 font-mono">${selectedRec.annualSavings.toLocaleString()}</span>
                  </div>

                  <div className="py-2">
                    <span className="text-slate-400 font-semibold block mb-1">Business Impact Assessment</span>
                    <p className="text-slate-600 leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100/50">
                      {selectedRec.impactAnalysis?.businessImpactDescription || 'No risk evaluation logged.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Approvals Workflow Form */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <FiShield />
                  <span>Workflow Approvals</span>
                </h4>

                <div className="space-y-3">
                  <textarea
                    placeholder="Enter approval/rejection justification notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={selectedRec.status !== 'Active'}
                    className="w-full h-20 p-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />

                  {selectedRec.status === 'Active' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={handleReject}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-all border border-rose-200 flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <FiX /> Reject
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <FiCheck /> Approve
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                      <p className="font-semibold text-slate-700">Status: <span className="capitalize">{selectedRec.status}</span></p>
                      {workflowDetails?.approvedBy && (
                        <p className="text-slate-400 font-medium">Actioned by: {workflowDetails.approvedBy}</p>
                      )}
                      {workflowDetails?.actionedAt && (
                        <p className="text-slate-400 font-medium">Date: {new Date(workflowDetails.actionedAt).toLocaleString()}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* IaC template inspector */}
              {selectedRec.status === 'Approved' && workflowDetails && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <FiCode />
                      <span>IaC Templates</span>
                    </h4>
                    
                    <button
                      onClick={() => copyToClipboard(iacTab === 'terraform' ? workflowDetails.terraformPlan : workflowDetails.cloudFormationTemplate)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <FiCopy /> {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>

                  <div className="flex bg-slate-100 p-1 rounded-lg text-[10px] font-bold text-slate-500">
                    <button
                      onClick={() => setIacTab('terraform')}
                      className={`flex-1 py-1 rounded-md transition ${iacTab === 'terraform' ? 'bg-white text-slate-900 shadow-sm' : ''}`}
                    >
                      Terraform
                    </button>
                    <button
                      onClick={() => setIacTab('cloudformation')}
                      className={`flex-1 py-1 rounded-md transition ${iacTab === 'cloudformation' ? 'bg-white text-slate-900 shadow-sm' : ''}`}
                    >
                      CloudFormation
                    </button>
                  </div>

                  <pre className="p-3 bg-slate-950 text-slate-200 text-[10px] font-mono rounded-xl max-h-56 overflow-auto border border-slate-900 leading-relaxed select-all">
                    {iacTab === 'terraform' ? workflowDetails.terraformPlan : workflowDetails.cloudFormationTemplate}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <FiInfo className="w-8 h-8 text-slate-300 mb-2" />
              <h4 className="text-slate-700 font-bold text-xs">No Recommendation Selected</h4>
              <p className="text-slate-400 text-[10px] mt-0.5">Click any recommendation card to inspect specs impact, review decisions, and view IaC blueprints.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OptimizationCenter;
