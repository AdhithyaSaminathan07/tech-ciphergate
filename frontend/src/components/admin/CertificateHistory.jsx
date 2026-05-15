import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import appContext from '../../context/AppContext';

const CertificateHistory = ({ type, onEdit, onView, onDelete, onDownload, refreshTrigger }) => {
    const [certificates, setCertificates] = useState([]);
    const [loading, setLoading] = useState(true);

    // Use the deployed backend URL or localhost if not available
    const { subdomain } = useContext(appContext);
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

    const fetchCertificates = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/certificates/${type}?subdomain=${subdomain}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCertificates(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching certificates:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCertificates();
    }, [type, refreshTrigger]);

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this certificate? This action cannot be undone.')) {
            try {
                const token = localStorage.getItem('token');
                await axios.delete(`${API_URL}/certificates/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                fetchCertificates(); // Refresh list after delete
                onDelete(id); // Callback for parent to clean up if needed
            } catch (error) {
                console.error('Error deleting certificate:', error);
                alert('Failed to delete certificate');
            }
        }
    };

    if (loading) {
        return <div className="p-4 text-center text-gray-500">Loading history...</div>;
    }

    return (
        <div className="mt-8 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">Certificate History</h3>

            {certificates.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No certificates found.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Name
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Created Date
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {certificates.map((cert) => (
                                <tr key={cert._id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {cert.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(cert.createdAt).toLocaleDateString()} {new Date(cert.createdAt).toLocaleTimeString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                                        <button
                                            onClick={() => onView(cert)}
                                            className="text-blue-600 hover:text-blue-900"
                                        >
                                            View
                                        </button>
                                        <button
                                            onClick={() => onEdit(cert)}
                                            className="text-indigo-600 hover:text-indigo-900"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => onDownload(cert)}
                                            className="text-green-600 hover:text-green-900"
                                        >
                                            Download PDF
                                        </button>
                                        <button
                                            onClick={() => handleDelete(cert._id)}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default CertificateHistory;
