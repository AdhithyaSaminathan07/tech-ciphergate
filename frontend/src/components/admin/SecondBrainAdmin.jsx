import React, { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { FaPlus, FaTrash, FaEdit, FaSearch, FaBook, FaBrain, FaSync, FaTags, FaStickyNote, FaHistory } from 'react-icons/fa';
import { getDocuments, createDocument, updateDocument, deleteDocument } from '../../services/documentService';
import { getBrainStats, reindexData, searchSecondBrain, getAiAuditLogs } from '../../services/aiService';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';

const SecondBrainAdmin = () => {
  const { subdomain } = useContext(appContext);
  const [activeMainTab, setActiveMainTab] = useState('wikis');

  // Documents/Wikis State
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Wiki Form State
  const [wikiForm, setWikiForm] = useState({
    title: '',
    content: '',
    category: 'Setup',
    tags: ''
  });

  // Second Brain Stats & Search Testing State
  const [stats, setStats] = useState({
    totalItems: 0,
    byType: { project: 0, worker: 0, wiki: 0, ticket: 0 }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [testSearchQuery, setTestSearchQuery] = useState('');
  const [testSearchResults, setTestSearchResults] = useState([]);
  const [isSearchingTest, setIsSearchingTest] = useState(false);

  // AI Audit History logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    if (subdomain && subdomain !== 'main') {
      loadDocuments();
      loadStats();
      loadAuditLogs();
    }
  }, [subdomain]);

  const loadAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await getAiAuditLogs();
      setAuditLogs(data || []);
    } catch (error) {
      console.error('Failed to load AI audit logs:', error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const loadDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const data = await getDocuments({ subdomain });
      setDocuments(data);
    } catch (error) {
      console.error('Failed to load wiki documents:', error);
      toast.error('Failed to load wiki documents');
    } finally {
      setIsLoadingDocs(false);
    }
  };


  const loadStats = async () => {
    try {
      const data = await getBrainStats({ subdomain });
      if (data) {
        setStats(data);
      }
    } catch (error) {
      console.log('Second Brain stats endpoint not loaded yet or failed');
    }
  };

  const handleAddWiki = async (e) => {
    e.preventDefault();
    if (!wikiForm.title.trim() || !wikiForm.content.trim()) {
      toast.error('Title and Content are required');
      return;
    }

    try {
      const payload = {
        title: wikiForm.title.trim(),
        content: wikiForm.content.trim(),
        category: wikiForm.category,
        tags: wikiForm.tags.split(',').map(t => t.trim()).filter(Boolean),
        subdomain
      };

      const newDoc = await createDocument(payload);
      setDocuments(prev => [newDoc, ...prev]);
      setIsAddModalOpen(false);
      setWikiForm({ title: '', content: '', category: 'Setup', tags: '' });
      toast.success('Wiki document added and indexed!');
      loadStats();
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to add wiki document');
    }
  };

  const handleEditWiki = async (e) => {
    e.preventDefault();
    if (!selectedDoc) return;
    if (!selectedDoc.title.trim() || !selectedDoc.content.trim()) {
      toast.error('Title and Content are required');
      return;
    }

    try {
      const payload = {
        title: selectedDoc.title.trim(),
        content: selectedDoc.content.trim(),
        category: selectedDoc.category,
        tags: typeof selectedDoc.tags === 'string' 
          ? selectedDoc.tags.split(',').map(t => t.trim()).filter(Boolean)
          : selectedDoc.tags
      };

      const updated = await updateDocument(selectedDoc._id, payload);
      setDocuments(prev => prev.map(d => d._id === updated._id ? updated : d));
      setIsEditModalOpen(false);
      setSelectedDoc(null);
      toast.success('Wiki document updated and re-indexed!');
      loadStats();
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to update wiki document');
    }
  };

  const handleDeleteWiki = async () => {
    if (!selectedDoc) return;
    try {
      await deleteDocument(selectedDoc._id, { subdomain });
      setDocuments(prev => prev.filter(d => d._id !== selectedDoc._id));
      setIsDeleteModalOpen(false);
      setSelectedDoc(null);
      toast.success('Wiki document deleted and removed from index');
      loadStats();
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to delete wiki document');
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const data = await reindexData({ subdomain });
      toast.success(data?.message || 'Second brain reindexing completed successfully!');
      loadStats();
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Reindexing failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTestSearch = async (e) => {
    e.preventDefault();
    if (!testSearchQuery.trim()) return;

    setIsSearchingTest(true);
    try {
      const results = await searchSecondBrain(testSearchQuery, { subdomain });
      setTestSearchResults(results);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Search failed.');
    } finally {
      setIsSearchingTest(false);
    }
  };

  const filteredDocs = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center space-x-2">
          <FaBrain className="text-indigo-600 w-6 h-6" />
          <span>Engineering Second Brain AI Dashboard</span>
        </h1>
        <div className="flex space-x-2">
          <Button 
            variant={activeMainTab === 'wikis' ? 'primary' : 'outline'}
            onClick={() => setActiveMainTab('wikis')}
          >
            <FaBook className="mr-2 inline" /> Wikis & Docs
          </Button>
          <Button 
            variant={activeMainTab === 'index' ? 'primary' : 'outline'}
            onClick={() => setActiveMainTab('index')}
          >
            <FaBrain className="mr-2 inline" /> Brain Index Stats
          </Button>
          <Button 
            variant={activeMainTab === 'audit' ? 'primary' : 'outline'}
            onClick={() => {
              setActiveMainTab('audit');
              loadAuditLogs();
            }}
          >
            <FaHistory className="mr-2 inline" /> AI Audit History
          </Button>
        </div>
      </div>

      {activeMainTab === 'wikis' && (
        <Card>
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search wikis by title, content, or category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <Button 
              variant="primary" 
              onClick={() => setIsAddModalOpen(true)}
            >
              <FaPlus className="mr-2 inline" /> Add Wiki Article
            </Button>
          </div>

          {isLoadingDocs ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No wiki documents found. Add a document or guide to initialize the second brain.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredDocs.map(doc => (
                <div 
                  key={doc._id} 
                  className="bg-white border border-gray-150 rounded-xl p-5 flex flex-col justify-between hover:shadow-md transition-shadow duration-200"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-gray-900 truncate pr-2">{doc.title}</h3>
                      <span className="inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700">
                        {doc.category || 'General'}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 line-clamp-4 whitespace-pre-wrap mb-4">
                      {doc.content}
                    </p>

                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {doc.tags.map((tag, i) => (
                          <span key={i} className="inline-flex items-center text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            <FaTags className="w-2.5 h-2.5 mr-1" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center border-t pt-3 mt-auto">
                    <span className="text-xs text-gray-400">
                      Created by {doc.createdBy?.name || 'Admin'}
                    </span>
                    <div className="flex space-x-2">
                      <button
                        className="text-blue-500 hover:text-blue-700 p-1.5 hover:bg-blue-50 rounded"
                        title="Edit Wiki"
                        onClick={() => {
                          setSelectedDoc({
                            ...doc,
                            tags: Array.isArray(doc.tags) ? doc.tags.join(', ') : ''
                          });
                          setIsEditModalOpen(true);
                        }}
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded"
                        title="Delete Wiki"
                        onClick={() => {
                          setSelectedDoc(doc);
                          setIsDeleteModalOpen(true);
                        }}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeMainTab === 'index' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Index Stats */}
          <Card className="lg:col-span-1">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center space-x-2">
              <FaBrain className="text-indigo-600" />
              <span>Indexed Items</span>
            </h2>
            <div className="space-y-4">
              <div className="bg-indigo-50 p-4 rounded-xl text-center">
                <div className="text-3xl font-extrabold text-indigo-700">{stats.totalItems || 0}</div>
                <div className="text-sm font-medium text-indigo-600">Total Second Brain Nodes</div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 hover:bg-gray-50 rounded border-b">
                  <span className="text-gray-600 font-semibold">Projects & Products</span>
                  <span className="font-bold text-gray-800">{stats.byType?.project || 0}</span>
                </div>
                <div className="flex justify-between p-2 hover:bg-gray-50 rounded border-b">
                  <span className="text-gray-600 font-semibold">Developer Profiles</span>
                  <span className="font-bold text-gray-800">{stats.byType?.worker || 0}</span>
                </div>
                <div className="flex justify-between p-2 hover:bg-gray-50 rounded border-b">
                  <span className="text-gray-600 font-semibold">Wiki/Docs</span>
                  <span className="font-bold text-gray-800">{stats.byType?.wiki || 0}</span>
                </div>
                <div className="flex justify-between p-2 hover:bg-gray-50 rounded border-b">
                  <span className="text-gray-600 font-semibold">Completed Tickets</span>
                  <span className="font-bold text-gray-800">{stats.byType?.ticket || 0}</span>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={handleSyncAll}
                className="w-full flex justify-center"
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <Spinner size="sm" className="mr-2" /> Syncing...
                  </>
                ) : (
                  <>
                    <FaSync className="mr-2" /> Reindex All Data
                  </>
                )}
              </Button>
              <p className="text-xs text-gray-400 text-center">
                Synchronizes and indexes all active projects, developer profiles, wikis, and completed tickets into MongoDB.
              </p>
            </div>
          </Card>

          {/* Search Testing Box */}
          <Card className="lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center space-x-2">
              <FaSearch className="text-indigo-600" />
              <span>Query Testing Sandbox</span>
            </h2>
            <form onSubmit={handleTestSearch} className="flex gap-2 mb-6">
              <input
                type="text"
                value={testSearchQuery}
                onChange={e => setTestSearchQuery(e.target.value)}
                placeholder="Ask Second Brain... e.g. Who works on InstaxBot?"
                className="flex-1 p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <Button type="submit" variant="primary" disabled={isSearchingTest}>
                {isSearchingTest ? <Spinner size="sm" /> : 'Search'}
              </Button>
            </form>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Results ({testSearchResults.length})</h3>
              {testSearchResults.length === 0 ? (
                <div className="border border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
                  Run a search query to inspect retrieval logs
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {testSearchResults.map((result, idx) => (
                    <div key={idx} className="border border-gray-150 rounded-lg p-3 bg-gray-50 hover:bg-white transition-colors duration-150">
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="font-bold text-sm text-gray-900">{result.title}</span>
                        <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
                          result.type === 'wiki' ? 'bg-indigo-100 text-indigo-700' :
                          result.type === 'worker' ? 'bg-green-100 text-green-700' :
                          result.type === 'project' ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {result.type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2 whitespace-pre-wrap">{result.content}</p>
                      {result.score && (
                        <div className="mt-2 text-2xs font-medium text-indigo-600">
                          Relevance Score: {result.score}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {activeMainTab === 'audit' && (
        <Card>
          <div className="flex justify-between items-center mb-6 border-b pb-4 border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 flex items-center space-x-2">
              <FaHistory className="text-indigo-600 animate-spin-slow" />
              <span>AI Task Recommendation Audit Log</span>
            </h2>
            <Button variant="outline" onClick={loadAuditLogs} disabled={isLoadingLogs}>
              {isLoadingLogs ? <Spinner size="sm" className="mr-2" /> : <FaSync className="mr-2" />} Refresh Logs
            </Button>
          </div>

          {isLoadingLogs ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No audit logs recorded yet. AI recommendation decisions will be logged when manager approvals (Apply, Merge, or Assign) are made.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50/70">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Task</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">AI Recommendation</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Match Scores &amp; Reasons</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Action Taken</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Approved By</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100 text-sm">
                  {auditLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-gray-50/55 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">
                        {new Date(log.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900 leading-snug">{log.taskTitle}</div>
                        <div className="text-2xs text-gray-400 mt-0.5">Task ID: {log.taskId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="text-xs">
                            <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Priority:</span>{' '}
                            <span className={`font-extrabold uppercase ${log.recommendedPriority === 'High' ? 'text-red-500' : log.recommendedPriority === 'Medium' ? 'text-orange-500' : 'text-blue-500'}`}>
                              {log.recommendedPriority}
                            </span>
                          </div>
                          <div className="text-xs">
                            <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Complexity:</span>{' '}
                            <span className="font-bold text-gray-800">{log.recommendedComplexity}</span>
                          </div>
                          <div className="text-xs">
                            <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Est. Time:</span>{' '}
                            <span className="font-extrabold text-gray-700">{log.estimatedHours} hrs</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <div className="space-y-3">
                          {log.recommendedDevelopers && log.recommendedDevelopers.map((rec, i) => (
                            <div key={i} className="text-xs bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                              <div className="flex items-center justify-between font-bold text-gray-800 mb-1">
                                <span>{rec.developerName}</span>
                                <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-full">{rec.matchScore}% Match</span>
                              </div>
                              {rec.reasons && rec.reasons.length > 0 && (
                                <div className="space-y-0.5 pl-1 mt-1 border-l-2 border-indigo-200">
                                  {rec.reasons.map((r, ri) => (
                                    <div key={ri} className="text-[9px] text-gray-500 font-medium leading-normal flex items-start gap-1">
                                      <span className="text-emerald-500 font-bold shrink-0">✓</span>
                                      <span>{r.startsWith('✓') ? r.slice(1).trim() : r}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                          log.actionTaken === 'Applied Specs' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                          log.actionTaken === 'Merged Subtasks' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                          log.actionTaken === 'Assigned Developer' ? 'bg-green-50 text-green-700 border border-green-100' :
                          'bg-gray-50 text-gray-700 border border-gray-100'
                        }`}>
                          {log.actionTaken}
                        </span>
                        <div className="text-[11px] text-gray-600 font-medium mt-1.5 whitespace-pre-wrap leading-relaxed">
                          {log.actionDetail}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-gray-800">{log.performedBy?.name || 'Manager'}</div>
                        <div className="text-2xs text-gray-400">@{log.performedBy?.username || 'manager'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Add Wiki Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Wiki Article">
        <form onSubmit={handleAddWiki} className="space-y-4">
          <div>
            <label className="form-label text-sm font-semibold mb-1 block">Title</label>
            <input
              type="text"
              value={wikiForm.title}
              onChange={e => setWikiForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Setting up Docker Environment"
              className="w-full p-2 border border-gray-200 rounded"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label text-sm font-semibold mb-1 block">Category</label>
              <select
                value={wikiForm.category}
                onChange={e => setWikiForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full p-2 border border-gray-200 rounded"
              >
                <option value="Setup">Setup</option>
                <option value="Architecture">Architecture</option>
                <option value="Deployment">Deployment</option>
                <option value="Guidelines">Guidelines</option>
                <option value="FAQ">FAQ</option>
                <option value="General">General</option>
              </select>
            </div>
            <div>
              <label className="form-label text-sm font-semibold mb-1 block">Tags (Comma-separated)</label>
              <input
                type="text"
                value={wikiForm.tags}
                onChange={e => setWikiForm(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="e.g. backend, docker, config"
                className="w-full p-2 border border-gray-200 rounded"
              />
            </div>
          </div>

          <div>
            <label className="form-label text-sm font-semibold mb-1 block">Content</label>
            <textarea
              value={wikiForm.content}
              onChange={e => setWikiForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Write detailed documentation contents here..."
              rows="6"
              className="w-full p-2 border border-gray-200 rounded font-mono text-sm"
              required
            />
          </div>

          <div className="flex justify-end space-x-2 border-t pt-4">
            <Button variant="outline" type="button" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Add Wiki Document
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Wiki Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setSelectedDoc(null); }} title="Edit Wiki Article">
        {selectedDoc && (
          <form onSubmit={handleEditWiki} className="space-y-4">
            <div>
              <label className="form-label text-sm font-semibold mb-1 block">Title</label>
              <input
                type="text"
                value={selectedDoc.title}
                onChange={e => setSelectedDoc(prev => ({ ...prev, title: e.target.value }))}
                className="w-full p-2 border border-gray-200 rounded"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label text-sm font-semibold mb-1 block">Category</label>
                <select
                  value={selectedDoc.category}
                  onChange={e => setSelectedDoc(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full p-2 border border-gray-200 rounded"
                >
                  <option value="Setup">Setup</option>
                  <option value="Architecture">Architecture</option>
                  <option value="Deployment">Deployment</option>
                  <option value="Guidelines">Guidelines</option>
                  <option value="FAQ">FAQ</option>
                  <option value="General">General</option>
                </select>
              </div>
              <div>
                <label className="form-label text-sm font-semibold mb-1 block">Tags (Comma-separated)</label>
                <input
                  type="text"
                  value={selectedDoc.tags}
                  onChange={e => setSelectedDoc(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="e.g. backend, docker, config"
                  className="w-full p-2 border border-gray-200 rounded"
                />
              </div>
            </div>

            <div>
              <label className="form-label text-sm font-semibold mb-1 block">Content</label>
              <textarea
                value={selectedDoc.content}
                onChange={e => setSelectedDoc(prev => ({ ...prev, content: e.target.value }))}
                rows="6"
                className="w-full p-2 border border-gray-200 rounded font-mono text-sm"
                required
              />
            </div>

            <div className="flex justify-end space-x-2 border-t pt-4">
              <Button variant="outline" type="button" onClick={() => { setIsEditModalOpen(false); setSelectedDoc(null); }}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Update Wiki Document
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Wiki Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => { setIsDeleteModalOpen(false); setSelectedDoc(null); }} title="Delete Wiki Article">
        {selectedDoc && (
          <div>
            <p className="mb-4">
              Are you sure you want to delete the wiki article <strong>{selectedDoc.title}</strong>?
            </p>
            <p className="text-red-500 text-sm mb-4">
              This will remove the item permanently from the company wiki and the AI Second Brain index.
            </p>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" type="button" onClick={() => { setIsDeleteModalOpen(false); setSelectedDoc(null); }}>
                Cancel
              </Button>
              <Button variant="danger" type="button" onClick={handleDeleteWiki}>
                Delete Permanent
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SecondBrainAdmin;
