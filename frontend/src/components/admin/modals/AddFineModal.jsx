import React, { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import { getWorkers } from '../../../services/workerService';
import { addFine } from '../../../services/fineService';
import appContext from '../../../context/AppContext';

const AddFineModal = ({ isOpen, onClose, onFineAdded, preloadedWorkers = null }) => {
    const [workers, setWorkers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedWorker, setSelectedWorker] = useState(null);
    const [formData, setFormData] = useState({
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        reason: ''
    });

    const { subdomain } = useContext(appContext);

    useEffect(() => {
        if (isOpen) {
            if (preloadedWorkers && preloadedWorkers.length > 0) {
                setWorkers(preloadedWorkers);
            } else {
                loadWorkers();
            }
        }
    }, [isOpen, preloadedWorkers]);

    const loadWorkers = async () => {
        setIsLoading(true);
        try {
            const data = await getWorkers({ subdomain });
            setWorkers(Array.isArray(data) ? data : []);
        } catch (error) {
            toast.error('Failed to load workers');
            setWorkers([]);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredWorkers = workers.filter(
        worker =>
            worker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (worker.department &&
                (typeof worker.department === 'string'
                    ? worker.department.toLowerCase().includes(searchTerm.toLowerCase())
                    : worker.department.name?.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'amount') {
            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                setFormData(prev => ({ ...prev, [name]: value }));
            }
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const fineAmount = parseFloat(formData.amount);

        if (isNaN(fineAmount) || fineAmount <= 0) {
            toast.error('Fine amount must be a positive number.');
            return;
        }

        if (!formData.date) {
            toast.error('Please select a date.');
            return;
        }

        if (!formData.reason || formData.reason.trim().length === 0) {
            toast.error('Please provide a reason for the fine.');
            return;
        }

        if (!selectedWorker) {
            toast.error('Please select a worker.');
            return;
        }

        try {
            const response = await addFine(selectedWorker._id, {
                amount: fineAmount,
                date: formData.date,
                reason: formData.reason.trim()
            });

            toast.success(response.message);
            handleClose();
            if (onFineAdded) {
                onFineAdded();
            }
        } catch (error) {
            toast.error(error.message || 'Failed to add fine');
        }
    };

    const handleClose = () => {
        setFormData({
            amount: '',
            date: new Date().toISOString().slice(0, 10),
            reason: ''
        });
        setSelectedWorker(null);
        setSearchTerm('');
        onClose();
    };

    const selectWorker = (worker) => {
        setSelectedWorker(worker);
        setSearchTerm('');
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Add Fine"
            size="lg"
        >
            {!selectedWorker ? (
                <div>
                    <div className="form-group mb-4">
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search employees..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {isLoading ? (
                            <div className="text-center py-4 text-gray-500">
                                Loading...
                            </div>
                        ) : filteredWorkers.length > 0 ? (
                            filteredWorkers.map(worker => (
                                <div
                                    key={worker._id}
                                    className="p-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer flex items-center"
                                    onClick={() => selectWorker(worker)}
                                >
                                    <div className="flex items-center">
                                        {worker?.photo && (
                                            <img
                                                src={worker.photo
                                                    ? worker.photo
                                                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}`}
                                                alt="Employee"
                                                className="w-8 h-8 rounded-full mr-2"
                                            />
                                        )}
                                        <div>
                                            <div className="font-medium">{worker.name}</div>
                                            <div className="text-sm text-gray-500">
                                                {worker.department?.name || worker.department}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-4 text-gray-500">
                                No employees found
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit}>
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                        <div className="font-medium">{selectedWorker.name}</div>
                        <div className="text-sm text-gray-500">
                            {selectedWorker.department?.name || selectedWorker.department}
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="date" className="form-label">Date</label>
                        <input
                            type="date"
                            id="date"
                            name="date"
                            className="form-input"
                            value={formData.date}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="amount" className="form-label">Fine Amount</label>
                        <input
                            type="text"
                            id="amount"
                            name="amount"
                            className="form-input"
                            value={formData.amount}
                            onChange={handleChange}
                            required
                            pattern="^\d*\.?\d*$"
                            title="Please enter a valid number (e.g., 100 or 50.50)"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="reason" className="form-label">Reason</label>
                        <textarea
                            id="reason"
                            name="reason"
                            className="form-input"
                            value={formData.reason}
                            onChange={handleChange}
                            required
                            rows="3"
                        />
                    </div>

                    <div className="flex justify-end mt-6 space-x-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSelectedWorker(null)}
                        >
                            Back
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                        >
                            Add Fine
                        </Button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default AddFineModal;
