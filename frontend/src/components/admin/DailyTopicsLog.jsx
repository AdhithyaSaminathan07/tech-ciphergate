// components/admin/DailyTopicsLog.jsx
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBook,
  FaCalendarAlt,
  FaUsers,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaBuilding,
  FaSearch,
  FaCalendarPlus,
  FaChevronDown,
  FaChevronUp,
  FaCheckSquare,
  FaSquare,
  FaInfoCircle
} from 'react-icons/fa';
import { getDailyTopicsAdminLog } from '../../services/dailyTopicService';
import { getWorkers } from '../../services/workerService';
import { getDepartments } from '../../services/departmentService';
import appContext from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import CustomDatePicker from '../common/CustomDatePicker';

const formatDateYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPresetRange = (preset) => {
  const now = new Date();
  const todayStr = formatDateYMD(now);

  if (preset === 'this_week') {
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    return { startDate: formatDateYMD(monday), endDate: formatDateYMD(saturday) };
  } else if (preset === 'last_week') {
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() + diffToMonday - 7);
    const lastSaturday = new Date(lastMonday);
    lastSaturday.setDate(lastMonday.getDate() + 5);
    return { startDate: formatDateYMD(lastMonday), endDate: formatDateYMD(lastSaturday) };
  } else if (preset === 'last_14_days') {
    const past = new Date(now);
    past.setDate(now.getDate() - 14);
    return { startDate: formatDateYMD(past), endDate: todayStr };
  }
  return { startDate: todayStr, endDate: todayStr };
};

const getDayAbbreviation = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[dt.getDay()] || '';
};

const formatMMDD = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length >= 3) {
    return `${parts[1]}-${parts[2]}`;
  }
  return dateStr;
};

const DailyTopicsLog = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subdomain } = useContext(appContext);
  const effectiveSubdomain = (subdomain && subdomain !== 'main') ? subdomain : (user?.subdomain || subdomain || 'default');

  const defaultRange = getPresetRange('this_week');
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [activePreset, setActivePreset] = useState('this_week');

  const [department, setDepartment] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [departments, setDepartments] = useState([]);
  const [workers, setWorkers] = useState([]);

  const [logData, setLogData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState('worker'); // 'worker' or 'date'
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [expandedDates, setExpandedDates] = useState({});

  useEffect(() => {
    fetchMetadata();
  }, [effectiveSubdomain]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchLog();
    }
  }, [startDate, endDate, department, effectiveSubdomain]);

  // Ensure selected workers only contain active developers currently returned by the API
  useEffect(() => {
    if (logData?.workerWise) {
      const activeIds = new Set(logData.workerWise.map((item) => String(item.worker._id)));
      setSelectedWorkers((prev) => prev.filter((id) => activeIds.has(String(id))));
    } else {
      setSelectedWorkers([]);
    }
  }, [logData]);

  const fetchMetadata = async () => {
    try {
      const [workersRes, deptsRes] = await Promise.all([
        getWorkers({ subdomain: effectiveSubdomain }),
        getDepartments({ subdomain: effectiveSubdomain })
      ]);
      setWorkers(Array.isArray(workersRes) ? workersRes : []);
      setDepartments(Array.isArray(deptsRes) ? deptsRes : []);
    } catch (err) {
      console.warn('Could not load workers/departments metadata:', err.message);
    }
  };

  const fetchLog = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDailyTopicsAdminLog({
        startDate,
        endDate,
        department: department !== 'all' ? department : undefined,
        subdomain: effectiveSubdomain
      });
      setLogData(data);
    } catch (err) {
      console.error('Failed to load daily topics log:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load daily topics log.');
      setLogData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = (presetKey) => {
    setActivePreset(presetKey);
    const range = getPresetRange(presetKey);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const toggleWorkerSelection = (workerId) => {
    setSelectedWorkers((prev) =>
      prev.includes(workerId) ? prev.filter((id) => id !== workerId) : [...prev, workerId]
    );
  };

  // Filter worker-wise list by search term
  const filteredWorkerWise = useMemo(() => {
    return (logData?.workerWise || []).filter((item) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const nameMatch = item.worker.name?.toLowerCase().includes(term);
      const deptMatch = item.worker.department?.toLowerCase().includes(term);
      const empIdMatch = item.worker.employeeId?.toLowerCase().includes(term);
      return nameMatch || deptMatch || empIdMatch;
    });
  }, [logData?.workerWise, searchTerm]);

  const toggleSelectAllWorkers = () => {
    if (filteredWorkerWise.length === 0) return;
    const filteredIds = filteredWorkerWise.map((w) => w.worker._id);
    const allSelected = filteredIds.every((id) => selectedWorkers.includes(id));
    if (allSelected) {
      setSelectedWorkers((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedWorkers((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const isAllFilteredSelected = useMemo(() => {
    if (filteredWorkerWise.length === 0) return false;
    const filteredIds = filteredWorkerWise.map((w) => w.worker._id);
    return filteredIds.every((id) => selectedWorkers.includes(id));
  }, [filteredWorkerWise, selectedWorkers]);

  const toggleDateExpanded = (dateStr) => {
    setExpandedDates((prev) => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };

  const handleCreateTestSchedule = () => {
    const targetWorkers = selectedWorkers.length > 0 ? selectedWorkers : filteredWorkerWise.map((w) => w.worker._id);
    const workerParam = encodeURIComponent(targetWorkers.join(','));
    navigate(`/admin/test/schedule?create=true&workers=${workerParam}&startDate=${startDate}&endDate=${endDate}&source=daily_topics`);
  };

  return (
    <div className="space-y-5 max-w-full">
      {/* Page Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Attendance & Study Log
              </span>
              <span className="text-slate-400 text-xs font-medium">• Admin Overview</span>
            </div>
            <h1 className="text-2xl font-black text-emerald-900 tracking-tight">
              Daily Topics Log
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl leading-relaxed">
              Review developer daily study topics, track submission consistency, and schedule structured evaluations from recorded learning.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              onClick={handleCreateTestSchedule}
              className="bg-[#087443] hover:bg-[#065b34] text-white font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-2 text-sm"
            >
              <FaCalendarPlus size={15} />
              Schedule Test from Topics
              {selectedWorkers.length > 0 && (
                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-extrabold">
                  {selectedWorkers.length}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Control Bar: Date Presets, Range, Department, Search & View Toggle */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
        {/* Preset Range & View Mode */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
              <FaClock size={11} /> Preset:
            </span>
            {[
              { id: 'this_week', label: 'This Week (Mon-Sat)' },
              { id: 'last_week', label: 'Last Week' },
              { id: 'last_14_days', label: 'Last 14 Days' }
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activePreset === preset.id
                    ? 'bg-[#087443] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('worker')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'worker'
                  ? 'bg-white text-emerald-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FaUsers size={12} /> Worker-wise
            </button>
            <button
              type="button"
              onClick={() => setViewMode('date')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'date'
                  ? 'bg-white text-emerald-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FaCalendarAlt size={12} /> Date-wise
            </button>
          </div>
        </div>

        {/* Detailed Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Start Date</label>
            <CustomDatePicker
              value={startDate}
              onChange={(val) => {
                setActivePreset('custom');
                setStartDate(val);
              }}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">End Date</label>
            <CustomDatePicker
              value={endDate}
              onChange={(val) => {
                setActivePreset('custom');
                setEndDate(val);
              }}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d._id || d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Search Developer</label>
            <div className="relative">
              <FaSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by name, ID or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Spinner size="lg" />
          <p className="text-slate-500 text-sm font-semibold mt-4">Loading daily topics log...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-center">
          <p className="font-bold text-base mb-1">Failed to load Daily Topics Log</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : !logData || logData.totalWorkers === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-500 shadow-sm">
          <FaBook size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="font-bold text-slate-700">No active developers found for this date range</p>
          <p className="text-xs text-slate-500 mt-1">
            No active developers or daily topics were found for the selected department and period ({startDate} to {endDate}).
          </p>
        </div>
      ) : viewMode === 'worker' ? (
        /* WORKER-WISE VIEW */
        <div className="space-y-4">
          {/* Developer Summary Header */}
          <div className="bg-white rounded-xl px-5 py-3 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>
                Showing <strong className="text-slate-900 font-bold">{filteredWorkerWise.length}</strong> developers
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">
                Range: <strong className="text-slate-700">{startDate}</strong> to <strong className="text-slate-700">{endDate}</strong> ({logData.dates.length} days)
              </span>
              {selectedWorkers.length > 0 && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    {selectedWorkers.length} Selected
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={toggleSelectAllWorkers}
              className="text-xs font-bold text-[#087443] hover:text-[#065b34] flex items-center gap-1.5 transition-colors self-end sm:self-auto cursor-pointer"
            >
              {isAllFilteredSelected ? (
                <>
                  <FaCheckSquare className="text-[#087443]" />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <FaSquare className="text-slate-400" />
                  <span>Select All Developers</span>
                </>
              )}
            </button>
          </div>

          {filteredWorkerWise.length === 0 ? (
            <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center text-slate-500 shadow-sm">
              <p className="font-bold text-slate-700">No active developers match "{searchTerm}"</p>
              <p className="text-xs text-slate-400 mt-1">Try clearing or adjusting your search term.</p>
            </div>
          ) : (
            /* Developer Cards Grid */
            <div className="grid grid-cols-1 gap-4">
            {filteredWorkerWise.map((item) => {
              const isSelected = selectedWorkers.includes(item.worker._id);
              const employeeId = item.worker.employeeId || `EMP-${String(item.worker._id).slice(-4).toUpperCase()}`;

              // Determine rate styling
              const rate = item.submissionRate || 0;
              let rateBadgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
              let progressColor = 'bg-slate-300';
              if (rate >= 80) {
                rateBadgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                progressColor = 'bg-emerald-500';
              } else if (rate >= 50) {
                rateBadgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
                progressColor = 'bg-amber-500';
              } else if (rate > 0) {
                rateBadgeStyle = 'bg-rose-50 text-rose-800 border-rose-200';
                progressColor = 'bg-rose-400';
              }

              return (
                <div
                  key={item.worker._id}
                  className={`bg-white rounded-2xl p-5 border transition-all duration-200 shadow-sm ${
                    isSelected
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
                      : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header: Checkbox, Developer Name, Employee ID badge, Department & Progress */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleWorkerSelection(item.worker._id)}
                        className="w-4 h-4 text-[#087443] rounded border-slate-300 focus:ring-[#087443] cursor-pointer"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-base tracking-tight">
                            {item.worker.name}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 tracking-wide font-mono">
                            {employeeId}
                          </span>
                          {item.worker.department && item.worker.department !== 'N/A' && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
                              {item.worker.department}
                            </span>
                          )}
                        </div>
                        {item.worker.email && (
                          <p className="text-xs text-slate-400 font-medium mt-0.5">{item.worker.email}</p>
                        )}
                      </div>
                    </div>

                    {/* Progress Indicator */}
                    <div className="flex items-center gap-3.5 self-end sm:self-auto">
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-700">
                          {item.submittedCount} / {logData.dates.length} days logged
                        </span>
                        <div className="w-28 sm:w-36 bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>

                      <span
                        className={`text-xs font-black px-2.5 py-1 rounded-lg border ${rateBadgeStyle}`}
                      >
                        {rate}%
                      </span>
                    </div>
                  </div>

                  {/* Daily Topic Grid: 6 tiles per row on desktop */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
                    {logData.dates.map((dateStr) => {
                      const dayData = item.dates[dateStr];
                      const hasTopic = dayData && dayData.status === 'submitted' && dayData.topic;
                      const dayAbbr = getDayAbbreviation(dateStr);
                      const mmdd = formatMMDD(dateStr);

                      return (
                        <div
                          key={dateStr}
                          className={`p-3 rounded-xl border flex flex-col justify-between transition-all min-h-[96px] ${
                            hasTopic
                              ? 'bg-emerald-50/50 border-emerald-200/90 hover:border-emerald-300 hover:bg-emerald-50/70 shadow-[0_1px_2px_rgba(16,185,129,0.06)]'
                              : 'bg-slate-50/70 border-dashed border-slate-200 text-slate-400'
                          }`}
                        >
                          {/* Date Header: Day Abbreviation & MM-DD */}
                          <div className="flex items-center justify-between mb-1.5">
                            <span
                              className={`text-[11px] font-extrabold uppercase tracking-wider ${
                                hasTopic ? 'text-slate-800' : 'text-slate-400'
                              }`}
                            >
                              {dayAbbr}
                            </span>
                            <span className="text-[10px] font-mono font-semibold text-slate-400">
                              {mmdd}
                            </span>
                          </div>

                          {/* Body: Topic or No Topic Logged */}
                          {hasTopic ? (
                            <div className="space-y-1">
                              <p
                                className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug"
                                title={dayData.topic}
                              >
                                {dayData.topic}
                              </p>
                              <div className="flex items-center justify-between pt-1">
                                <span className="inline-flex items-center gap-1 text-[10px] text-[#087443] font-bold">
                                  <FaCheckCircle size={10} className="text-[#087443]" />
                                  <span>Submitted</span>
                                </span>
                                {dayData.subdomain && dayData.subdomain !== 'default' && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                                    {dayData.subdomain}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-2 text-center">
                              <FaTimesCircle size={12} className="text-slate-300 mb-1" />
                              <span className="text-[10px] font-semibold text-slate-400">
                                No Topic Logged
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      ) : (
        /* DATE-WISE VIEW */
        <div className="space-y-4">
          <div className="bg-white rounded-xl px-5 py-3 border border-slate-200/80 shadow-sm text-xs font-bold text-slate-700 flex items-center justify-between">
            <span>Showing submissions across {logData.dates.length} dates</span>
            <span className="text-slate-500 font-semibold">{logData.totalWorkers} total active developers</span>
          </div>

          <div className="space-y-3">
            {(logData.dateWise || []).map((dateGroup) => {
              const isExpanded = expandedDates[dateGroup.date] !== false; // default expanded
              const dateObj = new Date(dateGroup.date);
              const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
              const dayAbbr = getDayAbbreviation(dateGroup.date);
              const mmdd = formatMMDD(dateGroup.date);

              return (
                <div
                  key={dateGroup.date}
                  className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm hover:border-slate-300 transition-all"
                >
                  <div
                    onClick={() => toggleDateExpanded(dateGroup.date)}
                    className="p-4 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer border-b border-slate-200/70 select-none transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#087443] text-white flex flex-col items-center justify-center font-bold text-xs shadow-sm">
                        <span className="text-[11px] font-extrabold uppercase">{dayAbbr}</span>
                        <span className="text-[10px] font-mono opacity-90">{mmdd}</span>
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          {dayName}, {dateGroup.date}
                        </h4>
                        <p className="text-xs text-slate-500 font-medium">
                          <strong className="text-emerald-700 font-bold">{dateGroup.submittedCount}</strong> submitted • <strong className="text-slate-600 font-bold">{dateGroup.missingCount}</strong> missing
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                        {dateGroup.submittedCount} / {logData.totalWorkers} Logged
                      </span>
                      {isExpanded ? (
                        <FaChevronUp size={12} className="text-slate-400" />
                      ) : (
                        <FaChevronDown size={12} className="text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 divide-y divide-slate-100">
                      {dateGroup.workers.map((workerSub) => {
                        const hasTopic = workerSub.status === 'submitted' && workerSub.topic;
                        const empId = workerSub.worker.employeeId || `EMP-${String(workerSub.worker._id).slice(-4).toUpperCase()}`;

                        return (
                          <div
                            key={workerSub.worker._id}
                            className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  hasTopic ? 'bg-emerald-500' : 'bg-slate-300'
                                }`}
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-slate-900">
                                    {workerSub.worker.name}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                    {empId}
                                  </span>
                                  {workerSub.worker.department && workerSub.worker.department !== 'N/A' && (
                                    <span className="text-[11px] text-slate-400">
                                      ({workerSub.worker.department})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-left sm:text-right">
                              {hasTopic ? (
                                <div className="inline-flex items-center gap-2">
                                  <span className="text-xs font-bold text-emerald-950 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                                    {workerSub.topic}
                                  </span>
                                  {workerSub.subdomain && workerSub.subdomain !== 'default' && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      {workerSub.subdomain}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">No topic logged</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyTopicsLog;
