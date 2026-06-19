import React, { useState, useEffect } from 'react';
import { getRelationships } from '../../services/serverService';
import { FiCpu, FiDatabase, FiLayers, FiFolder, FiChevronDown, FiChevronRight, FiAlertTriangle, FiInfo } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const ResourceRelationships = () => {
  const [relations, setRelations] = useState([]);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchRelationshipsList = async () => {
    setIsLoading(true);
    try {
      const data = await getRelationships();
      setRelations(data);
      
      // Auto expand first few nodes
      const initialExpand = {};
      data.forEach(rel => {
        initialExpand[rel.parentResourceId] = true;
      });
      setExpandedNodes(initialExpand);
    } catch (error) {
      console.error('Failed to fetch resource dependencies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRelationshipsList();
  }, []);

  const toggleNode = (nodeId) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Build root elements (parents that are not child of anything else in the array)
  const childIds = new Set(relations.map(r => r.childResourceId));
  const rootRelations = relations.filter(r => !childIds.has(r.parentResourceId));

  // If there are duplicate parents, group them so we render unique parent nodes
  const parentMap = {};
  relations.forEach(rel => {
    if (!parentMap[rel.parentResourceId]) {
      parentMap[rel.parentResourceId] = {
        id: rel.parentResourceId,
        type: rel.parentType,
        children: []
      };
    }
    parentMap[rel.parentResourceId].children.push({
      id: rel.childResourceId,
      type: rel.childType,
      relation: rel.relationType
    });
  });

  // Unique list of root parents
  const rootParentIds = Array.from(new Set(rootRelations.map(r => r.parentResourceId)));

  const getServiceIcon = (serviceType) => {
    switch (serviceType?.toLowerCase()) {
      case 'ec2': return <FiCpu className="text-teal-600" />;
      case 'rds': return <FiDatabase className="text-blue-600" />;
      case 'eks': return <FiLayers className="text-emerald-600" />;
      case 'ebs': return <FiFolder className="text-indigo-600" />;
      default: return <FiFolder className="text-slate-500" />;
    }
  };

  // Recursively render node children
  const renderNode = (nodeId, depth = 0) => {
    const node = parentMap[nodeId];
    if (!node) return null;

    const isExpanded = !!expandedNodes[nodeId];

    return (
      <div key={nodeId} className="space-y-1.5">
        <div 
          onClick={() => toggleNode(nodeId)}
          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition bg-white border-slate-100 hover:bg-slate-50/50 hover:border-slate-200/50 ${ depth > 0 ? 'ml-6 border-l-2 border-l-teal-500/20' : '' }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
              {getServiceIcon(node.type)}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 font-mono break-all">{node.id}</span>
              <span className="block text-[9px] text-slate-400 font-extrabold tracking-wide mt-0.5">{node.type} node</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
              {node.children.length} Links
            </span>
            {isExpanded ? <FiChevronDown size={14} className="text-slate-400" /> : <FiChevronRight size={14} className="text-slate-400" />}
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden ml-3 pl-3 border-l border-dashed border-slate-200/80 space-y-2 pt-1"
            >
              {node.children.map(child => {
                // If child is also a parent, recurse
                if (parentMap[child.id]) {
                  return renderNode(child.id, depth + 1);
                }

                // Leaf child node
                return (
                  <div 
                    key={child.id} 
                    className="p-2.5 rounded-xl border border-slate-100/50 bg-slate-50/25 flex items-center justify-between ml-6 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1 rounded-md bg-white border border-slate-100">
                        {getServiceIcon(child.type)}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800 font-mono break-all">{child.id}</span>
                        <span className="block text-[9px] text-slate-400 font-bold tracking-wider mt-0.5">{child.type} leaf</span>
                      </div>
                    </div>

                    <span className="text-[9px] font-bold text-teal-800 bg-teal-50 border border-teal-100/30 px-1.5 py-0.5 rounded">
                      {child.relation}
                    </span>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 font-sans">Resource Relationships</h1>
          <p className="text-slate-500 text-sm mt-1">Audit dependency mappings and parent-child linkages to evaluate downstream shutdown risks.</p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200/50 text-teal-800 text-xs font-semibold">
          <FiInfo className="text-teal-600" />
          <span>Dependency charts inform waste remediation safety profiles.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Topologies Container */}
        <div className="xl:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] min-h-[400px]">
          <h2 className="text-base font-bold text-slate-900 mb-6">Logical Topology Trees</h2>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
          ) : relations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <FiChevronRight className="w-10 h-10 text-slate-300 mb-3 rotate-90" />
              <h3 className="text-slate-700 font-bold text-sm">No relationships found</h3>
              <p className="text-slate-400 text-xs mt-1">Discovered resource associations will appear here once background scans catalog assets.</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-xl">
              {rootParentIds.map(id => renderNode(id))}
            </div>
          )}
        </div>

        {/* Sidebar Info Drawer */}
        <div className="xl:col-span-1">
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FiAlertTriangle className="text-amber-500" />
              <span>Downstream Impact Safety</span>
            </h2>

            <p className="text-xs text-slate-500 leading-relaxed">
              Cloud waste optimization requires strict validation of resource relationships before performing changes:
            </p>

            <div className="space-y-3 pt-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100/50">
                <span className="block text-xs font-bold text-slate-900">EBS Volumes (attaches)</span>
                <span className="block text-[10px] text-slate-400 mt-1 leading-normal">
                  Resizing EC2 host compute triggers disk volume detachments. Check volume partitions mapping prior to approval.
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100/50">
                <span className="block text-xs font-bold text-slate-900">Kubernetes Pods (contains)</span>
                <span className="block text-[10px] text-slate-400 mt-1 leading-normal">
                  EKS pod allocation aggregates namespace runrates. Stopping node instances forces pod reallocation to siblings.
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ResourceRelationships;
