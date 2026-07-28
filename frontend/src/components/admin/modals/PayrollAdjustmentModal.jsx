import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, History, RotateCcw, Search, Calendar } from 'lucide-react';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import { toast } from 'react-toastify';
import { addPayrollAdjustment, deletePayrollAdjustment, restorePayrollAdjustment, getBulkSalaryReport } from '../../../services/salaryService';

const CATEGORIES = ['Bonus', 'Correction', 'Allowance', 'Advance Recovery', 'Reimbursement', 'Incentive', 'Fine', 'Other'];

const PayrollAdjustmentModal = ({ isOpen, onClose, bulkReportData, month, year, subdomain, deductionView, onAdjustmentSaved }) => {
    const [localMonth, setLocalMonth] = useState(month);
    const [localYear, setLocalYear] = useState(year);
    const [localBulkData, setLocalBulkData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    
    const [selectedWorker, setSelectedWorker] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isManaging, setIsManaging] = useState(false);
    
    // Management states
    const [adjustments, setAdjustments] = useState([]);
    const [attendanceSalary, setAttendanceSalary] = useState(0);
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    
    const [newAdjustment, setNewAdjustment] = useState({
        type: 'addition',
        category: 'Bonus',
        amount: '',
        reason: '',
        remarks: ''
    });

    // Initialize/Sync from props
    useEffect(() => {
        if (isOpen) {
            setLocalMonth(month);
            setLocalYear(year);
            setLocalBulkData(bulkReportData || []);
        }
    }, [isOpen, bulkReportData, month, year]);

    // Fetch data when month/year filter changes
    const fetchLocalData = async (m, y) => {
        setIsLoading(true);
        try {
            const fromDate = new Date(y, m - 1, 1).toISOString().slice(0, 10);
            const toDate = new Date(y, m, 0).toISOString().slice(0, 10);
            if (subdomain) {
                const data = await getBulkSalaryReport(subdomain, fromDate, toDate);
                const workerIds = bulkReportData.map(w => w.workerId);
                const filtered = (data.reports || []).filter(r => workerIds.includes(r.workerId));
                setLocalBulkData(filtered);
            }
        } catch (err) {
            console.error('Error fetching period data:', err);
            toast.error('Failed to load data for the selected period');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePeriodChange = (m, y) => {
        setLocalMonth(m);
        setLocalYear(y);
        fetchLocalData(m, y);
    };

    const loadWorkerData = (workerId) => {
        const data = localBulkData.find(d => d.workerId === workerId);
        if (data) {
            setSelectedWorker(data);
            const baseSalary = data.attendanceSalary || data.totalFinalSalary;
            const penalty = deductionView ? (data.taskPenalty || 0) : 0;
            setAttendanceSalary(baseSalary - penalty);
            if (data.payrollRecord) {
                setAdjustments(data.payrollRecord.adjustments || []);
                setHistory(data.payrollRecord.history || []);
            } else {
                setAdjustments([]);
                setHistory([]);
            }
            setIsManaging(true);
        }
    };

    const handleAddAdjustment = async () => {
        if (!newAdjustment.amount || !newAdjustment.reason) return toast.error('Amount and reason are required');
        if (parseFloat(newAdjustment.amount) <= 0) return toast.error('Amount must be greater than zero');
        
        try {
            const res = await addPayrollAdjustment(selectedWorker.workerId, {
                month: localMonth,
                year: localYear,
                subdomain,
                type: newAdjustment.type,
                category: newAdjustment.category,
                amount: parseFloat(newAdjustment.amount),
                reason: newAdjustment.reason,
                remarks: newAdjustment.remarks
            });
            toast.success('Adjustment added');
            setNewAdjustment({ type: 'addition', category: 'Bonus', amount: '', reason: '', remarks: '' });
            
            // Update active state
            if (res.record) {
                setAdjustments(res.record.adjustments || []);
                setHistory(res.record.history || []);
                
                // Optimistically update the local list data for instant UI reflection
                const newActiveAdjs = (res.record.adjustments || []).filter(a => !a.isDeleted);
                const newTotalAdd = newActiveAdjs.filter(a => a.type === 'addition').reduce((sum, a) => sum + a.amount, 0);
                const newTotalDed = newActiveAdjs.filter(a => a.type === 'deduction').reduce((sum, a) => sum + a.amount, 0);
                
                setLocalBulkData(prev => prev.map(w => 
                    w.workerId === selectedWorker.workerId 
                    ? { ...w, payrollRecord: res.record, totalAdditions: newTotalAdd, totalDeductions: newTotalDed } 
                    : w
                ));
            }
            if (onAdjustmentSaved) onAdjustmentSaved();
        } catch (error) {
            toast.error('Failed to add adjustment');
        }
    };

    const handleDeleteAdjustment = async (id) => {
        try {
            const res = await deletePayrollAdjustment(selectedWorker.workerId, id, localMonth, localYear, subdomain);
            toast.success('Adjustment deleted');
            
            
            if (res.record) {
                setAdjustments(res.record.adjustments || []);
                setHistory(res.record.history || []);
                
                const newActiveAdjs = (res.record.adjustments || []).filter(a => !a.isDeleted);
                const newTotalAdd = newActiveAdjs.filter(a => a.type === 'addition').reduce((sum, a) => sum + a.amount, 0);
                const newTotalDed = newActiveAdjs.filter(a => a.type === 'deduction').reduce((sum, a) => sum + a.amount, 0);
                
                setLocalBulkData(prev => prev.map(w => 
                    w.workerId === selectedWorker.workerId 
                    ? { ...w, payrollRecord: res.record, totalAdditions: newTotalAdd, totalDeductions: newTotalDed } 
                    : w
                ));
            }
            if (onAdjustmentSaved) onAdjustmentSaved();
        } catch (error) {
            toast.error('Failed to delete adjustment');
        }
    };

    const handleRestoreAdjustment = async (id) => {
        try {
            const res = await restorePayrollAdjustment(selectedWorker.workerId, id, localMonth, localYear, subdomain);
            toast.success('Adjustment restored');
            
            
            if (res.record) {
                setAdjustments(res.record.adjustments || []);
                setHistory(res.record.history || []);
                
                const newActiveAdjs = (res.record.adjustments || []).filter(a => !a.isDeleted);
                const newTotalAdd = newActiveAdjs.filter(a => a.type === 'addition').reduce((sum, a) => sum + a.amount, 0);
                const newTotalDed = newActiveAdjs.filter(a => a.type === 'deduction').reduce((sum, a) => sum + a.amount, 0);
                
                setLocalBulkData(prev => prev.map(w => 
                    w.workerId === selectedWorker.workerId 
                    ? { ...w, payrollRecord: res.record, totalAdditions: newTotalAdd, totalDeductions: newTotalDed } 
                    : w
                ));
            }
            if (onAdjustmentSaved) onAdjustmentSaved();
        } catch (error) {
            toast.error('Failed to restore adjustment');
        }
    };

    const filteredWorkers = localBulkData?.filter(w => w.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Recalculate live totals for selected worker
    const liveAdditions = adjustments.filter(a => a.type === 'addition' && !a.isDeleted).reduce((sum, a) => sum + a.amount, 0);
    const liveDeductions = adjustments.filter(a => a.type === 'deduction' && !a.isDeleted).reduce((sum, a) => sum + a.amount, 0);
    const livePayable = Math.max(0, attendanceSalary + liveAdditions - liveDeductions);

    const monthsList = [
        { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
        { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
        { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
        { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
    ];

    const yearsList = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

    if (!isOpen) return null;

    const handleModalClose = () => {
        if (showHistory) {
            setShowHistory(false);
        } else if (isManaging) {
            setIsManaging(false);
        } else {
            setIsManaging(false); 
            setShowHistory(false); 
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleModalClose} title="Enterprise Payroll Adjustments" size="4xl">
            {!isManaging ? (
                <div className="p-4">
                    {/* Filter and Search Bar */}
                    <div className="flex items-center justify-between gap-4 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-2 flex-1">
                            <Search className="w-4 h-4 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Search developer..." 
                                className="w-full bg-transparent border-none focus:outline-none text-sm font-semibold"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 bg-white border px-3 py-1.5 rounded-xl text-xs font-semibold">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <select 
                                    value={localMonth} 
                                    onChange={e => handlePeriodChange(parseInt(e.target.value), localYear)}
                                    className="border-none bg-transparent focus:outline-none font-bold"
                                >
                                    {monthsList.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                                <select 
                                    value={localYear} 
                                    onChange={e => handlePeriodChange(localMonth, parseInt(e.target.value))}
                                    className="border-none bg-transparent focus:outline-none font-bold ml-1 border-l pl-2"
                                >
                                    {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[60vh] rounded-2xl border border-slate-100">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10 text-slate-400 font-black tracking-widest uppercase">
                                    <tr className="border-b">
                                        <th className="p-4">Developer</th>
                                        <th className="p-4">Attendance Salary</th>
                                        <th className="p-4">Adjustments</th>
                                        <th className="p-4">Payable Salary</th>
                                        <th className="p-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y text-slate-600">
                                    {filteredWorkers?.map(w => {
                                        const baseSalary = w.attendanceSalary || w.totalFinalSalary;
                                        const penalty = deductionView ? (w.taskPenalty || 0) : 0;
                                        const adjustedAttendanceSalary = baseSalary - penalty;

                                        const totalAdd = w.totalAdditions || 0;
                                        const totalDed = w.totalDeductions || 0;
                                        const activeAdjs = w.payrollRecord?.adjustments?.filter(a => !a.isDeleted) || [];
                                        const adjustedPayableSalary = Math.max(0, adjustedAttendanceSalary + totalAdd - totalDed);
                                        
                                        return (
                                            <tr key={w.workerId} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="p-4 font-bold text-slate-800">{w.name}</td>
                                                <td className="p-4 font-semibold">₹{adjustedAttendanceSalary.toFixed(2)}</td>
                                                <td className="p-4">
                                                    <div className="flex flex-wrap gap-1.5 max-w-md">
                                                        {activeAdjs.map((adj) => (
                                                            <span 
                                                                key={adj._id}
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${adj.type === 'addition' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}
                                                            >
                                                                <span className={`w-1 h-1 rounded-full ${adj.type === 'addition' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                                {adj.type === 'addition' ? '+' : '-'}₹{adj.amount} ({adj.reason})
                                                            </span>
                                                        ))}
                                                        {activeAdjs.length === 0 && <span className="text-slate-400">None</span>}
                                                    </div>
                                                </td>
                                                <td className="p-4 font-black text-slate-900 text-sm">₹{adjustedPayableSalary.toFixed(2)}</td>
                                                <td className="p-4">
                                                    <button 
                                                        onClick={() => loadWorkerData(w.workerId)} 
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-100 text-indigo-600 bg-indigo-50/30 hover:bg-indigo-50 font-bold transition-all text-[10px]"
                                                    >
                                                        <Edit2 className="w-3 h-3" /> Manage
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredWorkers?.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="p-8 text-center text-slate-400 font-bold">No developers found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : showHistory ? (
                <div className="p-4">
                    <button onClick={() => setShowHistory(false)} className="text-xs text-indigo-600 font-bold mb-4 flex items-center gap-1">
                        &larr; Back to Adjustments
                    </button>
                    <h3 className="font-black text-slate-800 text-base mb-4">Audit History for {selectedWorker?.name}</h3>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                        {history.slice().reverse().map((h, idx) => {
                            const isSoftDeleted = h.action === 'DELETE';
                            return (
                                <div key={idx} className="p-4 border rounded-2xl bg-slate-50/50 text-xs">
                                    <div className="flex justify-between font-bold text-slate-700 mb-2">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                            h.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                                            h.action === 'DELETE' ? 'bg-rose-100 text-rose-700' :
                                            h.action === 'RESTORE' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'
                                        }`}>{h.action}</span>
                                        <span className="text-slate-400">{new Date(h.timestamp).toLocaleString()}</span>
                                    </div>
                                    {h.action === 'CREATE' && h.newValue && (
                                        <div className="text-slate-600 font-medium">Added {h.newValue.type} of <span className="font-bold text-slate-800">₹{h.newValue.amount}</span> ({h.newValue.category} - {h.newValue.reason})</div>
                                    )}
                                    {h.action === 'DELETE' && h.oldValue && (
                                        <div className="flex justify-between items-center">
                                            <div className="text-slate-600 font-medium">Deleted {h.oldValue.type} of <span className="font-bold text-slate-800">₹{h.oldValue.amount}</span> ({h.oldValue.category} - {h.oldValue.reason})</div>
                                            <button 
                                                onClick={() => handleRestoreAdjustment(h.adjustmentId)}
                                                className="px-2.5 py-1 bg-white border border-teal-200 hover:bg-teal-50 rounded-xl text-teal-600 text-[10px] font-bold transition-all"
                                            >
                                                Restore
                                            </button>
                                        </div>
                                    )}
                                    {h.action === 'RESTORE' && (
                                        <div className="text-slate-600 font-medium">Restored adjustment</div>
                                    )}
                                    {h.action === 'UPDATE' && h.oldValue && h.newValue && (
                                        <div className="text-slate-600 font-medium">
                                            Updated amount from ₹{h.oldValue.amount} &rarr; ₹{h.newValue.amount}
                                            <div className="mt-1 text-[10px] text-slate-400">Reason: {h.newValue.reason}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {history.length === 0 && <p className="text-slate-400 font-bold text-center py-6">No history records found.</p>}
                    </div>
                </div>
            ) : (
                <div className="p-4 grid grid-cols-3 gap-6">
                    <div className="col-span-2 flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-2">
                        <button onClick={() => setIsManaging(false)} className="text-xs text-indigo-600 font-bold flex items-center gap-1">
                            &larr; Back to List
                        </button>
                        <h3 className="font-black text-slate-800 text-lg">{selectedWorker?.name} - Adjustments</h3>
                        
                        <div className="space-y-2">
                            {adjustments.filter(a => !a.isDeleted).map((adj) => (
                                <div key={adj._id} className="p-4 border border-slate-100 rounded-2xl flex items-center justify-between hover:border-slate-200 transition-all bg-white shadow-sm shadow-slate-100/50">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${adj.type === 'addition' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                                {adj.type === 'addition' ? '(+) Addition' : '(-) Deduction'}
                                            </span>
                                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded-full">{adj.category}</span>
                                        </div>
                                        <div className="font-black text-slate-800 text-sm">₹{adj.amount.toFixed(2)}</div>
                                        <div className="text-xs text-slate-500 font-medium">{adj.reason}</div>
                                    </div>
                                    <button onClick={() => handleDeleteAdjustment(adj._id)} className="p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {adjustments.filter(a => !a.isDeleted).length === 0 && (
                                <div className="text-center p-8 border border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold text-xs">No Active Adjustments</div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-150 mt-4">
                            <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider mb-3">Add New Adjustment</h4>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <select className="px-3 py-2 border rounded-xl text-xs font-semibold bg-white" value={newAdjustment.type} onChange={e => setNewAdjustment({...newAdjustment, type: e.target.value})}>
                                    <option value="addition">(+) Addition</option>
                                    <option value="deduction">(-) Deduction</option>
                                </select>
                                <select className="px-3 py-2 border rounded-xl text-xs font-semibold bg-white" value={newAdjustment.category} onChange={e => setNewAdjustment({...newAdjustment, category: e.target.value})}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <input type="number" placeholder="Amount (₹)" className="px-3 py-2 border rounded-xl text-xs font-semibold bg-white" value={newAdjustment.amount} onChange={e => setNewAdjustment({...newAdjustment, amount: e.target.value})} />
                                <input type="text" placeholder="Reason (e.g. Server down)" className="px-3 py-2 border rounded-xl text-xs font-semibold bg-white" value={newAdjustment.reason} onChange={e => setNewAdjustment({...newAdjustment, reason: e.target.value})} />
                            </div>
                            <button 
                                onClick={handleAddAdjustment} 
                                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition-all text-xs font-bold shadow-md shadow-teal-200/50"
                            >
                                <Plus className="w-4 h-4" /> Add Adjustment
                            </button>
                        </div>
                    </div>
                    
                    {/* Summary Sidebar */}
                    <div className="col-span-1 border-l pl-6 flex flex-col gap-6">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 shadow-sm shadow-slate-100/50">
                            <h4 className="font-black text-slate-800 text-xs tracking-wider uppercase mb-4 border-b pb-2">Payroll Summary</h4>
                            <div className="flex justify-between text-xs mb-2.5 text-slate-500 font-semibold">
                                <span>Attendance Salary</span>
                                <span className="font-bold text-slate-700">₹{attendanceSalary.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs mb-2.5 text-emerald-600 font-semibold">
                                <span>Total Additions</span>
                                <span className="font-bold">+ ₹{liveAdditions.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs mb-4 text-rose-600 font-semibold">
                                <span>Total Deductions</span>
                                <span className="font-bold">- ₹{liveDeductions.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-base font-black text-slate-900 border-t pt-3">
                                <span>Payable</span>
                                <span>₹{livePayable.toFixed(2)}</span>
                            </div>
                        </div>

                        <button 
                            onClick={() => setShowHistory(true)} 
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold transition-all text-xs shadow-sm mt-auto"
                        >
                            <History className="w-4 h-4" /> Audit History
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default PayrollAdjustmentModal;
