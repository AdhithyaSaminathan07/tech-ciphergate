// components/admin/TestScheduleManagement.jsx
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FaCalendarPlus,
  FaCalendarAlt,
  FaClock,
  FaUsers,
  FaPlay,
  FaPlayCircle,
  FaPause,
  FaRedo,
  FaBan,
  FaTrash,
  FaEdit,
  FaCheckCircle,
  FaExclamationCircle,
  FaInfoCircle,
  FaGlobe,
  FaBookOpen,
  FaListOl,
  FaFilter,
  FaSearch,
  FaLayerGroup,
  FaRobot,
  FaArrowRight,
  FaGraduationCap,
  FaTrophy,
  FaHistory,
  FaHourglassHalf,
  FaCheckDouble
} from 'react-icons/fa';
import {
  getSchedules,
  createSchedule,
  updateSchedule,
  pauseSchedule,
  resumeSchedule,
  cancelSchedule,
  triggerScheduleNow,
  retrySchedule,
  deleteSchedule
} from '../../services/testScheduleService';
import { getWorkers } from '../../services/workerService';
import { getDepartments } from '../../services/departmentService';
import appContext from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import Modal from '../common/Modal';
import CustomDatePicker from '../common/CustomDatePicker';
import GenerateQuestions from './GenerateQuestions';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney'
];

const getLocalDateYMD = (offsetDays = 0, timeZone = 'Asia/Kolkata') => {
  try {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  } catch (e) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

const calculateNextOccurrenceDate = ({
  dayName = 'Wednesday',
  timeZone = 'Asia/Kolkata',
  endTime = '11:00',
  referenceDate = new Date()
}) => {
  const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const targetDay = dayMap[String(dayName).toLowerCase()] ?? 3; // 3 = Wednesday default

  try {
    // Determine current local weekday and calendar date in target timezone
    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' });
    const localWeekday = dayFormatter.format(referenceDate).toLowerCase();
    const currentDayIndex = dayMap[localWeekday] ?? 0;

    const partsFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = partsFormatter.formatToParts(referenceDate);
    const partMap = {};
    for (const p of parts) partMap[p.type] = p.value;

    const localYear = parseInt(partMap.year, 10);
    const localMonth = parseInt(partMap.month, 10);
    const localDay = parseInt(partMap.day, 10);
    const localHour = parseInt(partMap.hour, 10);
    const localMinute = parseInt(partMap.minute, 10);

    const [endHour, endMin] = String(endTime).split(':').map((v) => parseInt(v, 10) || 0);

    let daysToAdd = 0;
    if (currentDayIndex === targetDay) {
      // If today is the target day, check if test closing window has already passed
      const currentMinutes = localHour * 60 + localMinute;
      const endMinutes = endHour * 60 + endMin;
      if (currentMinutes >= endMinutes) {
        daysToAdd = 7;
      } else {
        daysToAdd = 0;
      }
    } else {
      daysToAdd = (targetDay - currentDayIndex + 7) % 7;
    }

    // Create UTC date shifted by daysToAdd from local calendar date
    const targetUtcEpoch = Date.UTC(localYear, localMonth - 1, localDay + daysToAdd);
    const targetDate = new Date(targetUtcEpoch);
    const y = targetDate.getUTCFullYear();
    const m = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch (e) {
    // Fallback if Intl format fails
    const d = new Date(referenceDate);
    const currentDay = d.getDay();
    let daysToAdd = (targetDay - currentDay + 7) % 7;
    if (daysToAdd === 0) daysToAdd = 7;
    d.setDate(d.getDate() + daysToAdd);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

const getStatusBadge = (status) => {
  switch (status) {
    case 'Scheduled':
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">Scheduled</span>;
    case 'Generating':
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 animate-pulse">Generating AI</span>;
    case 'Ready':
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">Ready</span>;
    case 'In Progress':
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">In Progress</span>;
    case 'Completed':
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">Completed</span>;
    case 'Paused':
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">Paused</span>;
    case 'Cancelled':
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-300">Cancelled</span>;
    case 'Failed':
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">Failed</span>;
    default:
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">{status}</span>;
  }
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: FaLayerGroup, desc: 'Dashboard & status metrics' },
  { id: 'generate', label: 'Generate Questions', icon: FaRobot, desc: 'Instant on-demand AI generator' },
  { id: 'schedule', label: 'Schedule Test', icon: FaCalendarPlus, desc: 'Configure automated test windows' },
  { id: 'manage', label: 'Manage Tests', icon: FaClock, desc: 'Active & historical test schedules' },
];

const TestScheduleManagement = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subdomain } = useContext(appContext);
  const effectiveSubdomain = (subdomain && subdomain !== 'main') ? subdomain : (user?.subdomain || subdomain || 'default');

  // Active Tab state
  const currentTabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    currentTabParam && ['overview', 'generate', 'schedule', 'manage'].includes(currentTabParam)
      ? currentTabParam
      : (searchParams.get('create') === 'true' ? 'schedule' : 'overview')
  );

  const [schedules, setSchedules] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [workerSearchQuery, setWorkerSearchQuery] = useState('');

  // Modal State for Edit / Diagnostics
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const [diagnosticModal, setDiagnosticModal] = useState({ isOpen: false, diagnostic: null, name: '' });

  // Form State: Default to recurring Wednesday 10:00 AM - 11:00 AM, in-advance generation
  const initialFormState = {
    name: '',
    workers: [],
    departments: [],
    topicSource: 'daily_topics',
    startDate: getLocalDateYMD(-5, 'Asia/Kolkata'),
    endDate: getLocalDateYMD(0, 'Asia/Kolkata'),
    manualTopics: '',
    allowHistoricalFallback: false,
    repeatSchedule: 'weekly',
    recurrenceDay: 'Wednesday',
    repeatUntilDisabled: true,
    testDate: calculateNextOccurrenceDate({
      dayName: 'Wednesday',
      timeZone: 'Asia/Kolkata',
      endTime: '11:00'
    }),
    startTime: '10:00',
    endTime: '11:00',
    timezone: 'Asia/Kolkata',
    generationTiming: 'in_advance',
    questionsPerWorker: 10,
    difficulty: 'Medium',
    questionFormat: 'mcq',
    timePerQuestion: 30,
    timePerQuestionUnit: 'seconds',
    showFeedback: true
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchMetadata();
    fetchSchedules();
  }, [effectiveSubdomain]);

  // Sync tab with URL
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && ['overview', 'generate', 'schedule', 'manage'].includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  // Check URL params for direct pre-filling from Daily Topics Log shortcut
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      const urlWorkers = searchParams.get('workers');
      const urlStart = searchParams.get('startDate');
      const urlEnd = searchParams.get('endDate');

      setFormData((prev) => ({
        ...prev,
        name: `Weekly Knowledge Evaluation (${urlStart || getLocalDateYMD(0, prev.timezone)})`,
        workers: urlWorkers ? urlWorkers.split(',').filter(Boolean) : prev.workers,
        startDate: urlStart || prev.startDate,
        endDate: urlEnd || prev.endDate,
        topicSource: 'daily_topics',
        recurrenceDay: prev.recurrenceDay || 'Wednesday',
        testDate: calculateNextOccurrenceDate({
          dayName: prev.recurrenceDay || 'Wednesday',
          timeZone: prev.timezone || 'Asia/Kolkata',
          endTime: prev.endTime || '11:00'
        })
      }));
      setActiveTab('schedule');
    }
  }, [searchParams]);

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
    setActionError(null);
  };

  const fetchMetadata = async () => {
    try {
      const [workersRes, deptsRes] = await Promise.all([
        getWorkers({ subdomain: effectiveSubdomain }),
        getDepartments({ subdomain: effectiveSubdomain })
      ]);
      setWorkers(Array.isArray(workersRes) ? workersRes : []);
      setDepartments(Array.isArray(deptsRes) ? deptsRes : []);
    } catch (err) {
      console.warn('Metadata fetch error:', err.message);
    }
  };

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const data = await getSchedules({
        subdomain: effectiveSubdomain,
        status: statusFilter !== 'all' ? statusFilter : undefined
      });
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
      setActionError(err.message || 'Failed to fetch test schedules.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchedule = async (e) => {
    if (e) e.preventDefault();
    setActionError(null);

    if (!formData.name.trim()) {
      setActionError('Please provide a name for the test schedule.');
      return;
    }
    if (formData.workers.length === 0) {
      setActionError('At least one eligible worker must be selected before saving.');
      return;
    }
    if (formData.topicSource === 'manual') {
      const parsedTopics = formData.manualTopics.split(',').map((t) => t.trim()).filter(Boolean);
      if (parsedTopics.length === 0) {
        setActionError('Please enter at least one topic for manual topic source so questions can be generated.');
        return;
      }
    } else if (formData.topicSource === 'daily_topics') {
      if (!formData.startDate || !formData.endDate) {
        setActionError('Please select both a start date and an end date for recorded daily topics.');
        return;
      }
      if (formData.endDate < formData.startDate) {
        setActionError('Daily Topics "To Date" cannot be earlier than "From Date".');
        return;
      }
    }
    if (formData.endTime <= formData.startTime) {
      setActionError('Closing time must be later than opening time for the test window.');
      return;
    }

    const perQuestionSeconds = formData.timePerQuestionUnit === 'minutes'
      ? Number(formData.timePerQuestion) * 60
      : Number(formData.timePerQuestion);

    if (!perQuestionSeconds || isNaN(perQuestionSeconds) || perQuestionSeconds <= 0) {
      setActionError('Please enter a valid positive number for time per question.');
      return;
    }

    if (perQuestionSeconds < 5 || perQuestionSeconds > 600) {
      setActionError('Time per question must be between 5 seconds and 10 minutes (600 seconds).');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: formData.name.trim(),
        workers: formData.workers,
        subdomain: effectiveSubdomain,
        topicSource: formData.topicSource,
        topicDateRange: {
          startDate: formData.startDate,
          endDate: formData.endDate
        },
        manualTopics: formData.topicSource === 'manual'
          ? formData.manualTopics.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        allowHistoricalFallback: formData.allowHistoricalFallback,
        testDate: formData.testDate,
        startTime: formData.startTime,
        endTime: formData.endTime,
        timezone: formData.timezone,
        generationTiming: formData.generationTiming,
        questionsPerWorker: Number(formData.questionsPerWorker),
        difficulty: formData.difficulty,
        questionFormat: formData.questionFormat,
        timePerQuestion: perQuestionSeconds,
        totalTestDuration: (Number(formData.questionsPerWorker) || 10) * perQuestionSeconds,
        showFeedback: formData.showFeedback,
        repeatSchedule: formData.repeatSchedule,
        recurrenceDay: formData.recurrenceDay || 'Wednesday',
        repeatUntilDisabled: formData.repeatUntilDisabled !== false
      };

      if (editingScheduleId) {
        await updateSchedule(editingScheduleId, payload);
        setIsEditModalOpen(false);
        setEditingScheduleId(null);
        setSuccessToast(`Schedule "${payload.name}" updated successfully!`);
      } else {
        await createSchedule(payload);
        setFormData(initialFormState);
        setSuccessToast(`Schedule "${payload.name}" created successfully!`);
        switchTab('manage');
      }

      await fetchSchedules();
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err) {
      console.error('Failed to save schedule:', err);
      setActionError(err.response?.data?.message || err.message || 'Failed to save test schedule.');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (schedule) => {
    setEditingScheduleId(schedule._id);
    setFormData({
      name: schedule.name,
      workers: (schedule.workers || []).map((w) => (typeof w === 'object' ? w._id : w)),
      departments: [],
      topicSource: schedule.topicSource || 'daily_topics',
      startDate: schedule.topicDateRange?.startDate || getLocalDateYMD(-5),
      endDate: schedule.topicDateRange?.endDate || getLocalDateYMD(0),
      manualTopics: (schedule.manualTopics || []).join(', '),
      allowHistoricalFallback: schedule.allowHistoricalFallback || false,
      testDate: schedule.testDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      timezone: schedule.timezone || 'Asia/Kolkata',
      generationTiming: schedule.generationTiming || 'in_advance',
      questionsPerWorker: schedule.questionsPerWorker || 10,
      difficulty: schedule.difficulty || 'Medium',
      questionFormat: schedule.questionFormat || 'mcq',
      timePerQuestion: schedule.timePerQuestion && (schedule.timePerQuestion >= 60 && schedule.timePerQuestion % 60 === 0)
        ? schedule.timePerQuestion / 60
        : (schedule.timePerQuestion || 30),
      timePerQuestionUnit: schedule.timePerQuestion && (schedule.timePerQuestion >= 60 && schedule.timePerQuestion % 60 === 0)
        ? 'minutes'
        : 'seconds',
      showFeedback: schedule.showFeedback !== false,
      repeatSchedule: schedule.repeatSchedule || 'weekly',
      recurrenceDay: schedule.recurrenceDay || 'Wednesday',
      repeatUntilDisabled: schedule.repeatUntilDisabled !== false
    });
    setIsEditModalOpen(true);
  };

  const handlePause = async (scheduleId) => {
    try {
      setLoading(true);
      await pauseSchedule(scheduleId);
      setSuccessToast('Test schedule paused successfully.');
      await fetchSchedules();
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to pause schedule.');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async (scheduleId) => {
    try {
      setLoading(true);
      await resumeSchedule(scheduleId);
      setSuccessToast('Test schedule resumed successfully. Next occurrence calculated.');
      await fetchSchedules();
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to resume schedule.');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerNow = async (scheduleId) => {
    try {
      setLoading(true);
      await triggerScheduleNow(scheduleId);
      await fetchSchedules();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Trigger generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (scheduleId) => {
    try {
      setLoading(true);
      await retrySchedule(scheduleId);
      await fetchSchedules();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Retry failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (scheduleId) => {
    if (!window.confirm('Are you sure you want to cancel this test schedule?')) return;
    try {
      await cancelSchedule(scheduleId);
      fetchSchedules();
    } catch (err) {
      alert(err.message || 'Failed to cancel schedule.');
    }
  };

  const handleDelete = async (scheduleId) => {
    if (!window.confirm('Delete this test schedule permanently?')) return;
    try {
      await deleteSchedule(scheduleId);
      fetchSchedules();
    } catch (err) {
      alert(err.message || 'Failed to delete schedule.');
    }
  };

  const toggleWorkerInForm = (wId) => {
    setFormData((prev) => ({
      ...prev,
      workers: prev.workers.includes(wId) ? prev.workers.filter((id) => id !== wId) : [...prev.workers, wId]
    }));
  };

  const selectAllWorkersInForm = () => {
    const allIds = filteredFormWorkers.map((w) => w._id);
    const allSelected = allIds.every((id) => formData.workers.includes(id));
    setFormData((prev) => ({
      ...prev,
      workers: allSelected
        ? prev.workers.filter((id) => !allIds.includes(id))
        : Array.from(new Set([...prev.workers, ...allIds]))
    }));
  };

  // Filtered workers inside form
  const filteredFormWorkers = useMemo(() => {
    if (!workerSearchQuery.trim()) return workers;
    const q = workerSearchQuery.toLowerCase();
    return workers.filter((w) =>
      w.name?.toLowerCase().includes(q) ||
      w.department?.toLowerCase().includes(q) ||
      w.email?.toLowerCase().includes(q)
    );
  }, [workers, workerSearchQuery]);

  // Schedules filtered by status & query
  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = s.name?.toLowerCase().includes(q);
        const dateMatch = s.testDate?.includes(q);
        return nameMatch || dateMatch;
      }
      return true;
    });
  }, [schedules, statusFilter, searchQuery]);

  // Statistics for Overview tab
  const stats = useMemo(() => {
    const total = schedules.length;
    const scheduled = schedules.filter((s) => s.status === 'Scheduled').length;
    const ready = schedules.filter((s) => s.status === 'Ready').length;
    const inProgress = schedules.filter((s) => s.status === 'In Progress').length;
    const completed = schedules.filter((s) => s.status === 'Completed').length;
    const failed = schedules.filter((s) => s.status === 'Failed').length;
    const active = scheduled + ready + inProgress;
    return { total, scheduled, ready, inProgress, completed, failed, active };
  }, [schedules]);

  // Active/priority schedules needing attention
  const activeSchedules = useMemo(() => {
    return schedules
      .filter((s) => ['In Progress', 'Ready', 'Failed', 'Scheduled'].includes(s.status))
      .slice(0, 5);
  }, [schedules]);

  // Form component reusable for tab and modal
  const renderScheduleForm = (isModal = false) => (
    <form onSubmit={handleSaveSchedule} className="space-y-6">
      {actionError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
          <FaExclamationCircle className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* 1. Schedule Name & Recurrence */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Schedule Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Weekly Knowledge Evaluation"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Recurrence</label>
            <select
              value={formData.repeatSchedule}
              onChange={(e) => setFormData({ ...formData, repeatSchedule: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl font-medium"
            >
              <option value="weekly">Every week (Recurring)</option>
              <option value="none">One-time Evaluation</option>
              <option value="biweekly">Repeats Bi-weekly</option>
              <option value="monthly">Repeats Monthly</option>
            </select>
          </div>
        </div>

        {formData.repeatSchedule === 'weekly' && (
          <div className="p-3 bg-emerald-50/60 border border-emerald-200/70 rounded-xl space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="block text-xs font-bold text-emerald-950">
                Recurring Test Day <span className="text-red-500">*</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-emerald-900 font-medium">
                <input
                  type="checkbox"
                  checked={formData.repeatUntilDisabled}
                  onChange={(e) => setFormData({ ...formData, repeatUntilDisabled: e.target.checked })}
                  className="rounded border-emerald-300 text-[#087443] focus:ring-[#087443]"
                />
                <span>Repeat every week until disabled or cancelled by admin</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const isSelected = (formData.recurrenceDay || 'Wednesday').toLowerCase() === day.toLowerCase();
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      const nextDate = calculateNextOccurrenceDate({
                        dayName: day,
                        timeZone: formData.timezone || 'Asia/Kolkata',
                        endTime: formData.endTime || '11:00'
                      });
                      setFormData((prev) => ({
                        ...prev,
                        recurrenceDay: day,
                        testDate: nextDate
                      }));
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#087443] text-white shadow-sm ring-2 ring-emerald-500/20'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-emerald-800">
              The scheduler will automatically prepare questions in advance and repeat this evaluation every <strong>{formData.recurrenceDay || 'Wednesday'}</strong>.
            </p>
          </div>
        )}
      </div>

      {/* 2. Worker Selection */}
      <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <label className="block text-xs font-bold text-slate-800">
              Target Developers ({formData.workers.length} selected) <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] text-slate-500">Select employees assigned to take this evaluation</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search developers..."
              value={workerSearchQuery}
              onChange={(e) => setWorkerSearchQuery(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg w-40"
            />
            <button
              type="button"
              onClick={selectAllWorkersInForm}
              className="text-xs font-bold text-[#087443] hover:text-[#065b34] px-2 py-1 bg-white border border-slate-200 rounded-lg"
            >
              {filteredFormWorkers.length > 0 && filteredFormWorkers.every((w) => formData.workers.includes(w._id))
                ? 'Deselect All'
                : 'Select All'}
            </button>
          </div>
        </div>

        {formData.workers.length === 0 && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] font-semibold flex items-center gap-2">
            <FaExclamationCircle className="shrink-0 text-amber-600" />
            <span>At least one worker must be selected before saving or scheduling a test.</span>
          </div>
        )}

        <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl p-2.5 divide-y divide-slate-100 bg-white">
          {filteredFormWorkers.map((w) => {
            const isChecked = formData.workers.includes(w._id);
            return (
              <label
                key={w._id}
                className="flex items-center gap-2.5 py-1.5 px-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleWorkerInForm(w._id)}
                  className="w-4 h-4 text-[#087443] rounded border-slate-300 focus:ring-[#087443]"
                />
                <span className="text-xs font-bold text-slate-800">{w.name}</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {w.rfid || w.username || `EMP-${String(w._id).slice(-4).toUpperCase()}`}
                </span>
                <span className="text-[11px] text-slate-500 ml-auto">({w.department || 'N/A'})</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 3. Topic Source Selection */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <label className="block text-xs font-bold text-slate-700">Topic Source</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFormData({ ...formData, topicSource: 'daily_topics' })}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              formData.topicSource === 'daily_topics'
                ? 'bg-[#087443] text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FaBookOpen className="inline mr-1.5" /> From Recorded Daily Topics
          </button>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, topicSource: 'manual' })}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              formData.topicSource === 'manual'
                ? 'bg-[#087443] text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FaListOl className="inline mr-1.5" /> Manual Topics List
          </button>
        </div>

        {formData.topicSource === 'daily_topics' ? (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Topics From Date</label>
              <CustomDatePicker
                value={formData.startDate}
                onChange={(val) => setFormData({ ...formData, startDate: val })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Topics To Date</label>
              <CustomDatePicker
                value={formData.endDate}
                onChange={(val) => setFormData({ ...formData, endDate: val })}
                className="w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 font-medium">
                <input
                  type="checkbox"
                  checked={formData.allowHistoricalFallback}
                  onChange={(e) => setFormData({ ...formData, allowHistoricalFallback: e.target.checked })}
                  className="rounded border-slate-300 text-[#087443] focus:ring-[#087443]"
                />
                <span>Allow fallback to historical topics if an employee logged 0 topics in period</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="pt-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Enter Topics (Comma-separated) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., React Hooks, Node.js Streams, MongoDB Indexing"
              value={formData.manualTopics}
              onChange={(e) => setFormData({ ...formData, manualTopics: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#087443] font-medium"
            />
            {(!formData.manualTopics || !formData.manualTopics.trim()) && (
              <p className="text-[11px] text-amber-700 mt-1">
                Please enter at least one topic name so questions can be generated for workers.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 4. Test Date & Availability Window */}
      <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-xl space-y-3">
        <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
          <FaClock /> Test Date & Timing Window
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Test Date <span className="text-red-500">*</span>
            </label>
            <CustomDatePicker
              value={formData.testDate}
              onChange={(val) => setFormData({ ...formData, testDate: val })}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Opens At (HH:mm) <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              required
              value={formData.startTime}
              onChange={(e) => {
                const newStart = e.target.value;
                setFormData((prev) => ({ ...prev, startTime: newStart }));
              }}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#087443] font-semibold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Closes At (HH:mm) <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              required
              value={formData.endTime}
              onChange={(e) => {
                const newEnd = e.target.value;
                setFormData((prev) => {
                  const updated = { ...prev, endTime: newEnd };
                  if (prev.repeatSchedule === 'weekly') {
                    updated.testDate = calculateNextOccurrenceDate({
                      dayName: prev.recurrenceDay || 'Wednesday',
                      timeZone: prev.timezone || 'Asia/Kolkata',
                      endTime: newEnd
                    });
                  }
                  return updated;
                });
              }}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#087443] font-semibold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Timezone <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.timezone}
              onChange={(e) => {
                const newTz = e.target.value;
                setFormData((prev) => {
                  const updated = { ...prev, timezone: newTz };
                  if (prev.repeatSchedule === 'weekly') {
                    updated.testDate = calculateNextOccurrenceDate({
                      dayName: prev.recurrenceDay || 'Wednesday',
                      timeZone: newTz,
                      endTime: prev.endTime || '11:00'
                    });
                  }
                  return updated;
                });
              }}
              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#087443] font-semibold"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
          <span className="flex items-center gap-1 font-medium">
            <FaGlobe className="text-emerald-700" /> Selected Timezone: {formData.timezone}
          </span>
          <span className="text-[11px] text-slate-500 italic">
            (Workers cannot start test before start time or after closing time)
          </span>
        </div>
      </div>

      {/* 5. Parameters (Format, Difficulty, Questions, Duration) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Questions / Worker</label>
          <input
            type="number"
            min="1"
            max="50"
            value={formData.questionsPerWorker}
            onChange={(e) => setFormData({ ...formData, questionsPerWorker: e.target.value })}
            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-bold"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Difficulty</label>
          <select
            value={formData.difficulty}
            onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-semibold"
          >
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Format</label>
          <select
            value={formData.questionFormat}
            onChange={(e) => setFormData({ ...formData, questionFormat: e.target.value })}
            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-semibold"
          >
            <option value="mcq">Standard MCQ</option>
            <option value="upsc">UPSC / GK Format</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Time Per Question</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              max={formData.timePerQuestionUnit === 'minutes' ? 10 : 600}
              value={formData.timePerQuestion}
              onChange={(e) => setFormData({ ...formData, timePerQuestion: e.target.value })}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-bold"
              placeholder="30"
            />
            <select
              value={formData.timePerQuestionUnit}
              onChange={(e) => setFormData({ ...formData, timePerQuestionUnit: e.target.value })}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg font-medium bg-white"
            >
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
            </select>
          </div>
        </div>
      </div>

      {/* 6. Advanced options */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 text-xs">
        <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
          <input
            type="checkbox"
            checked={formData.showFeedback}
            onChange={(e) => setFormData({ ...formData, showFeedback: e.target.checked })}
            className="rounded border-slate-300 text-[#087443] focus:ring-[#087443]"
          />
          <span>Show answer feedback after completion</span>
        </label>

        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-600">Generation:</span>
          <select
            value={formData.generationTiming}
            onChange={(e) => setFormData({ ...formData, generationTiming: e.target.value })}
            className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg font-medium"
          >
            <option value="in_advance">Generate in Advance (Recommended)</option>
            <option value="at_start_time">Generate at Start Time</option>
          </select>
        </div>
      </div>

      {/* Comprehensive Pre-Save Review Card */}
      <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3 text-xs text-slate-800 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <span className="font-bold text-slate-900 flex items-center gap-1.5">
            <FaInfoCircle className="text-emerald-700" /> Pre-Save Configuration Review
          </span>
          <span className="font-mono text-emerald-800 font-bold bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
            {formData.repeatSchedule === 'weekly' ? `Weekly Recurring (${formData.recurrenceDay || 'Wednesday'})` : 'One-time Test'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-slate-600">
          <div>
            <span className="block font-semibold text-slate-800 mb-0.5">Assigned Workers:</span>
            <span className={formData.workers.length === 0 ? 'text-amber-700 font-bold' : 'text-slate-700'}>
              {formData.workers.length > 0 ? (
                <>
                  <strong>{formData.workers.length}</strong> selected (
                  {workers
                    .filter((w) => formData.workers.includes(w._id))
                    .slice(0, 3)
                    .map((w) => w.name)
                    .join(', ')}
                  {formData.workers.length > 3 ? ` +${formData.workers.length - 3} more` : ''})
                </>
              ) : (
                '0 employees (Selection required)'
              )}
            </span>
          </div>
          <div>
            <span className="block font-semibold text-slate-800 mb-0.5">Topics Configuration:</span>
            <span className="text-slate-700 font-medium">
              {formData.topicSource === 'daily_topics'
                ? `Daily Topics (${formData.startDate} to ${formData.endDate})`
                : (formData.manualTopics.trim() ? `Manual: ${formData.manualTopics}` : 'None specified')}
            </span>
          </div>
          <div>
            <span className="block font-semibold text-slate-800 mb-0.5">Window & Timezone:</span>
            <span className="text-slate-700 font-medium">{formData.startTime} – {formData.endTime} ({formData.timezone})</span>
          </div>
          <div>
            <span className="block font-semibold text-slate-800 mb-0.5">Questions & Time:</span>
            <span className="text-slate-700 font-medium">
              {formData.questionsPerWorker} Qs/dev • {formData.timePerQuestion} {formData.timePerQuestionUnit} / question
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-600">
            <strong>Question Generation:</strong> {formData.generationTiming === 'in_advance' ? 'Generated in advance before test window' : 'Generated at start time'}
          </span>
          <span className="font-bold text-emerald-900 bg-emerald-100/80 px-2.5 py-1 rounded-lg border border-emerald-300">
            Next Scheduled Occurrence: {formData.recurrenceDay || 'Wednesday'}, {formData.testDate} at {formData.startTime} – {formData.endTime} ({formData.timezone})
          </span>
        </div>
      </div>

      {/* Submit Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
        {isModal && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsEditModalOpen(false)}
            className="px-4 py-2 text-xs"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={saving || formData.workers.length === 0}
          className={`font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-sm ${
            formData.workers.length === 0
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-[#087443] hover:bg-[#065b34] text-white cursor-pointer'
          }`}
        >
          {saving && <Spinner size="sm" />}
          {editingScheduleId ? 'Save Changes' : 'Save & Schedule Test'}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6 max-w-full">
      {/* Toast Alert */}
      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-bold flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <FaCheckCircle className="text-emerald-600" />
            <span>{successToast}</span>
          </div>
          <button type="button" onClick={() => setSuccessToast(null)} className="text-emerald-600 hover:text-emerald-800">
            &times;
          </button>
        </div>
      )}

      {/* Unified Header Banner */}
      <div className="bg-gradient-to-r from-teal-900 via-emerald-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Admin Test Operations
              </span>
              <span className="text-emerald-200/70 text-xs">• Intelligent Knowledge Testing</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Test Management</h1>
            <p className="text-emerald-100/80 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Unify automated scheduling, instant AI question generation, active test window monitoring, and generation failure diagnostics in one centralized command center.
            </p>
          </div>

          {/* Quick CTA */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => switchTab('schedule')}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <FaCalendarPlus size={14} /> Schedule Test
            </button>
            <button
              type="button"
              onClick={() => switchTab('generate')}
              className="px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white font-bold rounded-xl text-xs sm:text-sm border border-white/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <FaRobot size={14} /> Instant Generator
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 pt-4 overflow-x-auto pb-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-white text-emerald-950 shadow-md ring-2 ring-white/30'
                    : 'text-emerald-100/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={13} className={isActive ? 'text-[#087443]' : 'text-emerald-300'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Status KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Active Schedules', count: stats.active, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { label: 'Scheduled', count: stats.scheduled, color: 'text-blue-700 bg-blue-50 border-blue-200' },
              { label: 'Ready To Start', count: stats.ready, color: 'text-teal-700 bg-teal-50 border-teal-200' },
              { label: 'In Progress', count: stats.inProgress, color: 'text-amber-700 bg-amber-50 border-amber-200' },
              { label: 'Completed', count: stats.completed, color: 'text-slate-700 bg-slate-50 border-slate-200' },
              { label: 'Failed / Issues', count: stats.failed, color: 'text-rose-700 bg-rose-50 border-rose-200' }
            ].map((kpi, idx) => (
              <div key={idx} className={`p-4 rounded-2xl border ${kpi.color} shadow-xs`}>
                <span className="text-[11px] font-bold uppercase tracking-wider block opacity-80">{kpi.label}</span>
                <span className="text-2xl font-black mt-1 block">{kpi.count}</span>
              </div>
            ))}
          </div>

          {/* Workflow Action Launchers */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => switchTab('schedule')}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#087443] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <FaCalendarPlus size={18} />
              </div>
              <h3 className="font-extrabold text-slate-900 text-sm mb-1 group-hover:text-[#087443] transition-colors">
                Schedule An Evaluation
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                Configure future test dates, start/close windows, durations, and automatic AI question generation.
              </p>
              <span className="text-xs font-bold text-[#087443] flex items-center gap-1">
                Open Schedule Form <FaArrowRight size={10} />
              </span>
            </div>

            <div
              onClick={() => switchTab('generate')}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <FaRobot size={18} />
              </div>
              <h3 className="font-extrabold text-slate-900 text-sm mb-1 group-hover:text-blue-700 transition-colors">
                Instant Question Generator
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                Select employees and topics to run an on-demand generation job with live progress tracking.
              </p>
              <span className="text-xs font-bold text-blue-700 flex items-center gap-1">
                Launch Generator <FaArrowRight size={10} />
              </span>
            </div>

            <div
              onClick={() => navigate('/admin/daily-topics')}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-teal-400 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <FaBookOpen size={18} />
              </div>
              <h3 className="font-extrabold text-slate-900 text-sm mb-1 group-hover:text-teal-700 transition-colors">
                Daily Topics Log
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                Inspect daily study topics, attendance rates, and convert logged learning into tests.
              </p>
              <span className="text-xs font-bold text-teal-700 flex items-center gap-1">
                View Topics Log <FaArrowRight size={10} />
              </span>
            </div>

            <div
              onClick={() => navigate('/admin/test/question-history')}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-amber-400 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <FaHistory size={18} />
              </div>
              <h3 className="font-extrabold text-slate-900 text-sm mb-1 group-hover:text-amber-700 transition-colors">
                Question History & Scores
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                Review historical question sets, employee attempt scores, and global knowledge leaderboards.
              </p>
              <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                View Question History <FaArrowRight size={10} />
              </span>
            </div>
          </div>

          {/* Active / Priority Tests Section */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Active & Upcoming Evaluations</h3>
                <p className="text-xs text-slate-500 mt-0.5">Tests currently in progress, ready to open, or needing attention</p>
              </div>
              <button
                type="button"
                onClick={() => switchTab('manage')}
                className="text-xs font-bold text-[#087443] hover:text-[#065b34] flex items-center gap-1 cursor-pointer"
              >
                View All Schedules ({schedules.length}) <FaArrowRight size={10} />
              </button>
            </div>

            {activeSchedules.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <FaCheckDouble className="mx-auto text-slate-300 mb-2" size={24} />
                <p className="text-xs font-bold text-slate-700">No active evaluations running right now</p>
                <p className="text-xs text-slate-400 mt-1">Click &quot;Schedule Test&quot; above to create a new evaluation window.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeSchedules.map((schedule) => {
                  const isFailed = schedule.status === 'Failed';
                  return (
                    <div
                      key={schedule._id}
                      className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                        isFailed ? 'bg-red-50/40 border-red-200' : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm">{schedule.name}</h4>
                          {getStatusBadge(schedule.status)}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                          <span className="font-semibold text-slate-700">Date: {schedule.testDate}</span>
                          <span>Window: {schedule.startTime} - {schedule.endTime}</span>
                          <span>Developers: {schedule.workers?.length || 0}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isFailed ? (
                          <Button
                            onClick={() => handleRetry(schedule._id)}
                            className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1"
                          >
                            <FaRedo size={10} /> Retry
                          </Button>
                        ) : schedule.status === 'Scheduled' ? (
                          <Button
                            onClick={() => handleTriggerNow(schedule._id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1"
                          >
                            <FaPlay size={10} /> Generate Now
                          </Button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => openEditModal(schedule)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GENERATE QUESTIONS (Instant Generator) */}
      {activeTab === 'generate' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6">
          <div className="mb-4 pb-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Instant AI Question Generator</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Generate tailored test questions immediately for employees using their daily topics or custom topics.
              </p>
            </div>
          </div>
          <GenerateQuestions hideHeader={true} />
        </div>
      )}

      {/* TAB 3: SCHEDULE TEST */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-7">
          <div className="mb-5 pb-4 border-b border-slate-100">
            <h2 className="text-lg font-black text-slate-900">Configure Automated Test Schedule</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Set up a scheduled evaluation for any upcoming date and time. Configure duration, question parameters, and advance AI generation.
            </p>
          </div>
          {renderScheduleForm(false)}
        </div>
      )}

      {/* TAB 4: MANAGE TESTS */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          {/* Filter / Search Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
                <FaFilter size={12} /> Status:
              </span>
              {['all', 'Scheduled', 'Ready', 'In Progress', 'Completed', 'Paused', 'Failed', 'Cancelled'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === st ? 'bg-[#087443] text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st === 'all' ? 'All Statuses' : st}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <FaSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search schedules by name or date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#087443] font-medium"
              />
            </div>
          </div>

          {/* Schedules List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-slate-200">
              <Spinner size="lg" />
              <p className="text-slate-500 text-sm font-semibold mt-4">Loading test schedules...</p>
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-500">
              <FaCalendarAlt size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="font-bold text-slate-700">No test schedules found</p>
              <p className="text-xs text-slate-500 mt-1">
                Click &quot;Schedule Test&quot; above to create an automated evaluation.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredSchedules.map((schedule) => {
                const isFailed = schedule.status === 'Failed';
                const isCompleted = schedule.status === 'Completed';
                const isCancelled = schedule.status === 'Cancelled';

                return (
                  <div
                    key={schedule._id}
                    className={`bg-white rounded-2xl p-5 border transition-all duration-200 shadow-sm ${
                      isFailed ? 'border-red-300 bg-red-50/20' : 'border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left Column: Details */}
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-extrabold text-slate-900 text-base">{schedule.name}</h3>
                          {getStatusBadge(schedule.status)}
                          {schedule.repeatSchedule === 'weekly' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Repeats Every {schedule.recurrenceDay || 'Wednesday'}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                          <span className="flex items-center gap-1 font-semibold text-slate-700">
                            <FaCalendarAlt className="text-[#087443]" /> {schedule.testDate}
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-slate-700">
                            <FaClock className="text-[#087443]" /> {schedule.startTime} - {schedule.endTime} ({schedule.timezone})
                          </span>
                          <span className="flex items-center gap-1">
                            <FaUsers className="text-slate-400" /> {schedule.workers?.length || 0} developers
                          </span>
                          <span className="flex items-center gap-1">
                            <FaListOl className="text-slate-400" /> {schedule.questionsPerWorker} Qs • {schedule.timePerQuestion || 30}s / question
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-700">Topic Source:</span>
                          {schedule.topicSource === 'daily_topics' ? (
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                              Daily Topics ({schedule.topicDateRange?.startDate || 'N/A'} to {schedule.topicDateRange?.endDate || 'N/A'})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                              Manual: {(schedule.manualTopics || []).join(', ')}
                            </span>
                          )}
                          {schedule.batchId && (
                            <span className="text-slate-400 font-mono text-[11px]">
                              Batch: {schedule.batchId}
                            </span>
                          )}
                        </div>

                        {isFailed && schedule.failureReason && (
                          <div className="mt-2 p-2.5 bg-red-100/70 border border-red-300 rounded-lg text-xs text-red-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FaExclamationCircle className="text-red-600 flex-shrink-0" />
                              <span><strong>Failure:</strong> {schedule.failureReason}</span>
                            </div>
                            {schedule.failureDiagnostic && (
                              <button
                                type="button"
                                onClick={() => setDiagnosticModal({ isOpen: true, diagnostic: schedule.failureDiagnostic, name: schedule.name })}
                                className="text-red-900 underline font-bold hover:text-red-950 text-[11px] ml-2 cursor-pointer"
                              >
                                View Diagnostic
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Column: Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {isFailed && (
                          <Button
                            onClick={() => handleRetry(schedule._id)}
                            className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold"
                          >
                            <FaRedo size={11} /> Retry Generation
                          </Button>
                        )}

                        {schedule.status === 'Paused' && (
                          <Button
                            onClick={() => handleResume(schedule._id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold"
                          >
                            <FaPlayCircle size={11} /> Resume Schedule
                          </Button>
                        )}

                        {schedule.status === 'Scheduled' && (
                          <Button
                            onClick={() => handleTriggerNow(schedule._id)}
                            className="bg-[#087443] hover:bg-[#065b34] text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold"
                          >
                            <FaPlay size={10} /> Generate Now
                          </Button>
                        )}

                        {!isCompleted && !isCancelled && schedule.status !== 'Paused' && (
                          <button
                            type="button"
                            onClick={() => handlePause(schedule._id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <FaPause size={10} /> Pause
                          </button>
                        )}

                        {!isCompleted && !isCancelled && (
                          <button
                            type="button"
                            onClick={() => openEditModal(schedule)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <FaEdit size={12} /> Edit
                          </button>
                        )}

                        {!isCompleted && !isCancelled && (
                          <button
                            type="button"
                            onClick={() => handleCancel(schedule._id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <FaBan size={11} /> Cancel
                          </button>
                        )}

                        {(isCancelled || isFailed) && (
                          <button
                            type="button"
                            onClick={() => handleDelete(schedule._id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 hover:bg-red-100 text-red-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <FaTrash size={11} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal: Edit Test Schedule */}
      {isEditModalOpen && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Test Schedule"
          size="2xl"
        >
          {renderScheduleForm(true)}
        </Modal>
      )}

      {/* Modal: Failure Diagnostic */}
      {diagnosticModal.isOpen && (
        <Modal
          isOpen={diagnosticModal.isOpen}
          onClose={() => setDiagnosticModal({ isOpen: false, diagnostic: null, name: '' })}
          title={`Generation Diagnostic — ${diagnosticModal.name}`}
          size="lg"
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-600 font-medium">
              Diagnostic failure trace captured during AI question generation:
            </p>
            <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-xs overflow-x-auto font-mono max-h-72">
              {JSON.stringify(diagnosticModal.diagnostic, null, 2)}
            </pre>
            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setDiagnosticModal({ isOpen: false, diagnostic: null, name: '' })}
                className="bg-slate-800 text-white text-xs px-4 py-1.5"
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default TestScheduleManagement;
