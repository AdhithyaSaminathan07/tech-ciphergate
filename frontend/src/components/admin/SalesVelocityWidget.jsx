import React, { useState, useEffect } from 'react';
import { FaChartLine } from 'react-icons/fa';
import api from '../../services/api';

const SalesVelocityWidget = () => {
  const [metrics, setMetrics] = useState({
    totalOpportunities: 0,
    winRate: 0,
    avgCycleTime: 0,
    avgDealSize: 0,
    salesVelocity: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchMetrics = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const response = await api.get('/sales-velocity');
        if (isMounted && response.data?.success) {
          setMetrics(response.data.data);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error fetching sales velocity:', error);
          setHasError(true);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchMetrics();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 md:p-5 animate-pulse flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1.5">
            <div className="h-4 bg-slate-100 rounded w-28"></div>
            <div className="h-3 bg-slate-100 rounded w-40"></div>
          </div>
          <div className="w-8 h-8 bg-slate-100 rounded-lg"></div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mb-4 flex-1">
          <div className="h-16 bg-slate-100 rounded-lg"></div>
          <div className="h-16 bg-slate-100 rounded-lg"></div>
          <div className="h-16 bg-slate-100 rounded-lg"></div>
          <div className="h-16 bg-slate-100 rounded-lg"></div>
        </div>
        <div className="h-14 bg-slate-100 rounded-lg mt-auto"></div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="p-4 md:p-5 flex flex-col h-full justify-between">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-[#F0FAF4] text-[#087443] border border-[#E2ECE5] flex items-center justify-center flex-shrink-0">
            <FaChartLine size={13} />
          </div>
          <div>
            <h2 className="text-sm md:text-base font-bold text-[#0F241D] tracking-tight">
              Sales Velocity
            </h2>
            <p className="text-[11px] text-[#526A5E] font-medium mt-0.5">
              Pipeline speed & revenue efficiency
            </p>
          </div>
        </div>
        <div className="py-8 text-center text-xs text-[#526A5E] font-medium bg-[#F6F9F7] rounded-lg border border-[#E2ECE5]">
          Unable to load sales metrics
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 flex flex-col h-full justify-between">
      {/* Header */}
      <div>
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#F0FAF4] text-[#087443] border border-[#E2ECE5] flex items-center justify-center flex-shrink-0">
                <FaChartLine size={13} />
              </div>
              <h2 className="text-sm md:text-base font-bold text-[#0F241D] tracking-tight">
                Sales Velocity
              </h2>
            </div>
            <p className="text-[11px] text-[#526A5E] font-medium mt-0.5">
              Pipeline speed & revenue efficiency
            </p>
          </div>
        </div>

        {/* 4 Metric Tiles */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {/* Opportunities */}
          <div className="bg-[#F6F9F7] hover:bg-[#F0FAF4] rounded-lg p-2.5 border border-[#E2ECE5] hover:border-emerald-300 transition-all flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-[#526A5E] uppercase tracking-wider mb-0.5">
              Opportunities
            </span>
            <p className="text-base md:text-lg font-extrabold text-[#0F241D] font-display">
              {metrics.totalOpportunities}
            </p>
          </div>

          {/* Win Rate */}
          <div className="bg-[#F6F9F7] hover:bg-[#F0FAF4] rounded-lg p-2.5 border border-[#E2ECE5] hover:border-emerald-300 transition-all flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-[#526A5E] uppercase tracking-wider mb-0.5">
              Win Rate
            </span>
            <p className="text-base md:text-lg font-extrabold text-[#087443] font-display">
              {metrics.winRate}%
            </p>
          </div>

          {/* Cycle Time */}
          <div className="bg-[#F6F9F7] hover:bg-[#F0FAF4] rounded-lg p-2.5 border border-[#E2ECE5] hover:border-emerald-300 transition-all flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-[#526A5E] uppercase tracking-wider mb-0.5">
              Cycle Time
            </span>
            <p className="text-base md:text-lg font-extrabold text-[#0F241D] font-display flex items-baseline gap-1">
              <span>{metrics.avgCycleTime}</span>
              <span className="text-[10px] font-normal text-[#526A5E]">Days</span>
            </p>
          </div>

          {/* Avg Deal Size */}
          <div className="bg-[#F6F9F7] hover:bg-[#F0FAF4] rounded-lg p-2.5 border border-[#E2ECE5] hover:border-emerald-300 transition-all flex flex-col justify-between">
            <span className="text-[10px] font-semibold text-[#526A5E] uppercase tracking-wider mb-0.5">
              Avg Deal Size
            </span>
            <p className="text-sm md:text-base font-extrabold text-[#0F241D] font-display font-mono truncate">
              ₹{Number(metrics.avgDealSize || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      {/* Calculated Velocity Banner */}
      <div className="mt-1 bg-gradient-to-r from-[#087443] to-[#079455] text-white rounded-lg p-3 flex justify-between items-center shadow-sm">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-100 mb-0.5">
            Calculated Velocity
          </p>
          <p className="text-base md:text-lg font-extrabold tracking-tight">
            ₹{Number(metrics.salesVelocity || 0).toLocaleString('en-IN')}{' '}
            <span className="text-[11px] font-medium text-emerald-100">/ Day</span>
          </p>
        </div>
        <div className="text-[9.5px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/25">
          Higher is better
        </div>
      </div>
    </div>
  );
};

export default SalesVelocityWidget;
