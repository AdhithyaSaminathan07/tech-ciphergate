import React, { useState, useEffect } from 'react';
import { getMyFines } from '../../services/fineService';
import Spinner from '../common/Spinner';
import Card from '../common/Card';
import Button from '../common/Button';
import { toast } from 'react-toastify';

const MyFines = () => {
    const [fines, setFines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    useEffect(() => {
        // Set default filter to current month
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        setFromDate(firstDay);
        setToDate(lastDay);

        fetchFines(firstDay, lastDay);
    }, []);

    const fetchFines = async (start, end) => {
        setIsLoading(true);
        try {
            const data = await getMyFines({ fromDate: start, toDate: end });
            setFines(data.fines || []);
        } catch (error) {
            console.error('Error fetching fines:', error);
            toast.error('Failed to load fines');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFilter = () => {
        fetchFines(fromDate, toDate);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const totalFines = fines.reduce((sum, fine) => sum + (fine.amount || 0), 0);

    return (
        <Card className="mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">My Fines</h2>

            <div className="flex flex-col md:flex-row gap-4 mb-6 items-end">
                <div className="flex-1 w-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="form-input w-full"
                    />
                </div>
                <div className="flex-1 w-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="form-input w-full"
                    />
                </div>
                <div className="w-full md:w-auto">
                    <Button onClick={handleFilter} className="w-full">
                        Filter
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-6">
                    <Spinner size="md" />
                </div>
            ) : (
                <>
                    {fines.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                            <p>No fines recorded for the selected period.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {fines.map((fine, index) => (
                                        <tr key={index} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {formatDate(fine.date)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-900">
                                                {fine.reason}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right font-medium">
                                                ₹{fine.amount?.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-50 font-semibold">
                                        <td colSpan="2" className="px-6 py-4 text-sm text-gray-900 text-right">
                                            Total
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-700 text-right">
                                            ₹{totalFines.toLocaleString()}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </Card>
    );
};

export default MyFines;
