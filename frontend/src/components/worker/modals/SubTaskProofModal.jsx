import React, { useState, useRef } from 'react';
import { X, Upload, File, Trash2, CheckCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { uploadSubTaskProof } from '../../../services/ticketService';
import { toast } from 'react-toastify';

const SubTaskProofModal = ({ isOpen, onClose, ticketId, subTaskId, subTaskText, onUploadSuccess, existingFiles = [], completionId }) => {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleDeleteExistingFile = async (fileId) => {
        if (!completionId) return;
        
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/tickets/completions/${completionId}/proof/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('File deleted successfully');
                onUploadSuccess(data);
            } else {
                toast.error('Failed to delete file: ' + data.message);
            }
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Error deleting file');
        }
    };

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        setFiles(prev => [...prev, ...selectedFiles]);
        setError(null);
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const droppedFiles = Array.from(e.dataTransfer.files);
        setFiles(prev => [...prev, ...droppedFiles]);
        setError(null);
    };

    const handleSubmit = async () => {
        if (files.length === 0) {
            setError('Please upload at least one proof file.');
            return;
        }

        setUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('ticketId', ticketId);
            formData.append('subTaskId', subTaskId);
            files.forEach(file => {
                formData.append('proofs', file);
            });

            const result = await uploadSubTaskProof(formData);
            
            if (result.success) {
                setSuccess(true);
                toast.success(result.message || 'Proof uploaded successfully');
                
                // Visual feedback before closing
                setTimeout(() => {
                    onUploadSuccess(result.completion);
                    onClose();
                }, 1500);
            } else {
                throw new Error(result.message || 'Upload failed');
            }
        } catch (err) {
            setError(err.message || 'Failed to upload proof. Please try again.');
            toast.error(err.message || 'Failed to upload proof');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[700] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Upload Proof</h3>
                        <p className="text-xs text-gray-500 font-medium mt-0.5 truncate max-w-[200px]">
                            Task: {subTaskText}
                        </p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 rounded-lg text-gray-400 transition-colors"
                        disabled={uploading || success}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 relative min-h-[300px] flex flex-col">
                    {success ? (
                        <div className="flex-1 flex flex-col items-center justify-center animate-in zoom-in duration-300">
                            <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 mb-4">
                                <CheckCircle2 className="w-12 h-12" />
                            </div>
                            <h4 className="text-xl font-bold text-gray-800">Perfect!</h4>
                            <p className="text-gray-500 text-center mt-2 font-medium">Proof uploaded successfully.<br/>Closing window...</p>
                        </div>
                    ) : (
                        <>
                            {/* Error Message */}
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2 animate-in slide-in-from-top-2">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span className="font-medium">{error}</span>
                                </div>
                            )}

                            {/* Upload Area */}
                            <div 
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onClick={() => !uploading && fileInputRef.current.click()}
                                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group 
                                    ${uploading ? 'bg-gray-50 border-gray-100 cursor-not-allowed' : 'border-gray-200 hover:border-teal-400 hover:bg-teal-50/30'}`}
                            >
                                <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center text-teal-600 group-hover:scale-110 transition-transform">
                                    <Upload className="w-6 h-6" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold text-gray-700">Click to upload or drag & drop</p>
                                    <p className="text-xs text-gray-400 mt-1">Images, PDF, DOC, DOCX, ZIP (Max 50MB)</p>
                                </div>
                                <input 
                                    type="file" 
                                    multiple 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    className="hidden" 
                                    disabled={uploading}
                                />
                            </div>

                            {/* Files List */}
                            {(existingFiles.length > 0 || files.length > 0) && (
                                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar flex-1">
                                    {/* Existing Files */}
                                    {existingFiles.length > 0 && (
                                        <>
                                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Uploaded Files ({existingFiles.length})</h4>
                                            {existingFiles.map((file, index) => (
                                                <div key={file._id || index} className="flex justify-between items-center p-3 bg-teal-50/50 border border-teal-100 rounded-xl group hover:border-teal-200 transition-colors">
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="p-1 bg-white rounded-lg border border-gray-100 text-gray-400 group-hover:text-teal-500 transition-colors w-12 h-12 flex items-center justify-center overflow-hidden shrink-0">
                                                            {file.url?.match(/\.(jpeg|jpg|gif|png|webp)$/i) || file.url?.includes('blob:') ? (
                                                                <img src={file.url.startsWith('http') ? file.url : `/${file.url}`} alt={file.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <File className="w-5 h-5" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-gray-700 truncate">{file.name}</p>
                                                            <p className="text-[10px] text-teal-600 font-bold uppercase">Uploaded</p>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteExistingFile(file._id); }}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                        disabled={uploading}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {/* New Files */}
                                    {files.length > 0 && (
                                        <>
                                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-4 mb-2">New Files ({files.length})</h4>
                                            {files.map((file, index) => (
                                                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-100 rounded-xl group hover:border-teal-200 transition-colors">
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="p-1 bg-white rounded-lg border border-gray-100 text-gray-400 group-hover:text-teal-500 transition-colors w-12 h-12 flex items-center justify-center overflow-hidden shrink-0">
                                                            {file.type?.startsWith('image/') ? (
                                                                <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <File className="w-5 h-5" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-gray-700 truncate">{file.name}</p>
                                                            <p className="text-[10px] text-gray-400 font-medium">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                        disabled={uploading}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className={`px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3 transition-opacity duration-300 ${success ? 'opacity-0 h-0 p-0 overflow-hidden border-0' : 'opacity-100'}`}>
                    <button 
                        onClick={onClose}
                        disabled={uploading}
                        className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors uppercase tracking-wider shadow-sm disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={uploading || files.length === 0}
                        className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-xl transition-all uppercase tracking-wider shadow-md flex items-center justify-center gap-2
                            ${uploading || files.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-95'}`}
                    >
                        {uploading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Uploading...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                Submit Proof
                            </>
                        )}
                    </button>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 10px;
                }
            `}</style>
        </div>
    );
};

export default SubTaskProofModal;
