import React, { useState, useEffect } from 'react';
import { getInventory, getAccounts } from '../../services/serverService';
import { FiSearch, FiLayers, FiMapPin, FiCpu, FiDatabase, FiCloud, FiServer, FiActivity, FiInfo } from 'react-icons/fi';
import { motion } from 'framer-motion';

const ResourceInventory = () => {
  const [resources, setResources] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, pages: 1 });
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [region, setRegion] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState(null);
  const [availableRegions, setAvailableRegions] = useState([]);

  const fetchInventory = async (page = 1) => {
    setIsLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        type: type || undefined,
        region: region || undefined,
        search: search || undefined
      };
      const data = await getInventory(params);
      setResources(data.items);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to load resource inventory:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch available regions from connected accounts (dynamically discovered via EC2 DescribeRegions)
  useEffect(() => {
    const loadRegions = async () => {
      try {
        const accounts = await getAccounts();
        const connectedAccounts = accounts.filter(a => a.connectionStatus === 'Connected');
        const regionSet = new Set();
        connectedAccounts.forEach(acc => {
          if (Array.isArray(acc.regions)) {
            acc.regions.forEach(r => regionSet.add(r));
          }
        });
        setAvailableRegions(Array.from(regionSet).sort());
      } catch (err) {
        console.warn('Could not load account regions for filter:', err.message);
      }
    };
    loadRegions();
  }, []);

  useEffect(() => {
    fetchInventory(1);
  }, [type, region]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchInventory(1);
  };

  const getServiceIcon = (serviceType) => {
    switch (serviceType) {
      case 'ec2': return <FiCpu className="text-teal-600" />;
      case 'rds': return <FiDatabase className="text-blue-600" />;
      case 's3': return <FiCloud className="text-indigo-600" />;
      case 'eks': return <FiLayers className="text-emerald-600" />;
      default: return <FiServer className="text-slate-600" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950 font-sans">Cloud Resource Inventory</h1>
        <p className="text-slate-500 text-sm mt-1">Search and manage all active discovered AWS cloud resources across connected regions.</p>
      </div>

      {/* Filter and Search controls */}
      <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex gap-2">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search resource by Name, ID or ARN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50 text-sm transition-all"
            />
          </div>
          <button 
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition active:scale-[0.98]"
          >
            Query
          </button>
        </form>

        <div className="flex gap-3 w-full md:w-auto">
          {/* Service Selector */}
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          >
            <option value="">All Services</option>
            <option value="ec2">EC2 Compute</option>
            <option value="rds">RDS Databases</option>
            <option value="s3">S3 Buckets</option>
            <option value="ebs">EBS Storage</option>
            <option value="eks">EKS Containers</option>
          </select>

          {/* Region Selector — populated dynamically from connected account regions */}
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          >
            <option value="">All Regions</option>
            {availableRegions.length > 0 ? (
              availableRegions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))
            ) : (
              // Fallback shown while accounts are loading or if no accounts are connected
              <option disabled value="">— No regions discovered —</option>
            )}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Resource List Table */}
        <div className="xl:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[400px]">
          <h2 className="text-base font-bold text-slate-900 mb-6">Active Cloud Resources</h2>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
          ) : resources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <FiLayers className="w-10 h-10 text-slate-300 mb-3" />
              <h3 className="text-slate-700 font-bold text-sm">No resources found</h3>
              <p className="text-slate-400 text-xs mt-1">Verify that AWS connection is active and synchronization runs complete.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 tracking-wider">
                      <th className="pb-3">Resource Name</th>
                      <th className="pb-3">Service</th>
                      <th className="pb-3">Region</th>
                      <th className="pb-3">State</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs text-slate-700 divide-y divide-slate-50">
                    {resources.map((item) => (
                      <tr 
                        key={item._id}
                        className={`hover:bg-slate-50/40 transition ${ selectedResource && selectedResource._id === item._id ? 'bg-teal-50/10' : '' }`}
                      >
                        <td className="py-3.5">
                          <div className="flex flex-col max-w-[200px] truncate">
                            <span className="font-semibold text-slate-900 truncate">{item.name}</span>
                            <span className="text-[10px] text-slate-400 truncate mt-0.5">{item.resourceId}</span>
                          </div>
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-1.5 font-semibold">
                            {getServiceIcon(item.type)}
                            <span className="text-[10px]">{item.type}</span>
                          </div>
                        </td>
                        <td className="py-3.5 text-slate-500 font-medium font-mono">{item.region}</td>
                        <td className="py-3.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${ item.status === 'running' || item.status === 'active' || item.status === 'available' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800' }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <button
                            onClick={() => setSelectedResource(item)}
                            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-100 text-[10px] font-bold text-slate-800 transition"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {pagination.pages > 1 && (
                <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                  <span className="text-xs text-slate-400 font-semibold">Page {pagination.page} of {pagination.pages}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchInventory(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 text-xs font-bold border rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => fetchInventory(pagination.page + 1)}
                      disabled={pagination.page === pagination.pages}
                      className="px-3 py-1 text-xs font-bold border rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side Resource Details Drawer */}
        <div className="xl:col-span-1">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[400px]">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-6">
              <FiActivity className="text-teal-600" />
              <span>Telemetry Attributes</span>
            </h2>

            {!selectedResource ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <FiInfo className="w-10 h-10 text-slate-300 mb-3" />
                <h3 className="text-slate-600 font-bold text-sm">No resource selected</h3>
                <p className="text-slate-400 text-xs mt-1">Click the "Details" button of any resource card in the inventory to display its cloud specifications and user tags.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{selectedResource.name}</h3>
                  <p className="text-slate-400 font-mono text-[9px] truncate mt-0.5">{selectedResource.resourceId}</p>
                </div>

                {/* Specs */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                  <span className="block text-[10px] font-bold text-slate-400 tracking-wide mb-1">Configuration Specifications</span>
                  {Object.entries(selectedResource.resourceMetadata || {}).map(([key, val]) => (
                    <div key={key} className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="text-slate-900 font-bold font-mono">{String(val)}</span>
                    </div>
                  ))}
                </div>

                {/* Tags compliance */}
                <div className="space-y-2">
                  <span className="block text-[10px] font-bold text-slate-400 tracking-wide">Resource Tags Metadata</span>
                  {selectedResource.tags && Object.keys(selectedResource.tags).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(selectedResource.tags).map(([key, val]) => (
                        <span key={key} className="text-[10px] font-semibold bg-teal-50/50 border border-teal-100/50 text-teal-800 px-2 py-0.5 rounded-md">
                          {key}: <strong className="text-teal-950 font-bold">{val}</strong>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-rose-600 italic">No user tags configured on this AWS asset.</span>
                  )}
                </div>

                {/* Container namespaces */}
                {selectedResource.containerMetadata && selectedResource.containerMetadata.namespace && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="block text-[10px] font-bold text-slate-400 tracking-wide">EKS Container Mapping</span>
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Namespace:</span>
                        <strong className="text-slate-900 font-mono">{selectedResource.containerMetadata.namespace}</strong>
                      </div>
                      {selectedResource.containerMetadata.podName && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Pod Name:</span>
                          <strong className="text-slate-900 font-mono">{selectedResource.containerMetadata.podName}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ResourceInventory;
