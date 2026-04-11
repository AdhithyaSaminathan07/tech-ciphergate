import React, { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { FaDollarSign, FaHistory, FaCalendarAlt, FaUser, FaInfoCircle, FaEdit, FaTrash, FaMinus, FaPlus, FaArrowDown } from 'react-icons/fa';
import { getCommunityFundWallet, getCommunityFundTransactions, debitFund } from '../../services/communityFundService';
import { updateFine, deleteFine } from '../../services/fineService';
import { getWorkers } from '../../services/workerService';
import Spinner from '../common/Spinner';
import Modal from '../common/Modal';
import Button from '../common/Button';
import AddFineModal from './modals/AddFineModal';
import appContext from '../../context/AppContext';

const CommunityFund = () => {
    const [wallet, setWallet] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [workers, setWorkers] = useState([]);

    // Modal states
    const [isFineModalOpen, setIsFineModalOpen] = useState(false);
    const [isDebitModalOpen, setIsDebitModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    // Form data
    const [debitFormData, setDebitFormData] = useState({
        amount: '',
        reason: '',
        date: new Date().toISOString().slice(0, 10)
    });
    const [editFormData, setEditFormData] = useState({
        amount: '',
        reason: '',
        date: ''
    });
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const { subdomain } = useContext(appContext);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [walletData, transactionsData, workersData] = await Promise.all([
                getCommunityFundWallet(),
                getCommunityFundTransactions(),
                getWorkers({ subdomain })
            ]);
            setWallet(walletData);
            setTransactions(transactionsData);
            setWorkers(Array.isArray(workersData) ? workersData : []);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching community fund data:', err);
            setError('Failed to load community fund data');
            setLoading(false);
        }
    };

    // Debit Fund handlers
    const handleDebitChange = (e) => {
        const { name, value } = e.target;
        if (name === 'amount') {
            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                setDebitFormData(prev => ({ ...prev, [name]: value }));
            }
        } else {
            setDebitFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleDebitSubmit = async (e) => {
        e.preventDefault();
        const amount = parseFloat(debitFormData.amount);

        if (isNaN(amount) || amount <= 0) {
            toast.error('Amount must be a positive number');
            return;
        }

        if (amount > (wallet?.totalBalance || 0)) {
            toast.error(`Insufficient balance. Available: ₹${wallet?.totalBalance?.toFixed(2) || 0}`);
            return;
        }

        if (!debitFormData.reason.trim()) {
            toast.error('Please provide a reason');
            return;
        }

        try {
            const response = await debitFund({
                amount,
                reason: debitFormData.reason.trim(),
                date: debitFormData.date
            });
            toast.success(response.message);
            setIsDebitModalOpen(false);
            setDebitFormData({
                amount: '',
                reason: '',
                date: new Date().toISOString().slice(0, 10)
            });
            fetchData();
        } catch (error) {
            toast.error(error.message || 'Failed to debit fund');
        }
    };

    // Edit Fine handlers
    const openEditModal = (transaction) => {
        if (transaction.source !== 'fine' || !transaction.employeeId) {
            toast.error('Only fine transactions can be edited');
            return;
        }
        setSelectedTransaction(transaction);
        setEditFormData({
            amount: transaction.amount.toString(),
            reason: transaction.reason,
            date: new Date(transaction.createdAt).toISOString().slice(0, 10)
        });
        setIsEditModalOpen(true);
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        if (name === 'amount') {
            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                setEditFormData(prev => ({ ...prev, [name]: value }));
            }
        } else {
            setEditFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        const amount = parseFloat(editFormData.amount);

        if (isNaN(amount) || amount <= 0) {
            toast.error('Amount must be a positive number');
            return;
        }

        if (!editFormData.reason.trim()) {
            toast.error('Please provide a reason');
            return;
        }

        try {
            const response = await updateFine(
                selectedTransaction.employeeId._id,
                selectedTransaction.referenceId,
                {
                    amount,
                    reason: editFormData.reason.trim(),
                    date: editFormData.date
                }
            );
            toast.success(response.message);
            setIsEditModalOpen(false);
            setSelectedTransaction(null);
            fetchData();
        } catch (error) {
            toast.error(error.message || 'Failed to update fine');
        }
    };

    // Delete Fine handlers
    const openDeleteConfirm = (transaction) => {
        if (transaction.source !== 'fine' || !transaction.employeeId || !transaction.referenceId) {
            toast.error('Only fine transactions can be deleted');
            return;
        }
        setSelectedTransaction(transaction);
        setIsDeleteConfirmOpen(true);
    };

    const handleDeleteFine = async () => {
        try {
            const response = await deleteFine(
                selectedTransaction.employeeId._id,
                selectedTransaction.referenceId
            );
            toast.success(response.message);
            setIsDeleteConfirmOpen(false);
            setSelectedTransaction(null);
            fetchData();
        } catch (error) {
            toast.error(error.message || 'Failed to delete fine');
        }
    };

    if (loading) {
        return <Spinner />;
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full text-red-500">
                <FaInfoCircle className="mr-2" /> {error}
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Community Fund</h1>
                    <p className="text-gray-600 mt-1">Centralized wallet for collecting employee fines</p>
                </div>
                <div className="flex space-x-2">
                    <Button
                        variant="primary"
                        className="flex items-center"
                        onClick={() => setIsFineModalOpen(true)}
                    >
                        <FaPlus className="mr-2" /> Fine
                    </Button>
                    <Button
                        variant="secondary"
                        className="flex items-center"
                        onClick={() => setIsDebitModalOpen(true)}
                    >
                        <FaArrowDown className="mr-2" /> Debit
                    </Button>
                </div>
            </div>

            {/* Wallet Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                {/* Total Balance */}
                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-teal-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Balance</p>
                            <h3 className="text-3xl font-bold text-gray-800 mt-1">
                                ₹{wallet?.totalBalance?.toLocaleString() || 0}
                            </h3>
                        </div>
                        <div className="p-3 bg-teal-100 rounded-full text-teal-600">
                            <FaDollarSign className="text-xl" />
                        </div>
                    </div>
                </div>

                {/* Total Credits */}
                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Credits</p>
                            <h3 className="text-3xl font-bold text-green-600 mt-1">
                                +₹{wallet?.totalCredits?.toLocaleString() || 0}
                            </h3>
                        </div>
                        <div className="p-3 bg-green-100 rounded-full text-green-600">
                            <FaPlus className="text-xl" />
                        </div>
                    </div>
                </div>

                {/* Total Debits */}
                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Debits</p>
                            <h3 className="text-3xl font-bold text-red-600 mt-1">
                                -₹{wallet?.totalDebits?.toLocaleString() || 0}
                            </h3>
                        </div>
                        <div className="p-3 bg-red-100 rounded-full text-red-600">
                            <FaMinus className="text-xl" />
                        </div>
                    </div>
                </div>

                {/* Current Month Collection */}
                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">This Month</p>
                            <h3 className="text-3xl font-bold text-gray-800 mt-1">
                                ₹{wallet?.currentMonthTotal?.toLocaleString() || 0}
                            </h3>
                        </div>
                        <div className="p-3 bg-blue-100 rounded-full text-blue-600">
                            <FaCalendarAlt className="text-xl" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800">Transaction History</h2>
                    <span className="text-xs text-gray-500">{transactions.length} records</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-600 text-sm uppercase">
                                <th className="px-6 py-3 font-medium">Date</th>
                                <th className="px-6 py-3 font-medium">Type</th>
                                <th className="px-6 py-3 font-medium">Employee</th>
                                <th className="px-6 py-3 font-medium">Amount</th>
                                <th className="px-6 py-3 font-medium">Source</th>
                                <th className="px-6 py-3 font-medium">Reason</th>
                                <th className="px-6 py-3 font-medium">Added By</th>
                                <th className="px-6 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {transactions.length > 0 ? (
                                transactions.map((transaction) => (
                                    <tr key={transaction._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                                            {new Date(transaction.createdAt).toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${transaction.type === 'credit'
                                                    ? 'bg-green-100 text-green-600'
                                                    : 'bg-red-100 text-red-600'
                                                }`}>
                                                {transaction.type.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium text-gray-800">
                                            {transaction.employeeId ? (
                                                <div className="flex items-center">
                                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-3 text-gray-500">
                                                        <FaUser className="text-xs" />
                                                    </div>
                                                    <div>
                                                        <p>{transaction.employeeId?.name || 'Unknown'}</p>
                                                        <p className="text-xs text-gray-400">@{transaction.employeeId?.username}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className={`px-6 py-4 text-sm font-bold ${transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                            {transaction.type === 'credit' ? '+' : '-'}₹{transaction.amount.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${transaction.source === 'fine'
                                                    ? 'bg-orange-100 text-orange-600'
                                                    : 'bg-purple-100 text-purple-600'
                                                }`}>
                                                {transaction.source}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                                            {transaction.reason}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {transaction.createdBy?.username || 'System'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {transaction.source === 'fine' && transaction.type === 'credit' && transaction.referenceId && (
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => openEditModal(transaction)}
                                                        className="p-1 text-blue-600 hover:text-blue-800"
                                                        title="Edit Fine"
                                                    >
                                                        <FaEdit className="text-lg" />
                                                    </button>
                                                    <button
                                                        onClick={() => openDeleteConfirm(transaction)}
                                                        className="p-1 text-red-600 hover:text-red-800"
                                                        title="Delete Fine"
                                                    >
                                                        <FaTrash className="text-lg" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                                        No transactions found yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Fine Modal */}
            <AddFineModal
                isOpen={isFineModalOpen}
                onClose={() => setIsFineModalOpen(false)}
                preloadedWorkers={workers}
                onFineAdded={fetchData}
            />

            {/* Debit Modal */}
            <Modal
                isOpen={isDebitModalOpen}
                onClose={() => setIsDebitModalOpen(false)}
                title="Debit from Fund"
            >
                <form onSubmit={handleDebitSubmit}>
                    <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="text-sm text-yellow-800">
                            <strong>Available Balance:</strong> ₹{wallet?.totalBalance?.toLocaleString() || 0}
                        </p>
                    </div>

                    <div className="form-group">
                        <label htmlFor="debit-date" className="form-label">Date</label>
                        <input
                            type="date"
                            id="debit-date"
                            name="date"
                            className="form-input"
                            value={debitFormData.date}
                            onChange={handleDebitChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="debit-amount" className="form-label">Amount</label>
                        <input
                            type="text"
                            id="debit-amount"
                            name="amount"
                            className="form-input"
                            value={debitFormData.amount}
                            onChange={handleDebitChange}
                            required
                            placeholder="Enter amount to debit"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="debit-reason" className="form-label">Reason</label>
                        <textarea
                            id="debit-reason"
                            name="reason"
                            className="form-input"
                            value={debitFormData.reason}
                            onChange={handleDebitChange}
                            required
                            rows="3"
                            placeholder="Describe what the fund is used for"
                        />
                    </div>

                    <div className="flex justify-end mt-6 space-x-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsDebitModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary">
                            Debit Fund
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Edit Fine Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setSelectedTransaction(null);
                }}
                title="Edit Fine"
            >
                <form onSubmit={handleEditSubmit}>
                    {selectedTransaction && (
                        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                            <div className="font-medium">{selectedTransaction.employeeId?.name}</div>
                            <div className="text-sm text-gray-500">@{selectedTransaction.employeeId?.username}</div>
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="edit-date" className="form-label">Date</label>
                        <input
                            type="date"
                            id="edit-date"
                            name="date"
                            className="form-input"
                            value={editFormData.date}
                            onChange={handleEditChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="edit-amount" className="form-label">Amount</label>
                        <input
                            type="text"
                            id="edit-amount"
                            name="amount"
                            className="form-input"
                            value={editFormData.amount}
                            onChange={handleEditChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="edit-reason" className="form-label">Reason</label>
                        <textarea
                            id="edit-reason"
                            name="reason"
                            className="form-input"
                            value={editFormData.reason}
                            onChange={handleEditChange}
                            required
                            rows="3"
                        />
                    </div>

                    <div className="flex justify-end mt-6 space-x-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setIsEditModalOpen(false);
                                setSelectedTransaction(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary">
                            Update Fine
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteConfirmOpen}
                onClose={() => {
                    setIsDeleteConfirmOpen(false);
                    setSelectedTransaction(null);
                }}
                title="Confirm Delete"
            >
                <div className="mb-6">
                    <p className="text-gray-600">
                        Are you sure you want to delete this fine? This will:
                    </p>
                    <ul className="list-disc list-inside mt-3 text-sm text-gray-500 space-y-1">
                        <li>Remove the fine from the employee's record</li>
                        <li>Restore the deducted amount to the employee's salary</li>
                        <li>Remove the credit from the Community Fund</li>
                    </ul>
                    {selectedTransaction && (
                        <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                            <p className="text-sm text-red-800">
                                <strong>Fine:</strong> ₹{selectedTransaction.amount} from {selectedTransaction.employeeId?.name}
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex justify-end space-x-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            setIsDeleteConfirmOpen(false);
                            setSelectedTransaction(null);
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="danger"
                        onClick={handleDeleteFine}
                    >
                        Delete Fine
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default CommunityFund;
