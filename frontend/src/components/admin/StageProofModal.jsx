import React, { useState } from 'react';
import uploadUtils from '../../utils/uploadUtils';

const StageProofModal = ({ isOpen, onClose, onConfirm, invoiceNo, stage }) => {
  const [file, setFile] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !date) {
      alert('Please select a file and date');
      return;
    }

    try {
      setLoading(true);
      const proofUrl = await uploadUtils(file);
      if (proofUrl) {
        onConfirm({ date, proof: proofUrl });
      } else {
        alert('Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload proof');
    } finally {
      setLoading(false);
    }
  };

  const getStageConfig = () => {
    switch (stage) {
      case 'Payment Received':
        return { title: 'Payment Details', label: 'Received Date', color: 'blue' };
      case 'Work completion':
        return { title: 'Work Completion', label: 'Completion Date', color: 'green' };
      case 'Closure agreement':
        return { title: 'Closure Agreement', label: 'Agreement Date', color: 'purple' };
      default:
        return { title: 'Stage Details', label: 'Date', color: 'gray' };
    }
  };

  const config = getStageConfig();
  const colorClass = config.color === 'blue' ? 'blue' : config.color === 'green' ? 'green' : 'purple';

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-6">
          <div className={`bg-${colorClass}-100 p-2 rounded-lg`}>
            <svg className={`w-6 h-6 text-${colorClass}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900">{config.title} - {invoiceNo}</h3>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">{config.label}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">Upload Proof</label>
            <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-4 hover:border-blue-500 transition-colors group">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files[0])}
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                required
              />
              <div className="text-center">
                <svg className="mx-auto h-10 w-10 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="mt-2 text-sm text-gray-600">
                  {file ? file.name : "Click to select or drag and drop"}
                </p>
                <p className="mt-1 text-xs text-gray-400">PNG, JPG, GIF up to 10MB</p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-3 bg-${colorClass}-600 text-white rounded-xl font-bold hover:bg-${colorClass}-700 transition-colors shadow-lg shadow-${colorClass}-100 disabled:bg-gray-400 disabled:shadow-none`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading...
                </span>
              ) : 'Confirm Stage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StageProofModal;
