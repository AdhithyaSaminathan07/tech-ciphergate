import { useContext, useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { createLeave, getLeaveApplyStats } from '../../services/leaveService';
import Card from '../common/Card';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import { FiAlertTriangle, FiInfo, FiActivity, FiUserCheck, FiLayers } from 'react-icons/fi';

const ApplyForLeave = () => {
  const { user } = useAuth();
  const { subdomain } = useContext(appContext);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    leaveType: 'Annual Leave',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    totalDays: 0,
    reason: '',
    document: null,
    startTime: '',
    endTime: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (subdomain && subdomain !== 'main') {
      fetchApplyStats();
    }
  }, [subdomain]);

  const fetchApplyStats = async () => {
    try {
      setLoadingStats(true);
      const data = await getLeaveApplyStats(subdomain);
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const calculateTotalDays = (start, end) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate) || isNaN(endDate)) return 0;

    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };

      if ((name === 'startDate' || name === 'endDate') && updated.leaveType !== 'Permission') {
        updated.totalDays = calculateTotalDays(
          name === 'startDate' ? value : prev.startDate,
          name === 'endDate' ? value : prev.endDate
        );
      }

      if (name === 'leaveType') {
        updated.startTime = '';
        updated.endTime = '';
        if (value === 'Permission') {
          updated.totalDays = 0;
        } else {
          updated.totalDays = calculateTotalDays(updated.startDate, updated.endDate);
        }
      }

      return updated;
    });
  };

  const handleDocumentChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, document: file }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!subdomain || subdomain === 'main') {
      toast.error('Subdomain is missing, check the URL');
      return;
    }

    if (!formData.leaveType || !formData.startDate || !formData.endDate || !formData.reason) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.leaveType === 'Permission' && (!formData.startTime || !formData.endTime)) {
      toast.error('Please provide a start and end time for your permission request.');
      return;
    }

    setIsSubmitting(true);
    const formPayload = new FormData();
    formPayload.append('leaveType', formData.leaveType);
    formPayload.append('startDate', formData.startDate);
    formPayload.append('endDate', formData.endDate);
    formPayload.append('reason', formData.reason);
    // FIX: Append the subdomain to the form data
    formPayload.append('subdomain', subdomain);
    formPayload.append('totalDays', formData.totalDays);
    if (formData.document) {
      formPayload.append('document', formData.document);
    }
    if (formData.leaveType === 'Permission') {
      formPayload.append('startTime', formData.startTime);
      formPayload.append('endTime', formData.endTime);
    }

    try {
      await createLeave(formPayload);
      toast.success('Leave application submitted successfully!');

      setFormData({
        leaveType: 'Annual Leave',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        totalDays: 0,
        reason: '',
        document: null,
        startTime: '',
        endTime: ''
      });

      // Navigate to leave requests page after successful submission
      setTimeout(() => {
        navigate('/worker/leave-requests');
      }, 1500);
    } catch (error) {
      toast.error(error.message || 'Failed to submit leave application');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Apply for Leave</h1>
        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-bold border border-blue-100 flex items-center shadow-sm">
          <FiInfo className="mr-2" />
          Leave Policy Active
        </div>
      </div>

      {/* Attendance Stats & Policy Summary */}
      {loadingStats ? (
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-gray-200 animate-pulse rounded-2xl"></div>
          ))}
        </div>
      ) : stats && (
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Company</span>
              <FiActivity className={`text-blue-500 ${!stats.advancedSettings?.thresholds?.company?.enabled ? 'opacity-30' : ''}`} />
            </div>
            <div className={`text-2xl font-black ${!stats.advancedSettings?.thresholds?.company?.enabled ? 'text-gray-400' : 'text-gray-900'}`}>{stats.stats.companyAttendance}%</div>
            <div className={`mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden`}>
              <div
                className={`h-full ${!stats.advancedSettings?.thresholds?.company?.enabled ? 'bg-gray-300' : stats.stats.companyAttendance >= (stats.advancedSettings?.thresholds?.company?.value || 80) ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${stats.stats.companyAttendance}%` }}
              ></div>
            </div>
            {!stats.advancedSettings?.thresholds?.company?.enabled && <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">Policy Disabled</p>}
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Department</span>
              <FiLayers className={`text-indigo-500 ${!stats.advancedSettings?.thresholds?.department?.enabled ? 'opacity-30' : ''}`} />
            </div>
            <div className={`text-2xl font-black ${!stats.advancedSettings?.thresholds?.department?.enabled ? 'text-gray-400' : 'text-gray-900'}`}>{stats.stats.deptAttendance}%</div>
            <div className={`mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden`}>
              <div
                className={`h-full ${!stats.advancedSettings?.thresholds?.department?.enabled ? 'bg-gray-300' : stats.stats.deptAttendance >= (stats.advancedSettings?.thresholds?.department?.value || 80) ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${stats.stats.deptAttendance}%` }}
              ></div>
            </div>
            {!stats.advancedSettings?.thresholds?.department?.enabled && <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">Policy Disabled</p>}
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Personal</span>
              <FiUserCheck className={`text-emerald-500 ${!stats.advancedSettings?.thresholds?.employee?.enabled ? 'opacity-30' : ''}`} />
            </div>
            <div className={`text-2xl font-black ${!stats.advancedSettings?.thresholds?.employee?.enabled ? 'text-gray-400' : 'text-gray-900'}`}>{stats.stats.personalAttendance}%</div>
            <div className={`mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden`}>
              <div
                className={`h-full ${!stats.advancedSettings?.thresholds?.employee?.enabled ? 'bg-gray-300' : stats.stats.personalAttendance >= (stats.advancedSettings?.thresholds?.employee?.value || 90) ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${stats.stats.personalAttendance}%` }}
              ></div>
            </div>
            {!stats.advancedSettings?.thresholds?.employee?.enabled && <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">Policy Disabled</p>}
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Monthly Usage</span>
              <FiInfo className="text-orange-500" />
            </div>
            <div className="text-2xl font-black text-gray-900">{stats.stats.leavesTaken} / {stats.stats.allowedLimit}</div>
            <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase">Days Used This Month</p>
          </div>
        </div>
      )}

      {/* Penalty Warning Card */}
      {!loadingStats && stats?.willApply2X && formData.leaveType !== 'Permission' && (
        <div className="mb-8 bg-black rounded-3xl p-6 text-white border-4 border-red-500/30 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <FiAlertTriangle size={120} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center mb-4">
              <div className="bg-red-500 p-2 rounded-xl mr-4 animate-pulse">
                <FiAlertTriangle className="text-white h-6 w-6" />
              </div>
              <h2 className="text-xl font-black tracking-tight">ATTENTION: 2X DEDUCTION APPLIES</h2>
            </div>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed max-w-lg">
              Based on current system rules, this leave will result in a <strong>2 days salary deduction for 1 day leave</strong> due to:
            </p>
            <div className="flex flex-wrap gap-2">
              {stats.reasons.attendance && (
                <span className="bg-red-500/20 text-red-400 px-4 py-1.5 rounded-full text-xs font-bold border border-red-500/30 flex items-center">
                  Low Attendance Threshold
                </span>
              )}
              {stats.reasons.monthlyLimit && (
                <span className="bg-orange-500/20 text-orange-400 px-4 py-1.5 rounded-full text-xs font-bold border border-orange-500/30 flex items-center">
                  Monthly Leave Limit Exceeded
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <Card>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="form-group">
              <label htmlFor="leaveType" className="form-label">Leave Type</label>
              <select
                id="leaveType"
                name="leaveType"
                className="form-input"
                value={formData.leaveType}
                onChange={handleChange}
                required
              >
                <option value="Annual Leave">Annual Leave</option>
                <option value="Sick Leave">Sick Leave</option>
                <option value="Personal Leave">Personal Leave</option>
                <option value="Permission">Permission</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="totalDays" className="form-label">Total Days</label>
              <input
                type="number"
                id="totalDays"
                name="totalDays"
                className="form-input"
                value={formData.totalDays}
                onChange={handleChange}
                min="0"
                required
                readOnly
              />
            </div>

            <div className="form-group">
              <label htmlFor="startDate" className="form-label">Start Date</label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                className="form-input"
                value={formData.startDate}
                onChange={handleChange}
                min={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="endDate" className="form-label">End Date</label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                className="form-input"
                value={formData.endDate}
                onChange={handleChange}
                min={formData.startDate || new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            {formData.leaveType === 'Permission' && (
              <>
                <div className="form-group">
                  <label htmlFor="startTime" className="form-label">Start Time</label>
                  <input
                    type="time"
                    id="startTime"
                    name="startTime"
                    className="form-input"
                    value={formData.startTime}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="endTime" className="form-label">End Time</label>
                  <input
                    type="time"
                    id="endTime"
                    name="endTime"
                    className="form-input"
                    value={formData.endTime}
                    onChange={handleChange}
                    required
                  />
                </div>
              </>
            )}
          </div>

          <div className="form-group mb-6">
            <label htmlFor="reason" className="form-label">Reason</label>
            <textarea
              id="reason"
              name="reason"
              className="form-input rounded-lg"
              rows="4"
              value={formData.reason}
              onChange={handleChange}
              placeholder="Provide details about your leave request"
              required
            ></textarea>
          </div>

          <div className="form-group mb-6">
            <label htmlFor="document" className="form-label">Supporting Document (optional)</label>
            <input
              type="file"
              id="document"
              name="document"
              className="form-input"
              onChange={handleDocumentChange}
              accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
            />
            <p className="text-sm text-gray-500 mt-1">
              Upload any supporting documents (medical certificates, etc.)
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Spinner size="sm" /> : 'Submit Leave Application'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default ApplyForLeave;