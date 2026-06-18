import React, { useState, useEffect, useRef, useContext } from 'react';
import { toast } from 'react-toastify';
import { Folder, ShieldAlert, CheckCircle, Info, RefreshCw, X, Trash2, Brain, ChevronDown, LogOut } from 'lucide-react';
import {
  getPersonalBrainFiles,
  deletePersonalBrainFile,
  getPersonalBrainFolderManifest,
  syncPersonalBrainFolderBatch,
  finalizePersonalBrainFolderSync
} from '../../services/aiService';
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

// --- IndexedDB Connection Helpers ---
const DB_NAME = 'CipherGateSecondBrain';
const STORE_NAME = 'FolderHandles';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

const getFolderHandle = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveFolderHandle = async (key, handle) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(handle, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const deleteFolderHandle = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- JWT Decoder for adminId ---
const getAdminIdFromToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return '';
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return '';
    const payload = JSON.parse(atob(parts[1]));
    return payload.id || '';
  } catch (err) {
    console.error('Error decoding token:', err);
    return '';
  }
};

const getFilesRecursively = async (dirHandle, relativePath = '') => {
  let filesList = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const ext = entry.name.split('.').pop().toLowerCase();
      if (['txt', 'md', 'pdf', 'json'].includes(ext)) {
        const file = await entry.getFile();
        if (file.size <= 50 * 1024 * 1024) { // max 50 MB
          filesList.push({
            file,
            relativePath: relativePath ? `${relativePath}/${entry.name}` : entry.name
          });
        }
      }
    } else if (entry.kind === 'directory') {
      const subFiles = await getFilesRecursively(entry, relativePath ? `${relativePath}/${entry.name}` : entry.name);
      filesList.push(...subFiles);
    }
  }
  return filesList;
};

const PersonalBrainManager = ({ onIndexChange }) => {
  const { subdomain } = useContext(appContext);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [folderHandle, setFolderHandle] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected', 'reconnect_required', 'connected'
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncStats, setSyncStats] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const isMountedRef = useRef(true);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchFiles();
    initFolderConnection();
  }, [subdomain]);

  const fetchFiles = async () => {
    if (isMountedRef.current) {
      setLoading(true);
    }
    try {
      const data = await getPersonalBrainFiles(subdomain);
      if (isMountedRef.current) {
        setFiles(data);
      }
    } catch (err) {
      console.error('[PersonalBrain] Failed to fetch files:', err);
      if (isMountedRef.current) {
        toast.error('Failed to load brain files');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const initFolderConnection = async () => {
    try {
      const adminId = getAdminIdFromToken();
      if (!adminId) return;
      const key = `${adminId}:${subdomain}`;
      const handle = await getFolderHandle(key);
      const savedTime = localStorage.getItem(`lastSync:${key}`);
      if (isMountedRef.current && savedTime) {
        setLastSyncTime(savedTime);
      }
      if (handle) {
        if (isMountedRef.current) {
          setFolderHandle(handle);
        }
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          if (isMountedRef.current) {
            setConnectionStatus('connected');
            triggerFolderSync(handle);
          }
        } else {
          if (isMountedRef.current) {
            setConnectionStatus('reconnect_required');
          }
        }
      } else {
        if (isMountedRef.current) {
          setFolderHandle(null);
          setConnectionStatus('disconnected');
        }
      }
    } catch (err) {
      console.error('Failed to init folder connection:', err);
    }
  };

  const handleConnectFolder = async () => {
    try {
      if (!window.showDirectoryPicker) {
        toast.error('Your browser does not support the File System Access API. Please use Chrome or Edge.');
        return;
      }
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      const adminId = getAdminIdFromToken();
      const key = `${adminId}:${subdomain}`;
      await saveFolderHandle(key, handle);
      if (isMountedRef.current) {
        setFolderHandle(handle);
        setConnectionStatus('connected');
        toast.success('Folder connected successfully!');
        triggerFolderSync(handle);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error connecting folder:', err);
        toast.error('Failed to connect folder');
      }
    }
  };

  const handleReconnectFolder = async () => {
    if (!folderHandle) return;
    try {
      const permission = await folderHandle.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        if (isMountedRef.current) {
          setConnectionStatus('connected');
          toast.success('Folder access authorized!');
          triggerFolderSync(folderHandle);
        }
      } else {
        toast.error('Permission denied to access folder');
      }
    } catch (err) {
      console.error('Error authorizing folder:', err);
      toast.error('Failed to authorize folder access');
    }
  };

  const handleDisconnect = async () => {
    try {
      const adminId = getAdminIdFromToken();
      const key = `${adminId}:${subdomain}`;
      await deleteFolderHandle(key);
      if (isMountedRef.current) {
        setFolderHandle(null);
        setConnectionStatus('disconnected');
        setSyncStats(null);
        toast.info('Folder disconnected');
      }
    } catch (err) {
      console.error('Error disconnecting folder:', err);
    }
  };

  const triggerFolderSync = async (activeHandle = folderHandle) => {
    if (!activeHandle || syncing || isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (isMountedRef.current) {
      setSyncing(true);
      setSyncStats(null);
    }

    const stats = {
      new: [],
      changed: [],
      skippedCount: 0,
      deleted: [],
      failed: []
    };

    try {
      const perm = await activeHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        if (isMountedRef.current) {
          setConnectionStatus('reconnect_required');
        }
        throw new Error('Folder permission is not granted. Please reconnect.');
      }

      const manifest = await getPersonalBrainFolderManifest();
      const manifestMap = new Map(manifest.map(item => [item.relativePath, item]));

      let localEntries = [];
      try {
        localEntries = await getFilesRecursively(activeHandle);
      } catch (scanErr) {
        throw new Error(`Failed to read folder contents: ${scanErr.message}`);
      }

      const toUpload = [];
      const localPathsSet = new Set();

      for (const entry of localEntries) {
        localPathsSet.add(entry.relativePath);
        const serverFile = manifestMap.get(entry.relativePath);

        if (!serverFile) {
          toUpload.push(entry);
        } else {
          const localSize = entry.file.size;
          const localLastModified = entry.file.lastModified;

          if (localSize !== serverFile.size || localLastModified !== serverFile.lastModified) {
            toUpload.push(entry);
          } else {
            stats.skippedCount++;
          }
        }
      }

      const deletedPaths = [];
      for (const serverFile of manifest) {
        if (!localPathsSet.has(serverFile.relativePath)) {
          deletedPaths.push(serverFile.relativePath);
        }
      }

      const batchSize = 20;
      const syncId = `sync_${Date.now()}`;

      for (let i = 0; i < toUpload.length; i += batchSize) {
        const batch = toUpload.slice(i, i + batchSize);
        try {
          const res = await syncPersonalBrainFolderBatch(batch, syncId);
          if (res.indexed) {
            res.indexed.forEach(idx => {
              const isNew = !manifestMap.has(idx.relativePath);
              if (isNew) {
                stats.new.push(idx.relativePath);
              } else {
                stats.changed.push(idx.relativePath);
              }
            });
          }
          if (res.errors) {
            res.errors.forEach(err => {
              stats.failed.push({ path: err.relativePath, error: err.error });
            });
          }
        } catch (batchErr) {
          batch.forEach(entry => {
            stats.failed.push({ path: entry.relativePath, error: batchErr.message || 'Batch upload failed' });
          });
        }
      }

      const finalizeRes = await finalizePersonalBrainFolderSync(Array.from(localPathsSet));
      if (finalizeRes && finalizeRes.deleted) {
        stats.deleted = deletedPaths;
      }

      const syncTimeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const adminId = getAdminIdFromToken();
      localStorage.setItem(`lastSync:${adminId}:${subdomain}`, syncTimeStr);

      if (isMountedRef.current) {
        setLastSyncTime(syncTimeStr);
        setSyncStats(stats);
        toast.success('Second Brain sync completed!');
        fetchFiles();
        if (typeof onIndexChange === 'function') {
          onIndexChange();
        }
      }
    } catch (err) {
      console.error('Folder sync failed:', err);
      if (isMountedRef.current) {
        toast.error(`Sync failed: ${err.message}`);
        setSyncStats({
          new: [],
          changed: [],
          skippedCount: 0,
          deleted: [],
          failed: [{ path: 'Folder Access', error: err.message }]
        });
      }
    } finally {
      if (isMountedRef.current) {
        setSyncing(false);
      }
      isSyncingRef.current = false;
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
          {/* Connection Controls Banner */}
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              {connectionStatus === 'connected' ? (
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              ) : connectionStatus === 'reconnect_required' ? (
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <Folder className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {connectionStatus === 'connected'
                    ? 'Connected Folder'
                    : connectionStatus === 'reconnect_required'
                    ? 'Folder Action Required'
                    : 'No Connected Folder'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {connectionStatus === 'connected'
                    ? `Active sync enabled. Last synced: ${lastSyncTime || 'Never'}`
                    : connectionStatus === 'reconnect_required'
                    ? 'Access suspended. Click Reconnect Folder to restore access.'
                    : 'Connect a local directory to auto-sync files into your Second Brain.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {connectionStatus === 'disconnected' && (
                <button
                  onClick={handleConnectFolder}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                >
                  <Folder className="w-4 h-4" /> Connect Folder
                </button>
              )}

              {connectionStatus === 'reconnect_required' && (
                <>
                  <button
                    onClick={handleReconnectFolder}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> Reconnect Folder
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Disconnect Folder"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}

              {connectionStatus === 'connected' && (
                <>
                  <button
                    onClick={() => triggerFolderSync()}
                    disabled={syncing}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Disconnect Folder"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Sync Stats collapsible widget */}
          {syncStats && (
            <div className="mx-4 mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  Sync Statistics
                </span>
                <button
                  onClick={() => setSyncStats(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-3">
                <div className="bg-white border border-slate-100 rounded-xl p-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">New</p>
                  <p className="text-sm font-black text-emerald-600 mt-0.5">{syncStats.new.length}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Changed</p>
                  <p className="text-sm font-black text-blue-600 mt-0.5">{syncStats.changed.length}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Deleted</p>
                  <p className="text-sm font-black text-red-500 mt-0.5">{syncStats.deleted.length}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Skipped</p>
                  <p className="text-sm font-black text-slate-500 mt-0.5">{syncStats.skippedCount}</p>
                </div>
              </div>

              {syncStats.failed.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-2 space-y-1">
                  <p className="text-[10px] font-black text-red-700 uppercase flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" /> FAILED OPERATIONS ({syncStats.failed.length})
                  </p>
                  <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] text-red-600 font-medium">
                    {syncStats.failed.map((f, i) => (
                      <div key={i} className="truncate">
                        • {f.path}: {f.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Files List */}
          <div className="px-4 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="w-5 h-5 text-violet-400 animate-spin" />
                <span className="ml-2 text-sm text-slate-500">Loading brain files...</span>
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No files indexed yet</p>
                <p className="text-[11px] mt-0.5">Connected folder files will show here after sync.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
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
                      <span className="text-base shrink-0">{typeConf.icon}</span>

                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-slate-700 truncate" title={file.sourceRelativePath || file.originalFilename}>
                          {file.sourceRelativePath || file.originalFilename}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeConf.color}`}>
                            {typeConf.label}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatBytes(file.fileSize)}</span>
                          <span className="text-[10px] text-slate-400">{formatDate(file.updatedAt)}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setDeleteConfirm({ id: file._id, name: file.sourceRelativePath || file.originalFilename })}
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
