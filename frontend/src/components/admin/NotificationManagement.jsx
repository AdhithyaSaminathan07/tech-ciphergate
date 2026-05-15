import React, { useState, useEffect, useContext, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import appContext from '../../context/AppContext';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import {
  readNotification,
  createNotification,
  updateNotification,
  deleteNotification
} from '../../services/notificationService';
import { getWorkers } from '../../services/workerService';

const NotificationManagement = () => {
  const messageInputRef = useRef(null);
  const { subdomain } = useContext(appContext);
  const [workers, setWorkers] = useState([]);
  const [targetType, setTargetType] = useState('all');
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [notifications, setNotifications] = useState([]);
  const [formData, setFormData] = useState({ messageData: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [filterStartDate, setFilterStartDate] = useState('');

  useEffect(() => {
    if (subdomain) {
      fetchNotifications();
      fetchWorkers();
    }
  }, [subdomain]);

  const fetchWorkers = async () => {
    try {
      const data = await getWorkers(subdomain);
      setWorkers(data);
    } catch (err) {
      console.error('Failed to fetch workers:', err);
    }
  };

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      console.log(subdomain);
      const data = await readNotification(subdomain);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch (err) {
      toast.error('Failed to fetch notifications');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
        if (isAddModalOpen) {
          messageInputRef.current?.focus();
        }
      }, [isAddModalOpen]);

  const openAddModal = () => {
    setFormData({ messageData: '' });
    setTargetType('all');
    setSelectedWorkers([]);
    setSearchTerm('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (notification) => {
    setSelectedNotification(notification);
    setFormData({ messageData: notification.messageData });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (notification) => {
    setSelectedNotification(notification);
    setIsDeleteModalOpen(true);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (targetType === 'specific' && selectedWorkers.length === 0) {
      return toast.error('Please select at least one employee');
    }
    try {
      const newNotification = await createNotification({
        ...formData,
        subdomain,
        targetType,
        targetUsers: selectedWorkers
      });
      setNotifications((prev) => [newNotification, ...prev]);
      toast.success('Notification sent');
      setIsAddModalOpen(false);
    } catch (err) {
      toast.error('Failed to send notification');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      const updated = await updateNotification(selectedNotification._id, {
        ...formData,
        subdomain
      });
      setNotifications((prev) =>
        prev.map((n) => (n._id === updated._id ? updated : n))
      );
      toast.success('Notification updated');
      setIsEditModalOpen(false);
    } catch (err) {
      toast.error('Failed to update notification');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteNotification(selectedNotification._id);
      setNotifications((prev) =>
        prev.filter((n) => n._id !== selectedNotification._id)
      );
      toast.success('Notification deleted');
      setIsDeleteModalOpen(false);
    } catch (err) {
      toast.error('Failed to delete notification');
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (!filterStartDate) return true;

    const createdAtDate = new Date(n.createdAt).toISOString().split('T')[0];
    return createdAtDate === filterStartDate;
  });

  return (
    <div>
      <div className="flex justify-between md:justify-end items-center mb-6">
        <h1 className="text-2xl font-bold md:hidden">Notification Management</h1>
        <Button variant="primary" onClick={openAddModal} className="flex items-center">
          <FaPlus className="mr-2" /> Add Notification
        </Button>
      </div>

      <div className="mb-4 flex justify-end flex-wrap gap-4">
        <input
          type="date"
          className="form-input w-48"
          value={filterStartDate}
          onChange={(e) => setFilterStartDate(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Spinner size="lg" />
      ) : (
        <div className="space-y-4">
          {filteredNotifications.length === 0 ? (
            <p className='text-center'>No notifications found.</p>
          ) : (
            filteredNotifications.map((notification) => (
              <Card key={notification._id} className="shadow-sm border w-full">
                <div className='flex flex-col w-full gap-2'>
                  <p className="text-lg whitespace-normal break-words w-full">
                    {notification.messageData}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex space-x-2 mt-4 justify-end">
                  <button
                    className="text-blue-600 hover:text-blue-800"
                    onClick={() => openEditModal(notification)}
                  >
                    <FaEdit />
                  </button>
                  <button
                    className="text-red-600 hover:text-red-800"
                    onClick={() => openDeleteModal(notification)}
                  >
                    <FaTrash />
                  </button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Add Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Send Notification">
        <form onSubmit={handleAdd}>
          <div className="form-group mb-4">
            <label className="form-label font-bold text-gray-700">Target Audience</label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="targetType"
                  value="all"
                  checked={targetType === 'all'}
                  onChange={() => setTargetType('all')}
                  className="form-radio text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">All Employees</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="targetType"
                  value="specific"
                  checked={targetType === 'specific'}
                  onChange={() => setTargetType('specific')}
                  className="form-radio text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">Specific Employees</span>
              </label>
            </div>
          </div>

          {targetType === 'specific' && (
            <div className="form-group mb-4">
              <label className="form-label font-bold text-gray-700">Select Employees</label>
              {/* Search Bar */}
              <div className="relative mt-1 mb-2">
                <input
                  type="text"
                  placeholder="Search employees..."
                  className="form-input focus:border-teal-500 focus:ring-teal-500 text-sm pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 custom-scrollbar bg-white">
                {workers
                  .filter(worker => 
                    (worker.name && worker.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (worker.username && worker.username.toLowerCase().includes(searchTerm.toLowerCase()))
                  )
                  .map(worker => (
                    <label key={worker._id} className="flex items-center gap-2 p-1.5 hover:bg-teal-50 rounded-lg cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedWorkers.includes(worker._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedWorkers([...selectedWorkers, worker._id]);
                          } else {
                            setSelectedWorkers(selectedWorkers.filter(id => id !== worker._id));
                          }
                        }}
                        className="form-checkbox text-teal-600 rounded focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-700 font-medium">{worker.name} <span className="text-gray-400 text-xs">({worker.username})</span></span>
                    </label>
                  ))}
                {workers.filter(worker => 
                  worker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  worker.username.toLowerCase().includes(searchTerm.toLowerCase())
                ).length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-2">No employees found</div>
                )}
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label font-bold text-gray-700">Message</label>
            <textarea
              ref={messageInputRef}
              name="messageData"
              className="form-input mt-1 focus:border-teal-500 focus:ring-teal-500"
              value={formData.messageData}
              onChange={handleChange}
              required
              rows={4}
              placeholder="Type your announcement here..."
            />
          </div>
          <div className="flex justify-end space-x-2 mt-6">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Send Notification</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Notification">
        <form onSubmit={handleEdit}>
          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea
              name="messageData"
              className="form-input"
              value={formData.messageData}
              onChange={handleChange}
              required
            />
          </div>
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Update</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Notification">
        <p className="mb-4">Are you sure you want to delete this notification?</p>
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
};

export default NotificationManagement;