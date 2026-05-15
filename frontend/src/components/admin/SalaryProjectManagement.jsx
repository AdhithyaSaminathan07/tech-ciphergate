import React, { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import {
  FaPlus, FaEdit, FaTrash, FaProjectDiagram, FaUsers, FaCalendarAlt, FaTimes, FaCheck
} from 'react-icons/fa';
import appContext from '../../context/AppContext';
import { getWorkers } from '../../services/workerService';
import {
  getSalaryProjects, createSalaryProject, updateSalaryProject, deleteSalaryProjectById
} from '../../services/salaryService';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Card from '../common/Card';
import Spinner from '../common/Spinner';

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const emptyForm = {
  projectName: '',
  projectAmount: '',
  profitPercentage: '60',
  developers: [],
  startDate: '',
  endDate: ''
};

const SalaryProjectManagement = () => {
  const { subdomain } = useContext(appContext);
  const [projects, setProjects] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [searchDev, setSearchDev] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [projRes, workersData] = await Promise.all([
        getSalaryProjects(subdomain, filterMonth, filterYear),
        getWorkers({ subdomain })
      ]);
      setProjects(projRes.projects || []);
      setWorkers(Array.isArray(workersData) ? workersData : []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [filterMonth, filterYear]);

  const computedPreview = () => {
    const amt = parseFloat(form.projectAmount) || 0;
    const pct = parseFloat(form.profitPercentage) || 0;
    const profit = amt * (pct / 100);
    const devCount = form.developers.length || 1;
    const share = profit / devCount;

    // Count working days (exclude Sundays)
    let workingDays = 0;
    if (form.startDate && form.endDate) {
      const cur = new Date(form.startDate);
      const end = new Date(form.endDate);
      while (cur <= end) {
        if (cur.getDay() !== 0) workingDays++;
        cur.setDate(cur.getDate() + 1);
      }
    }
    const perDay = workingDays > 0 ? share / workingDays : 0;
    return { profit, share, workingDays, perDay };
  };

  const preview = computedPreview();

  const openCreate = () => {
    setForm(emptyForm);
    setIsEditMode(false);
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (project) => {
    setForm({
      projectName: project.projectName,
      projectAmount: String(project.projectAmount),
      profitPercentage: String(project.profitPercentage),
      developers: project.developers.map(d => d._id || d),
      startDate: new Date(project.startDate).toISOString().split('T')[0],
      endDate: new Date(project.endDate).toISOString().split('T')[0]
    });
    setIsEditMode(true);
    setEditingId(project._id);
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const { projectName, projectAmount, profitPercentage, developers, startDate, endDate } = form;
    if (!projectName || !projectAmount || !startDate || !endDate) {
      toast.error('Please fill all required fields');
      return;
    }
    if (developers.length === 0) {
      toast.error('Please assign at least one developer');
      return;
    }
    try {
      if (isEditMode) {
        await updateSalaryProject(editingId, {
          projectName, projectAmount: parseFloat(projectAmount),
          profitPercentage: parseFloat(profitPercentage), developers, startDate, endDate
        });
        toast.success('Project updated successfully');
      } else {
        await createSalaryProject({
          projectName, projectAmount: parseFloat(projectAmount),
          profitPercentage: parseFloat(profitPercentage), developers, startDate, endDate, subdomain
        });
        toast.success('Project created successfully');
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to save project');
    }
  };

  const handleDelete = async (projectId, projectName) => {
    if (!window.confirm(`Delete project "${projectName}"? This will affect salary reports.`)) return;
    try {
      await deleteSalaryProjectById(projectId);
      toast.success('Project deleted');
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete project');
    }
  };

  const toggleDeveloper = (devId) => {
    setForm(prev => ({
      ...prev,
      developers: prev.developers.includes(devId)
        ? prev.developers.filter(id => id !== devId)
        : [...prev.developers, devId]
    }));
  };

  const filteredWorkers = workers.filter(w =>
    w.name.toLowerCase().includes(searchDev.toLowerCase())
  );

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const formatDate = (d) => {
    if (!d) return '-';
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between md:justify-end mb-6 gap-4">
        <div className="md:hidden">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FaProjectDiagram className="text-teal-600" /> Salary Projects
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create multi-developer projects. Each project day overrides the SAAS base salary.
          </p>
        </div>
        <Button variant="primary" className="flex items-center gap-2" onClick={openCreate}>
          <FaPlus /> New Project
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Month</label>
            <select
              className="form-input"
              value={filterMonth}
              onChange={e => setFilterMonth(parseInt(e.target.value))}
            >
              {MONTHS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Year</label>
            <select
              className="form-input"
              value={filterYear}
              onChange={e => setFilterYear(parseInt(e.target.value))}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Project Cards */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : projects.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-400">
            <FaProjectDiagram className="text-5xl mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No salary projects found for this period</p>
            <p className="text-sm mt-1">Create a project to enable hybrid per-day salary calculation</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map(project => {
            const devCount = project.developers.length || 1;
            const profit = project.projectProfit || (project.projectAmount * project.profitPercentage / 100);
            const share = profit / devCount;

            // Count working days
            let wDays = 0;
            const cur = new Date(project.startDate);
            const end = new Date(project.endDate);
            while (cur <= end) {
              if (cur.getDay() !== 0) wDays++;
              cur.setDate(cur.getDate() + 1);
            }
            const perDay = wDays > 0 ? share / wDays : 0;

            return (
              <div key={project._id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                {/* Header strip */}
                <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FaProjectDiagram className="text-white opacity-80" />
                    <h3 className="text-white font-semibold text-sm truncate">{project.projectName}</h3>
                  </div>
                  <span className="bg-white bg-opacity-20 text-white text-xs px-2 py-0.5 rounded-full">
                    {project.profitPercentage}% profit
                  </span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 p-4">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-500">Project Amount</p>
                    <p className="font-bold text-gray-800 text-sm">₹{project.projectAmount?.toLocaleString()}</p>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-teal-600">Project Profit</p>
                    <p className="font-bold text-teal-700 text-sm">₹{profit.toLocaleString()}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-blue-500">Per Developer Share</p>
                    <p className="font-bold text-blue-700 text-sm">₹{share.toFixed(2)}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-purple-500">Per Day Value</p>
                    <p className="font-bold text-purple-700 text-sm">₹{perDay.toFixed(2)}</p>
                  </div>
                </div>

                {/* Date range & working days */}
                <div className="px-4 pb-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                    <FaCalendarAlt className="text-teal-500" />
                    <span>{formatDate(project.startDate)} — {formatDate(project.endDate)}</span>
                    <span className="ml-auto bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                      {wDays} working days
                    </span>
                  </div>

                  {/* Developers */}
                  <div className="flex items-center gap-1 flex-wrap mt-2">
                    <FaUsers className="text-gray-400 text-xs" />
                    {project.developers.slice(0, 4).map(d => (
                      <span key={d._id || d} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                        {d.name || 'Unknown'}
                      </span>
                    ))}
                    {project.developers.length > 4 && (
                      <span className="text-xs text-gray-400">+{project.developers.length - 4} more</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="border-t border-gray-100 px-4 py-2 flex justify-end gap-3">
                  <button
                    onClick={() => openEdit(project)}
                    className="text-teal-600 hover:text-teal-800 transition-colors p-1"
                    title="Edit"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => handleDelete(project._id, project.projectName)}
                    className="text-red-500 hover:text-red-700 transition-colors p-1"
                    title="Delete"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditMode ? 'Edit Salary Project' : 'Create Salary Project'}
        size="xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Project Name *</label>
              <input
                type="text"
                className="form-input"
                value={form.projectName}
                onChange={e => setForm(p => ({ ...p, projectName: e.target.value }))}
                required
                placeholder="e.g. Client Portal v2"
              />
            </div>
            <div>
              <label className="form-label">Project Amount (₹) *</label>
              <input
                type="number"
                className="form-input"
                value={form.projectAmount}
                onChange={e => setForm(p => ({ ...p, projectAmount: e.target.value }))}
                required
                min="0"
                step="0.01"
                placeholder="50000"
              />
            </div>
            <div>
              <label className="form-label">Profit Percentage (%) *</label>
              <input
                type="number"
                className="form-input"
                value={form.profitPercentage}
                onChange={e => setForm(p => ({ ...p, profitPercentage: e.target.value }))}
                required
                min="0"
                max="100"
                step="0.1"
              />
            </div>
            <div>
              {/* Placeholder to keep grid balanced */}
            </div>
            <div>
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                className="form-input"
                value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="form-label">End Date *</label>
              <input
                type="date"
                className="form-input"
                value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Live Preview */}
          {form.projectAmount && form.startDate && form.endDate && (
            <div className="bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-200 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-teal-700 mb-3">📊 Live Calculation Preview</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-xs text-gray-500">Project Profit</p>
                  <p className="font-bold text-teal-700">₹{preview.profit.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Per Developer</p>
                  <p className="font-bold text-blue-700">₹{preview.share.toFixed(2)}</p>
                  <p className="text-[10px] text-gray-400">({form.developers.length || 1} dev{form.developers.length !== 1 ? 's' : ''})</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Working Days</p>
                  <p className="font-bold text-gray-700">{preview.workingDays}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Per Day Value</p>
                  <p className="font-bold text-purple-700">₹{preview.perDay.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Developer Selection */}
          <div>
            <label className="form-label">Assign Developers *</label>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-2 border-b bg-gray-50">
                <input
                  type="text"
                  className="form-input py-1.5 text-sm"
                  placeholder="Search developers..."
                  value={searchDev}
                  onChange={e => setSearchDev(e.target.value)}
                />
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                {filteredWorkers.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-4">No workers found</p>
                ) : filteredWorkers.map(worker => {
                  const isSelected = form.developers.includes(worker._id);
                  return (
                    <div
                      key={worker._id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-teal-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggleDeveloper(worker._id)}
                    >
                      <div className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${isSelected ? 'bg-teal-500 border-teal-500' : 'border-gray-300'}`}>
                        {isSelected && <FaCheck className="text-white text-[8px]" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{worker.name}</p>
                        <p className="text-xs text-gray-400">{worker.department?.name || worker.department || 'N/A'} • {worker.rfid || worker._id.slice(-6)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {form.developers.length > 0 && (
              <p className="text-xs text-teal-600 mt-1">
                {form.developers.length} developer{form.developers.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {isEditMode ? 'Update Project' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SalaryProjectManagement;
