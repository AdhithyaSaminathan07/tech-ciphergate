import React, { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { FaWallet, FaHistory, FaMoneyBillWave, FaArrowDown, FaArrowUp, FaTimes, FaUsers } from 'react-icons/fa';
import appContext from '../../../context/AppContext';
import { getWalletBalances, getWalletHistory, debitWallet } from '../../../services/salaryService';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import Spinner from '../../common/Spinner';

const WalletManagementModal = ({ isOpen, onClose }) => {
  const { subdomain } = useContext(appContext);
  
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);
  
  const [history, setHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  
  const [isDebitModalOpen, setIsDebitModalOpen] = useState(false);
  const [debitForm, setDebitForm] = useState({
    amount: '',
    debitType: 'Direct',
    description: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const loadWallets = async () => {
    setIsLoading(true);
    try {
      const res = await getWalletBalances(subdomain);
      setWorkers(res.wallets || []);
    } catch (err) {
      toast.error('Failed to load wallet balances');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadWallets();
      setSelectedWorker(null);
    }
  }, [isOpen]);

  const loadHistory = async (workerId) => {
    setIsHistoryLoading(true);
    try {
      const res = await getWalletHistory(workerId, subdomain);
      setHistory(res.history || []);
    } catch (err) {
      toast.error('Failed to load wallet history');
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleSelectWorker = (worker) => {
    setSelectedWorker(worker);
    loadHistory(worker._id);
  };

  const handleOpenDebit = () => {
    setDebitForm({
      amount: '',
      debitType: 'Direct',
      description: '',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear()
    });
    setIsDebitModalOpen(true);
  };

  const handleDebitSubmit = async (e) => {
    e.preventDefault();
    if (!debitForm.amount || parseFloat(debitForm.amount) <= 0) {
      return toast.error('Enter a valid amount');
    }
    if (parseFloat(debitForm.amount) > (selectedWorker.walletBalance || 0)) {
      return toast.error('Insufficient wallet balance');
    }

    try {
      const res = await debitWallet(selectedWorker._id, {
        ...debitForm,
        subdomain,
        amount: parseFloat(debitForm.amount)
      });
      toast.success(res.message || 'Wallet debited successfully');
      
      // Update local state
      setSelectedWorker({ ...selectedWorker, walletBalance: res.balance });
      setWorkers(workers.map(w => w._id === selectedWorker._id ? { ...w, walletBalance: res.balance } : w));
      
      setIsDebitModalOpen(false);
      loadHistory(selectedWorker._id);
    } catch (err) {
      toast.error(err.message || 'Failed to debit wallet');
    }
  };

  const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Employee Wallet Management" size="4xl">
      <div className="flex flex-col md:flex-row gap-6 min-h-[500px]">
        
        {/* Left Side: Employee List */}
        <div className="w-full md:w-1/3 border-r border-gray-100 pr-0 md:pr-4">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FaUsers className="text-gray-400" /> Employees
          </h3>
          <div className="bg-gray-50 rounded-lg p-2 max-h-[500px] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center p-8"><Spinner size="md" /></div>
            ) : workers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center p-4">No employees found.</p>
            ) : (
              <div className="space-y-2">
                {workers.map(w => (
                  <div
                    key={w._id}
                    onClick={() => handleSelectWorker(w)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${selectedWorker?._id === w._id ? 'border-teal-500 bg-teal-50 shadow-sm' : 'border-transparent bg-white hover:border-gray-200 hover:shadow-sm'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{w.name}</p>
                        <p className="text-xs text-gray-400">{w.department?.name || 'N/A'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 mb-0.5">Balance</p>
                        <p className={`font-bold text-sm ${w.walletBalance > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          ₹{(w.walletBalance || 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Wallet Details */}
        <div className="w-full md:w-2/3 pl-0 md:pl-2">
          {!selectedWorker ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-60">
              <FaWallet className="text-6xl mb-4" />
              <p>Select an employee to manage their wallet</p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Worker Wallet Header */}
              <div className="bg-gradient-to-r from-teal-600 to-teal-800 rounded-xl p-5 text-white shadow-md mb-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <FaWallet className="text-8xl" />
                </div>
                <div className="relative z-10 flex justify-between items-end">
                  <div>
                    <h2 className="text-xl font-bold">{selectedWorker.name}'s Wallet</h2>
                    <p className="text-teal-100 text-sm mt-1">Available Balance</p>
                    <p className="text-4xl font-extrabold mt-1">₹{(selectedWorker.walletBalance || 0).toFixed(2)}</p>
                  </div>
                  <button 
                    className="bg-white text-teal-700 hover:bg-teal-50 flex items-center gap-2 px-4 py-2 rounded-xl font-bold shadow-sm transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleOpenDebit}
                    disabled={!selectedWorker.walletBalance || selectedWorker.walletBalance <= 0}
                  >
                    <FaMoneyBillWave /> Withdraw / Debit
                  </button>
                </div>
              </div>

              {/* Transaction History */}
              <div className="flex-1 flex flex-col">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <FaHistory className="text-gray-400" /> Transaction History
                </h3>
                <div className="bg-white border border-gray-200 rounded-lg flex-1 overflow-hidden flex flex-col">
                  {isHistoryLoading ? (
                    <div className="flex justify-center p-8"><Spinner size="md" /></div>
                  ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-gray-400">
                      <FaHistory className="text-4xl mb-3 opacity-20" />
                      <p className="text-sm">No wallet transactions found.</p>
                    </div>
                  ) : (
                    <div className="overflow-y-auto max-h-[350px]">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                          <tr>
                            <th className="py-2.5 px-4 text-xs font-semibold text-gray-500">Date</th>
                            <th className="py-2.5 px-4 text-xs font-semibold text-gray-500">Details</th>
                            <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 text-right">Amount</th>
                            <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {history.map(txn => (
                            <tr key={txn._id} className="hover:bg-gray-50">
                              <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                                {new Date(txn.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  {txn.type === 'Credit' ? (
                                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                      <FaArrowDown className="text-green-600 text-[10px]" />
                                    </div>
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                      <FaArrowUp className="text-red-600 text-[10px]" />
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-sm text-gray-800">{txn.description}</p>
                                    {txn.actionBy && <p className="text-[10px] text-gray-400">By: {txn.actionBy.name}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className={`py-3 px-4 text-right text-sm font-semibold ${txn.type === 'Credit' ? 'text-green-600' : 'text-red-600'}`}>
                                {txn.type === 'Credit' ? '+' : '-'} ₹{txn.amount.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-right text-sm font-medium text-gray-600">
                                ₹{txn.balanceAfter.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Nested Debit Modal */}
      {isDebitModalOpen && (
        <Modal
          isOpen={isDebitModalOpen}
          onClose={() => setIsDebitModalOpen(false)}
          title="Withdraw Wallet Balance"
          size="md"
        >
          <form onSubmit={handleDebitSubmit} className="space-y-4">
            <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 flex justify-between items-center mb-4">
              <span className="text-sm text-teal-800">Available Balance:</span>
              <span className="text-lg font-bold text-teal-700">₹{(selectedWorker?.walletBalance || 0).toFixed(2)}</span>
            </div>

            <div>
              <label className="form-label">Withdrawal Amount (₹) *</label>
              <input
                type="number"
                className="form-input"
                value={debitForm.amount}
                onChange={e => setDebitForm(p => ({ ...p, amount: e.target.value }))}
                required
                min="0.01"
                max={selectedWorker?.walletBalance || 0}
                step="0.01"
              />
            </div>

            <div>
              <label className="form-label">Withdrawal Type *</label>
              <select
                className="form-input"
                value={debitForm.debitType}
                onChange={e => setDebitForm(p => ({ ...p, debitType: e.target.value }))}
                required
              >
                <option value="Direct">Direct Debit (Subtract only)</option>
                <option value="Salary">Salary Debit (Add to Monthly Salary)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {debitForm.debitType === 'Direct' 
                  ? "Directly removes money from wallet without affecting payroll."
                  : "Removes money from wallet and creates a Payroll Addition for the selected month, so it pays out with their salary."}
              </p>
            </div>

            {debitForm.debitType === 'Salary' && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 border rounded-lg mt-2">
                <div>
                  <label className="form-label text-xs">Payroll Month *</label>
                  <select
                    className="form-input py-1 text-sm"
                    value={debitForm.month}
                    onChange={e => setDebitForm(p => ({ ...p, month: parseInt(e.target.value) }))}
                  >
                    {MONTHS.slice(1).map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label text-xs">Payroll Year *</label>
                  <select
                    className="form-input py-1 text-sm"
                    value={debitForm.year}
                    onChange={e => setDebitForm(p => ({ ...p, year: parseInt(e.target.value) }))}
                  >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="form-label">Reason / Remarks *</label>
              <input
                type="text"
                className="form-input"
                value={debitForm.description}
                onChange={e => setDebitForm(p => ({ ...p, description: e.target.value }))}
                required
                placeholder="e.g. June Profit Payout"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDebitModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Process Withdrawal
              </Button>
            </div>
          </form>
        </Modal>
      )}

    </Modal>
  );
};

export default WalletManagementModal;
