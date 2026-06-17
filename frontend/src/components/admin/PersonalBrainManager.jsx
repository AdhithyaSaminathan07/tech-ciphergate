import React, { useState, useEffect, useRef, useContext } from 'react';
import { toast } from 'react-toastify';
import { Upload, Trash2, FileText, File, Brain, RefreshCw, X, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { uploadPersonalBrainFiles, getPersonalBrainFiles, deletePersonalBrainFile } from '../../services/aiService';
import appContext from '../../context/AppContext';

// File type display config
const FILE_TYPE_CONFIG = {
  pdf:  { icon: '📕', label: 'PDF',      color: 'text-red-600 bg-red-50 border-red-200' },
  txt:  { icon: '📄', label: 'TXT',      color: 'text-slate-600 bg-slate-50 border-slate-200' },
  md:   { icon: '📝', label: 'Markdown', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  json: { icon: '🔧', label: 'JSON',     color: 'text-teal-600 bg-teal-50 border-teal-200' },
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const PersonalBrainManager = ({ onIndexChange }) => {
  const { subdomain } = useContext(appContext);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchFiles();
  }, [subdomain]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const data = await getPersonalBrainFiles(subdomain);
      setFiles(data);
    } catch (err) {
      console.error('[PersonalBrain] Failed to fetch files:', err);
      toast.error('Failed to load brain files');
    } finally {
      setLoading(false);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) processUpload(droppedFiles);
  };

  const handleFileSelect = (e) => {
    const selectedFiles = e.target.files;
    if (selectedFiles.length > 0) processUpload(selectedFiles);
    e.target.value = ''; // reset input
  };

  const processUpload = async (fileList) => {
    // Validate extensions client-side first
    const validExts = ['txt', 'md', 'pdf', 'json'];
    const invalid = Array.from(fileList).filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return !validExts.includes(ext);
    });

    if (invalid.length > 0) {
      toast.error(`Unsupported file(s): ${invalid.map(f => f.name).join(', ')}. Only .txt, .md, .pdf, .json allowed.`);
      return;
    }

    setUploading(true);
    setUploadResults(null);
    try {
      const result = await uploadPersonalBrainFiles(fileList, subdomain);
      setUploadResults(result);
      toast.success(`${result.indexed.length} file(s) indexed into Second Brain!`);
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} file(s) had errors.`);
      }
      fetchFiles();
      if (typeof onIndexChange === 'function') {
        onIndexChange();
      }
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId, filename) => {
    try {
      await deletePersonalBrainFile(fileId);
      toast.success(`"${filename}" removed from Second Brain`);
      setFiles(prev => prev.filter(f => f._id !== fileId));
      setDeleteConfirm(null);
      if (typeof onIndexChange === 'function') {
        onIndexChange();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to delete file');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Personal Second Brain</h3>
            <p className="text-[11px] text-slate-500">
              {loading ? 'Loading...' : `${files.length} file${files.length !== 1 ? 's' : ''} indexed • AI uses these as context`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {files.length > 0 && (
            <span className="bg-violet-100 text-violet-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-violet-200">
              {files.length} FILES
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-100">
          {/* Info Banner */}
          <div className="mx-4 mt-4 p-3 bg-violet-50 border border-violet-100 rounded-xl flex items-start gap-2.5">
            <Brain className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-violet-700 leading-relaxed">
              Upload files from your desktop Second Brain folder. Supported: <strong>.txt, .md, .pdf, .json</strong> (max 20MB each).
              Duplicate filenames are automatically replaced. The AI will use these as context when analyzing tasks.
            </p>
          </div>

          {/* Upload Zone */}
          <div className="p-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${isDragOver ? 'border-violet-400 bg-violet-50 scale-[1.01]' : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/30' } ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.pdf,.json"
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="w-7 h-7 text-violet-500 animate-spin" />
                  <p className="text-sm font-semibold text-violet-700">Indexing files into Second Brain...</p>
                  <p className="text-[11px] text-slate-500">This may take a moment for PDF files</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center mb-1">
                    <Upload className="w-5 h-5 text-violet-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">
                    {isDragOver ? 'Drop files here!' : 'Drop files or click to select'}
                  </p>
                  <p className="text-[11px] text-slate-400">.txt · .md · .pdf · .json · up to 20MB each · up to 20 files</p>
                </div>
              )}
            </div>
          </div>

          {/* Upload Results */}
          {uploadResults && (
            <div className="mx-4 mb-3 space-y-1.5">
              {uploadResults.indexed.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-100 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="text-[11px] text-teal-700 font-semibold flex-1 truncate">{f.originalFilename}</span>
                  <span className="text-[10px] text-teal-500">{formatBytes(f.fileSize)}</span>
                </div>
              ))}
              {uploadResults.errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-[11px] text-red-700 font-medium">{e.filename}: {e.error}</span>
                </div>
              ))}
              <button
                onClick={() => setUploadResults(null)}
                className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 mx-1"
              >
                <X className="w-3 h-3" /> Dismiss
              </button>
            </div>
          )}

          {/* Files List */}
          <div className="px-4 pb-4">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="w-5 h-5 text-violet-400 animate-spin" />
                <span className="ml-2 text-sm text-slate-500">Loading brain files...</span>
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No files indexed yet</p>
                <p className="text-[11px] mt-0.5">Upload files from your Second Brain folder above</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider">
                    Indexed Files ({files.length})
                  </span>
                  <button
                    onClick={fetchFiles}
                    className="text-[10px] text-slate-400 hover:text-violet-600 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>

                {files.map((file) => {
                  const typeConf = FILE_TYPE_CONFIG[file.fileType] || FILE_TYPE_CONFIG.txt;
                  return (
                    <div
                      key={file._id}
                      className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/60 rounded-xl transition-all group"
                    >
                      {/* File type badge */}
                      <span className={`text-base shrink-0`}>{typeConf.icon}</span>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-slate-700 truncate" title={file.originalFilename}>
                          {file.originalFilename}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeConf.color}`}>
                            {typeConf.label}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatBytes(file.fileSize)}</span>
                          <span className="text-[10px] text-slate-400">{formatDate(file.updatedAt)}</span>
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={() => setDeleteConfirm({ id: file._id, name: file.originalFilename })}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Remove from Second Brain"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-[700] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">Remove from Second Brain?</h4>
                <p className="text-[11px] text-slate-500">This cannot be undone</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-4">
              <p className="text-[12px] font-bold text-slate-700 truncate">{deleteConfirm.name}</p>
              <p className="text-[11px] text-slate-500">Will be removed from the AI context index</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id, deleteConfirm.name)}
                className="flex-1 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalBrainManager;
