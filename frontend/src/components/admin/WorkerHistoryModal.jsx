import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Table from '../common/Table';
import Spinner from '../common/Spinner';
import Button from '../common/Button';
import { toast } from 'react-toastify';
import api from '../../services/api';

const WorkerHistoryModal = ({ isOpen, onClose, onRestore }) => {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      let url = '/workers/history';
      if (filterAction) url += `?actionType=${filterAction}`;
      const res = await api.get(url);
      setHistory(res.data);
    } catch (error) {
      toast.error('Failed to load employee history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, filterAction]);

  const handleRestore = async (historyRecord) => {
    try {
      // To restore, we need to update the worker's status to 'Active'
      await api.put(`/workers/${historyRecord.employee._id}`, { status: 'Active' });
      const actionText = historyRecord.employee.status === 'Deleted' ? 'restored' : 'retrieved';
      toast.success(`Employee ${actionText} successfully`);
      fetchHistory();
      if (onRestore) onRestore();
    } catch (error) {
      const actionText = historyRecord.employee?.status === 'Deleted' ? 'restore' : 'retrieve';
      toast.error(`Failed to ${actionText} employee`);
    }
  };

  const columns = [
    {
      header: 'Employee',
      accessor: 'employee',
      render: (record) => (
        <span>
          {record.employee ? record.employee.name : 'Unknown'}
          {record.employee && record.employee.status === 'Deleted' && (
            <span className="ml-2 text-xs text-red-500">(Deleted)</span>
          )}
        </span>
      )
    },
    {
      header: 'Action',
      accessor: 'actionType',
      render: (record) => {
        const colors = {
          Created: 'text-green-600 bg-green-100',
          Updated: 'text-blue-600 bg-blue-100',
          Deleted: 'text-red-600 bg-red-100',
          Restored: 'text-purple-600 bg-purple-100',
          Relieved: 'text-orange-600 bg-orange-100'
        };
        const color = colors[record.actionType] || 'text-gray-600 bg-gray-100';
        return <span className={`px-2 py-1 rounded text-xs font-semibold ${color}`}>{record.actionType}</span>;
      }
    },
    {
      header: 'Performed By',
      accessor: 'performedBy',
      render: (record) => record.performedBy ? record.performedBy.name || record.performedBy.email : 'System'
    },
    {
      header: 'Date',
      accessor: 'createdAt',
      render: (record) => new Date(record.createdAt).toLocaleString()
    },
    {
      header: 'Actions',
      render: (record) => {
        if (record.employee) {
          const isCurrentState = record.actionType === record.employee.status;
          if (isCurrentState && (record.employee.status === 'Deleted' || record.employee.status === 'Relieved')) {
            return (
              <Button variant="outline" onClick={() => handleRestore(record)}>
                {record.employee.status === 'Deleted' ? 'Restore' : 'Retrieve'}
              </Button>
            );
          }
        }
        return null;
      }
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Employee History" size="xl">
      <div className="mb-4 flex space-x-4 max-w-4xl w-[800px]">
        <select
          className="form-input"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        >
          <option value="">All Actions</option>
          <option value="Created">Created</option>
          <option value="Updated">Updated</option>
          <option value="Deleted">Deleted</option>
          <option value="Restored">Restored</option>
          <option value="Relieved">Relieved</option>
        </select>
        <Button variant="primary" onClick={fetchHistory}>Refresh</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : (
        <Table columns={columns} data={history} />
      )}
    </Modal>
  );
};

export default WorkerHistoryModal;
