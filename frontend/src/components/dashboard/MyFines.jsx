import React, { useState, useEffect } from 'react';
import { getMyFines } from '../../services/fineService';
import Spinner from '../common/Spinner';
import Card from '../common/Card';
import Button from '../common/Button';
import { toast } from 'react-toastify';

const MyFines = ({ noCard = false }) => {
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

    const content = (
        <>
            {!noCard && <h2 className="text-lg font-bold mb-3 text-gray-800">My Fines</h2>}

            <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">

                <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest ml-1">From Date</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all"
                    />
                </div>
                <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest ml-1">To Date</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all"
                    />
                </div>
                <div className="w-full sm:w-auto">
                    <Button 
                        onClick={handleFilter} 
                        className="w-full h-12 px-8 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-teal-100 transition-all active:scale-95"
                    >
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
                        <div className="text-center py-10 text-slate-400 bg-slate-50/50 rounded-2xl border-2 border-dotted border-slate-200">
                            <p className="text-sm font-medium">No fines recorded for the selected period.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-50/80">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                                        <th className="px-6 py-3 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest">Reason</th>
                                        <th className="px-6 py-3 text-right text-[11px] font-black text-slate-500 uppercase tracking-widest">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-50">
                                    {fines.map((fine, index) => (
                                        <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">
                                                {formatDate(fine.date)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-700">
                                                {fine.reason}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-rose-600 text-right font-bold">
                                                ₹{fine.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-50/30 font-bold">
                                        <td colSpan="2" className="px-6 py-4 text-sm text-slate-900 text-right uppercase tracking-wider">
                                            Total Penalties
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-rose-700 text-right">
                                            ₹{totalFines.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </>
    );

    if (noCard) return content;

    return (
        <Card className="mb-4" padding="p-4">
            {content}
        </Card>
    );
};

export default MyFines;
