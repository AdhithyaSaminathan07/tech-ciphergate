import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { updateMe } from '../../services/authService';
import { getFullFileUrl } from '../../utils/fileUtils';
import uploadUtils from '../../utils/uploadUtils';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { Camera, Mail, User, Lock, Save } from 'lucide-react';
import Card from '../common/Card';
import Spinner from '../common/Spinner';

const AdminProfile = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    photo: null,
    password: '',
    confirmPassword: ''
  });
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        email: user.email || '',
        photo: (prev.photo instanceof File) ? prev.photo : (user.photo || null)
      }));
      if (user.photo) {
        setPreviewUrl(getFullFileUrl(user.photo));
      }
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file');
        return;
      }
      setFormData(prev => ({ ...prev, photo: file }));
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password && formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const dataToUpdate = { ...formData };
      
      // Handle photo upload if it's a file
      if (dataToUpdate.photo && dataToUpdate.photo instanceof File) {
        const uploadData = new FormData();
        uploadData.append('photo', dataToUpdate.photo);
        const res = await api.post('/auth/profile-image', uploadData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        dataToUpdate.photo = res.data.photo;
      }

      if (!dataToUpdate.password) {
        delete dataToUpdate.password;
      }
      delete dataToUpdate.confirmPassword;

      const response = await updateMe(dataToUpdate);
      toast.success('Profile updated successfully!');
      
      // Update local user context
      updateUser({
        email: response.email,
        photo: response.photo
      });
      
      setFormData(prev => ({ 
        ...prev, 
        password: '', 
        confirmPassword: '',
        photo: response.photo 
      }));
    } catch (error) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <motion.h1 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-bold text-slate-900 mb-6"
      >
        Admin Profile Settings
      </motion.h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column - Avatar Upload */}
        <div className="md:col-span-1">
          <Card padding="p-6" className="flex flex-col items-center">
            <div className="relative group w-32 h-32 mb-4">
              <div className="w-32 h-32 rounded-3xl overflow-hidden bg-teal-50 flex items-center justify-center border-2 border-slate-100 shadow-sm">
                {previewUrl ? (
                  <img src={previewUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={48} className="text-teal-600 opacity-50" />
                )}
              </div>
              <label 
                htmlFor="photo-upload" 
                className="absolute inset-0 bg-black/40 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer"
              >
                <Camera size={24} className="mb-1" />
                <span className="text-xs font-bold">Change Photo</span>
              </label>
              <input 
                id="photo-upload" 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileChange} 
              />
            </div>
            
            <h2 className="text-lg font-bold text-slate-800 text-center">{user?.username || user?.name}</h2>
            <p className="text-xs font-black text-teal-600 uppercase tracking-widest mt-1">Administrator</p>
          </Card>
        </div>

        {/* Right Column - Form */}
        <div className="md:col-span-2">
          <Card padding="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 my-4 pt-4">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Change Password</h3>
                <p className="text-xs text-slate-400 mb-4">Leave blank if you don't want to change it.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Password */}
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5 block">New Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock size={16} />
                      </div>
                      <input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Confirm Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock size={16} />
                      </div>
                      <input
                        type="password"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#0d9488] text-white font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-sm active:scale-95 disabled:opacity-70 disabled:pointer-events-none"
                >
                  {loading ? (
                    <Spinner size="sm" color="white" />
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminProfile;
