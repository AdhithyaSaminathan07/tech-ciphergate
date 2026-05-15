import React, { useState, useEffect } from 'react';
import { FaChartLine } from 'react-icons/fa';

const SalesVelocityWidget = () => {
  const [metrics, setMetrics] = useState({
    totalOpportunities: 0,
    winRate: 0,
    avgCycleTime: 0,
    avgDealSize: 0,
    salesVelocity: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('/api/sales-velocity', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        const data = await response.json();
        
        if (data.success) {
          setMetrics(data.data);
        }
      } catch (error) {
        console.error('Error fetching sales velocity:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-6 bg-dash-bg rounded w-1/3 mb-6"></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-20 bg-dash-bg rounded-[24px]"></div>
          <div className="h-20 bg-dash-bg rounded-[24px]"></div>
          <div className="h-20 bg-dash-bg rounded-[24px]"></div>
          <div className="h-20 bg-dash-bg rounded-[24px]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4 md:mb-6">
        <div>
          <h2 className="dash-title">
            Sales Velocity
          </h2>
          <p className="text-[12px] text-dash-muted font-medium mt-0.5">Pipeline speed & revenue efficiency</p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-dash-soft-green text-dash-green flex items-center justify-center">
          <FaChartLine size={18} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="bg-dash-bg/40 rounded-2xl md:rounded-[24px] p-3 md:p-4 border border-dash-border flex flex-col items-center justify-center text-center transition-all hover:bg-white hover:shadow-sm">
          <p className="dash-label mb-0.5 md:mb-1">Opportunities</p>
          <p className="text-[16px] md:text-[20px] font-bold text-dash-text">{metrics.totalOpportunities}</p>
        </div>
        <div className="bg-dash-bg/40 rounded-2xl md:rounded-[24px] p-3 md:p-4 border border-dash-border flex flex-col items-center justify-center text-center transition-all hover:bg-white hover:shadow-sm">
          <p className="dash-label mb-0.5 md:mb-1">Win Rate</p>
          <p className="text-[16px] md:text-[20px] font-bold text-dash-text">{metrics.winRate}%</p>
        </div>
        <div className="bg-dash-bg/40 rounded-2xl md:rounded-[24px] p-3 md:p-4 border border-dash-border flex flex-col items-center justify-center text-center transition-all hover:bg-white hover:shadow-sm">
          <p className="dash-label mb-0.5 md:mb-1">Cycle Time</p>
          <p className="text-[16px] md:text-[20px] font-bold text-dash-text">{metrics.avgCycleTime} <span className="text-[10px] md:text-[12px] text-dash-muted">Days</span></p>
        </div>
        <div className="bg-dash-bg/40 rounded-2xl md:rounded-[24px] p-3 md:p-4 border border-dash-border flex flex-col items-center justify-center text-center transition-all hover:bg-white hover:shadow-sm">
          <p className="dash-label mb-0.5 md:mb-1">Avg Deal Size</p>
          <p className="text-[14px] md:text-[18px] font-bold text-dash-text">₹{metrics.avgDealSize}</p>
        </div>
      </div>

      <div className="mt-auto bg-dash-green text-white rounded-2xl md:rounded-[24px] p-4 md:p-5 flex justify-between items-center shadow-[0_10px_20px_rgba(94,176,99,0.2)]">
        <div>
          <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest opacity-80 mb-1">Calculated Velocity</p>
          <p className="text-[18px] md:text-[24px] font-bold">₹{metrics.salesVelocity} <span className="text-[12px] md:text-[14px] opacity-70">/ Day</span></p>
        </div>
        <div className="text-[9px] md:text-[11px] font-bold bg-white/20 px-2.5 py-1 md:px-3 md:py-1.5 rounded-full backdrop-blur-sm">
          Higher is better
        </div>
      </div>
    </div>
  );
};

export default SalesVelocityWidget;
