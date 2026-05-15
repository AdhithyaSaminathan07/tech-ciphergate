import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getGowhatsConfig, saveGowhatsConfig } from '../../services/gowhatsService';
import Card from '../common/Card';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import { Save, MessageSquare, Key, Phone, Building2, CheckCircle, Zap, Shield, Settings, Trash, X } from 'lucide-react';

const GoWhatsIntegration = () => {
  const [config, setConfig] = useState({
    apiKey: '',
    phoneNumberId: '',
    businessAccountId: '',
    adminWhatsappNumbers: [''], 
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await getGowhatsConfig();
        setConfig(prev => ({
            ...prev,
            phoneNumberId: data.phoneNumberId || '',
            businessAccountId: data.businessAccountId || '',
            adminWhatsappNumbers: data.adminWhatsappNumbers && data.adminWhatsappNumbers.length > 0 
              ? data.adminWhatsappNumbers 
              : [''], 
        }));
      } catch (error) {
        toast.error('Failed to load GoWhats configuration.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhoneNumberChange = (index, value) => {
    const updatedNumbers = [...config.adminWhatsappNumbers];
    updatedNumbers[index] = value;
    setConfig(prev => ({ ...prev, adminWhatsappNumbers: updatedNumbers }));
  };

  const addPhoneNumber = () => {
    if (config.adminWhatsappNumbers.length < 5) {
      setConfig(prev => ({
        ...prev,
        adminWhatsappNumbers: [...prev.adminWhatsappNumbers, '']
      }));
    }
  };

  const removePhoneNumber = (index) => {
    if (config.adminWhatsappNumbers.length > 1) {
      const updatedNumbers = config.adminWhatsappNumbers.filter((_, i) => i !== index);
      setConfig(prev => ({ ...prev, adminWhatsappNumbers: updatedNumbers }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validPhoneNumbers = config.adminWhatsappNumbers.filter(num => num.trim() !== '');
    
    if (!config.apiKey || !config.phoneNumberId || !config.businessAccountId || validPhoneNumbers.length === 0) {
      toast.error('Please fill in all required fields.');
      return;
    }

    const configToSave = {
      ...config,
      adminWhatsappNumbers: validPhoneNumbers
    };

    setIsSubmitting(true);
    try {
      const response = await saveGowhatsConfig(configToSave); 
      console.log('Success! Response from backend:', response);
      toast.success(response.message || 'Configuration saved successfully!');
      setConfig(prev => ({ ...prev, apiKey: '' })); 
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save configuration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-3">
          <Spinner className="w-8 h-8 text-emerald-500" />
          <p className="text-slate-600 text-sm">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {/* Header Section - Same as before */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 rounded-xl shadow-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                <Zap className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                WhatsApp Integration
              </h1>
              <p className="text-slate-500 text-xs md:text-sm font-medium">Integration Hub</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 self-start sm:self-auto">
            <Shield className="w-4 h-4 text-emerald-600" />
            <span className="text-emerald-700 text-xs font-semibold">SECURE</span>
          </div>
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white rounded-xl md:rounded-2xl shadow-lg md:shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 md:space-x-3">
              <Settings className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
              <h2 className="text-base md:text-lg font-semibold text-white">API Configuration</h2>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-emerald-400 text-xs font-medium">LIVE</span>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* API Key Field - Same as before */}
            <div className="lg:col-span-2">
              <label className="flex items-center text-sm font-semibold text-slate-700 mb-2 md:mb-3">
                <div className="w-5 h-5 md:w-6 md:h-6 bg-amber-100 rounded-lg flex items-center justify-center mr-2 md:mr-3">
                  <Key className="w-3 h-3 md:w-3.5 md:h-3.5 text-amber-600" />
                </div>
                API Key
                <span className="text-red-500 ml-1">*</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  id="apiKey"
                  name="apiKey"
                  className="w-full pl-4 pr-10 md:pr-12 py-2 md:py-3 border-2 border-slate-200 rounded-lg md:rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all duration-200 bg-slate-50 hover:bg-white text-sm"
                  value={config.apiKey}
                  onChange={handleChange}
                  placeholder="Enter your secure API key"
                  required
                />
                <div className="absolute right-3 md:right-4 top-1/2 transform -translate-y-1/2">
                  <Shield className="w-4 h-4 text-slate-400" />
                </div>
              </div>
              <p className="text-xs text-amber-600 mt-2 flex items-center">
                <CheckCircle className="w-3 h-3 mr-1" />
                Field is automatically cleared after successful save
              </p>
            </div>

            {/* Phone Number ID - Same as before */}
            <div>
              <label className="flex items-center text-sm font-semibold text-slate-700 mb-2 md:mb-3">
                <div className="w-5 h-5 md:w-6 md:h-6 bg-green-100 rounded-lg flex items-center justify-center mr-2 md:mr-3">
                  <Phone className="w-3 h-3 md:w-3.5 md:h-3.5 text-green-600" />
                </div>
                Phone Number ID
                <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="text"
                id="phoneNumberId"
                name="phoneNumberId"
                className="w-full px-4 py-2 md:py-3 border-2 border-slate-200 rounded-lg md:rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all duration-200 bg-slate-50 hover:bg-white text-sm"
                value={config.phoneNumberId}
                onChange={handleChange}
                placeholder="WhatsApp Phone Number ID"
                required
              />
            </div>

            {/* Business Account ID - Same as before */}
            <div>
              <label className="flex items-center text-sm font-semibold text-slate-700 mb-2 md:mb-3">
                <div className="w-5 h-5 md:w-6 md:h-6 bg-blue-100 rounded-lg flex items-center justify-center mr-2 md:mr-3">
                  <Building2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-600" />
                </div>
                Business Account ID
                <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="text"
                id="businessAccountId"
                name="businessAccountId"
                className="w-full px-4 py-2 md:py-3 border-2 border-slate-200 rounded-lg md:rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all duration-200 bg-slate-50 hover:bg-white text-sm"
                value={config.businessAccountId}
                onChange={handleChange}
                placeholder="Business Account Identifier"
                required
              />
            </div>

            {/* Admin WhatsApp Numbers - UPDATED SECTION */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <label className="flex items-center text-sm font-semibold text-slate-700">
                  <div className="w-5 h-5 md:w-6 md:h-6 bg-purple-100 rounded-lg flex items-center justify-center mr-2 md:mr-3">
                    <MessageSquare className="w-3 h-3 md:w-3.5 md:h-3.5 text-purple-600" />
                  </div>
                  Admin WhatsApp Numbers
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <button
                  type="button"
                  onClick={addPhoneNumber}
                  disabled={config.adminWhatsappNumbers.length >= 5}
                  className="flex items-center space-x-1 px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash className="w-3 h-3" />
                  <span>Add Number ({config.adminWhatsappNumbers.length}/5)</span>
                </button>
              </div>

              <div className="space-y-3">
                {config.adminWhatsappNumbers.map((number, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={number}
                        onChange={(e) => handlePhoneNumberChange(index, e.target.value)}
                        className="w-full px-4 py-2 md:py-3 border-2 border-slate-200 rounded-lg md:rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all duration-200 bg-slate-50 hover:bg-white text-sm"
                        placeholder={`Admin ${index + 1} - e.g., 919876543210`}
                        required={index === 0}
                      />
                    </div>
                    {config.adminWhatsappNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePhoneNumber(index)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove this number"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <div className="flex items-center space-x-2 bg-purple-50 px-3 py-1 md:py-2 rounded-lg border border-purple-200">
                  <CheckCircle className="w-3 h-3 md:w-4 md:h-4 text-purple-600" />
                  <p className="text-xs text-purple-700 font-medium">All numbers will receive leave notifications</p>
                </div>
                <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1 md:py-2 rounded-lg border border-blue-200">
                  <Phone className="w-3 h-3 md:w-4 md:h-4 text-blue-600" />
                  <p className="text-xs text-blue-700 font-medium">Maximum 5 numbers allowed</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons - Same as before */}
          <div className="mt-6 md:mt-8 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setConfig({ apiKey: '', phoneNumberId: '', businessAccountId: '', adminWhatsappNumbers: [''] })}
              className="w-full sm:w-auto px-4 md:px-6 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all duration-200 text-sm font-medium border-2 border-slate-200 hover:border-slate-300"
            >
              Clear All
            </button>
            
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-700 hover:from-emerald-700 hover:via-green-700 hover:to-emerald-800 text-white rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:transform-none disabled:shadow-md text-sm font-semibold"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center space-x-2">
                  <Spinner className="w-4 h-4" />
                  <span>Saving Configuration...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <Save className="w-4 h-6" />
                  <span>Save & Deploy</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoWhatsIntegration;