import React, { useState, useEffect } from 'react';
import { getMyFines } from '../../services/fineService';
import Spinner from '../common/Spinner';
import Card from '../common/Card';
import Button from '../common/Button';
import { toast } from 'react-toastify';
import { FaCalendarAlt, FaFilter, FaExclamationCircle } from 'react-icons/fa';

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
        <div className="space-y-4">
            {!noCard && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                    <FaExclamationCircle className="text-rose-500" size={16} />
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">My Fines / Penalties</h2>
                </div>
            )}

            {/* Filter Section - Highly clean and aligned */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-slate-50/60 p-3 rounded-xl border border-slate-100">
                <div className="sm:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider ml-0.5 flex items-center gap-1">
                        <FaCalendarAlt size={10} className="text-slate-400" /> From Date
                    </label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
                    />
                </div>
                <div className="sm:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider ml-0.5 flex items-center gap-1">
                        <FaCalendarAlt size={10} className="text-slate-400" /> To Date
                    </label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
                    />
                </div>
                <div className="sm:col-span-2">
                    <Button 
                        onClick={handleFilter} 
                        className="w-full h-10 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                    >
                        <FaFilter size={10} />
                        Filter
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Spinner size="md" />
                </div>
            ) : (
                <>
                    {fines.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                            <p className="text-xs font-medium">No fines recorded for the selected period.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Desktop View Table: hidden on mobile */}
                            <div className="hidden md:block overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50/55">
                                        <tr>
                                            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Reason</th>
                                            <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {fines.map((fine, index) => (
                                            <tr key={index} className="hover:bg-slate-50/30 transition-colors">
                                                <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-600">
                                                    {formatDate(fine.date)}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-700">
                                                    {fine.reason}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-rose-600 text-right font-bold">
                                                    ₹{fine.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile View Card List: hidden on desktop */}
                            <div className="block md:hidden space-y-2">
                                {fines.map((fine, index) => (
                                    <div key={index} className="bg-white rounded-lg p-3 border border-slate-150 shadow-sm flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{formatDate(fine.date)}</span>
                                            <span className="text-xs font-bold text-rose-600">
                                                ₹{fine.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-750 font-medium bg-slate-50/50 p-2 rounded border border-slate-100">
                                            {fine.reason}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Summary / Total Section */}
                            <div className="flex justify-between items-center bg-rose-50/35 border border-rose-100/50 rounded-xl px-4 py-3">
                                <span className="text-[10px] md:text-xs font-bold text-rose-800 uppercase tracking-wider">Total Penalties</span>
                                <span className="text-sm font-extrabold text-rose-700">
                                    ₹{totalFines.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );

    if (noCard) return content;

    return (
        <Card className="mb-4" padding="p-4">
            {content}
        </Card>
    );
};

export default MyFines;

