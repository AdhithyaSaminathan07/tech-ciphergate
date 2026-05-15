// Settings.jsx
import { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import {
    FiSun,
    FiSunrise,
    FiMoon,
    FiMail,
    FiClock,
    FiSettings,
    FiSave,
    FiRefreshCw,
    FiAlertTriangle,
    FiDollarSign,
    FiUser,
    FiToggleLeft,
    FiToggleRight,
    FiPlus,
    FiTrash2,
    FiMapPin,
    FiActivity,
    FiUserCheck,
    FiInfo,
    FiCalendar
} from 'react-icons/fi';
import Modal from '../common/Modal';
import HolidayManagement from './HolidayManagement';
import Button from '../common/Button';
import Card from '../common/Card';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import api from '../../services/api';
import { getAuthToken } from '../../utils/authUtils';
import { getCurrentPosition } from '../../services/geolocationService';
const Settings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null); // Add this state to track current location

    const { subdomain } = useContext(appContext);
    const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);

    // Original settings (for comparison)
    const [originalSettings, setOriginalSettings] = useState({});

    // Current form data
    const [settings, setSettings] = useState({
        // Breakfast settings
        breakfastEnabled: false,
        breakfastOpenTime: '07:00',
        breakfastCloseTime: '09:00',
        breakfastAutoSwitch: false,
        // Lunch (food request) settings
        foodRequestEnabled: false,
        foodRequestOpenTime: '12:00',
        foodRequestCloseTime: '14:00',
        foodRequestAutoSwitch: false,

        // Dinner settings
        dinnerEnabled: false,
        dinnerOpenTime: '18:00',
        dinnerCloseTime: '20:00',
        dinnerAutoSwitch: false,

        // Email settings
        emailReportsEnabled: false,

        // Attendance and productivity settings
        considerOvertime: false,
        deductSalary: true,
        permissionTimeMinutes: 15,
        salaryDeductionPerBreak: 10,

        // Batches and intervals
        batches: [
            {
                batchName: 'Full Time',
                from: '09:00',
                to: '19:00',
                lunchFrom: '12:00',
                lunchTo: '13:00',
                isLunchConsider: false,
                isFactoryWorkerToggle: false,
                requiredWorkingHours: 8,
                allowedFreeLunchHours: 1
            }
        ],
        intervals: [
            {
                intervalName: 'interval1',
                from: '10:15',
                to: '10:30',
                isBreakConsider: false
            },
            {
                intervalName: 'interval2',
                from: '14:15',
                to: '14:30',
                isBreakConsider: false
            }
        ],

        // Location settings
        attendanceLocation: {
            enabled: false,
            latitude: 0,
            longitude: 0,
            radius: 100
        },

        // Attendance Access Control
        attendanceAccessControl: {
            admin: {
                addAttendance: true,
                faceAttendance: true
            },
            employee: {
                rfidAttendance: true,
                faceAttendance: true
            }
        },

        // Advanced Leave Deduction Settings
        advancedLeaveDeduction: {
            attendanceRuleEnabled: false,
            monthlyLimitRuleEnabled: false,
            thresholds: {
                company: { value: 80, enabled: true },
                department: { value: 80, enabled: true },
                employee: { value: 90, enabled: true }
            },
            monthlyLimit: 2,
            deductionMultiplier: 2
        },
        includePermission: false,
        paidLeaveConfig: {
            enabled: false,
            leavesPerMonth: 1
        }
    });

    const formatTimeTo12Hour = (time24) => {
        if (!time24) return '';
        const [hours, minutes] = time24.split(':');
        const hour = parseInt(hours, 10);
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes.padStart(2, '0')} ${period}`;
    };

    // Validation functions
    const validateBatchNames = (batches) => {
        const names = batches.map(batch => batch.batchName.trim().toLowerCase());
        const uniqueNames = new Set(names);
        return names.length === uniqueNames.size;
    };

    const validateIntervalNames = (intervals) => {
        const names = intervals.map(interval => interval.intervalName.trim().toLowerCase());
        const uniqueNames = new Set(names);
        return names.length === uniqueNames.size;
    };

    // Check if settings have changed
    const checkForChanges = (currentSettings) => {
        const changed = JSON.stringify(currentSettings) !== JSON.stringify(originalSettings);
        setHasChanges(changed);
    };

    // Fetch settings from API
    const fetchSettings = async () => {
        if (!subdomain || subdomain === 'main') {
            toast.error('Invalid subdomain. Please check the URL.');
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const token = getAuthToken();
            const response = await api.get(`/settings/${subdomain}`, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                }
            });
            const fetchedSettings = response.data;

            const mappedAdvanced = {
                attendanceRuleEnabled: fetchedSettings.advancedLeaveDeduction?.attendanceRuleEnabled !== undefined ? fetchedSettings.advancedLeaveDeduction.attendanceRuleEnabled : false,
                monthlyLimitRuleEnabled: fetchedSettings.advancedLeaveDeduction?.monthlyLimitRuleEnabled !== undefined ? fetchedSettings.advancedLeaveDeduction.monthlyLimitRuleEnabled : false,
                thresholds: {
                    company: {
                        value: fetchedSettings.advancedLeaveDeduction?.thresholds?.company?.value ?? fetchedSettings.advancedLeaveDeduction?.thresholds?.company ?? 80,
                        enabled: fetchedSettings.advancedLeaveDeduction?.thresholds?.company?.enabled ?? true
                    },
                    department: {
                        value: fetchedSettings.advancedLeaveDeduction?.thresholds?.department?.value ?? fetchedSettings.advancedLeaveDeduction?.thresholds?.department ?? 80,
                        enabled: fetchedSettings.advancedLeaveDeduction?.thresholds?.department?.enabled ?? true
                    },
                    employee: {
                        value: fetchedSettings.advancedLeaveDeduction?.thresholds?.employee?.value ?? fetchedSettings.advancedLeaveDeduction?.thresholds?.employee ?? 90,
                        enabled: fetchedSettings.advancedLeaveDeduction?.thresholds?.employee?.enabled ?? true
                    }
                },
                monthlyLimit: fetchedSettings.advancedLeaveDeduction?.monthlyLimit || 2,
                deductionMultiplier: fetchedSettings.advancedLeaveDeduction?.deductionMultiplier || 2
            };

            const finalSettings = {
                ...settings, // Start with defaults
                ...fetchedSettings, // Overwrite with DB data
                advancedLeaveDeduction: mappedAdvanced, // Overwrite with mapped data
                attendanceAccessControl: {
                    admin: { ...settings.attendanceAccessControl.admin, ...(fetchedSettings.attendanceAccessControl?.admin || {}) },
                    employee: { ...settings.attendanceAccessControl.employee, ...(fetchedSettings.attendanceAccessControl?.employee || {}) }
                },
                attendanceLocation: {
                    enabled: fetchedSettings.attendanceLocation?.enabled ?? false,
                    latitude: fetchedSettings.attendanceLocation?.latitude || 0,
                    longitude: fetchedSettings.attendanceLocation?.longitude || 0,
                    radius: fetchedSettings.attendanceLocation?.radius || 100
                },
                includePermission: fetchedSettings.includePermission ?? false,
                paidLeaveConfig: {
                    enabled: fetchedSettings.paidLeaveConfig?.enabled ?? false,
                    leavesPerMonth: fetchedSettings.paidLeaveConfig?.leavesPerMonth || 1
                }
            };

            setSettings(finalSettings);
            setOriginalSettings(finalSettings);
            setHasChanges(false);
        } catch (error) {
            if (error.response?.status === 404) {
                setOriginalSettings(settings); // Baseline is current defaults
            } else {
                toast.error('Failed to fetch settings');
            }
        } finally {
            setLoading(false);
        }
    };

    // Handle input changes (for non-batch/interval fields)
    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        const newValue = type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value);

        const updatedSettings = {
            ...settings,
            [name]: newValue
        };

        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    // Handle batch changes
    const handleBatchChange = (index, field, value) => {
        const updatedBatches = [...settings.batches];
        updatedBatches[index] = {
            ...updatedBatches[index],
            [field]: value
        };
        const updatedSettings = {
            ...settings,
            batches: updatedBatches
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    // Handle interval changes
    const handleIntervalChange = (index, field, value) => {
        const updatedIntervals = [...settings.intervals];
        updatedIntervals[index] = {
            ...updatedIntervals[index],
            [field]: value
        };
        const updatedSettings = {
            ...settings,
            intervals: updatedIntervals
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    // Handle adding new batch
    const handleAddBatch = () => {
        const newBatch = {
            batchName: '',
            from: '09:00',
            to: '19:00',
            lunchFrom: '12:00',
            lunchTo: '13:00',
            isLunchConsider: false,
            isFactoryWorkerToggle: false,
            requiredWorkingHours: 8,
            allowedFreeLunchHours: 1
        };
        const updatedSettings = {
            ...settings,
            batches: [...settings.batches, newBatch]
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    // Handle removing batch
    const handleRemoveBatch = (index) => {
        const updatedBatches = settings.batches.filter((_, i) => i !== index);
        const updatedSettings = {
            ...settings,
            batches: updatedBatches
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    // Handle adding new interval
    const handleAddInterval = () => {
        const newInterval = {
            intervalName: `interval${settings.intervals.length + 1}`,
            from: '10:15',
            to: '10:30',
            isBreakConsider: false
        };
        const updatedSettings = {
            ...settings,
            intervals: [...settings.intervals, newInterval]
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    // Handle removing interval
    const handleRemoveInterval = (index) => {
        const updatedIntervals = settings.intervals.filter((_, i) => i !== index);
        const updatedSettings = {
            ...settings,
            intervals: updatedIntervals
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    // Handle location input changes
    const handleLocationChange = (field, value) => {
        const updatedSettings = {
            ...settings,
            attendanceLocation: {
                ...settings.attendanceLocation,
                [field]: value
            }
        };
        setSettings(updatedSettings);
        checkLocationChanges(updatedSettings);
    };

    // Handle Attendance Access Control changes
    const handleAccessControlChange = (role, field, value) => {
        const updatedSettings = {
            ...settings,
            attendanceAccessControl: {
                ...settings.attendanceAccessControl,
                [role]: {
                    ...settings.attendanceAccessControl[role],
                    [field]: value
                }
            }
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    // Handle Advanced Leave Deduction Settings changes
    const handleAdvancedSettingsChange = (field, value, subField = null, property = null) => {
        let updatedAdvanced;
        if (subField) {
            const currentThreshold = settings.advancedLeaveDeduction.thresholds[subField];
            updatedAdvanced = {
                ...settings.advancedLeaveDeduction,
                thresholds: {
                    ...settings.advancedLeaveDeduction.thresholds,
                    [subField]: property
                        ? { ...currentThreshold, [property]: value }
                        : value
                }
            };
        } else {
            updatedAdvanced = {
                ...settings.advancedLeaveDeduction,
                [field]: value
            };
        }

        const updatedSettings = {
            ...settings,
            advancedLeaveDeduction: updatedAdvanced
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    const handlePaidLeaveConfigChange = (field, value) => {
        const updatedPaidLeave = {
            ...settings.paidLeaveConfig,
            [field]: value
        };
        const updatedSettings = {
            ...settings,
            paidLeaveConfig: updatedPaidLeave
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    // Handle location capture
    const handleCaptureLocation = async () => {
        try {
            const position = await getCurrentPosition();
            // Update both latitude and longitude in a single state update
            const updatedSettings = {
                ...settings,
                attendanceLocation: {
                    ...settings.attendanceLocation,
                    latitude: position.latitude,
                    longitude: position.longitude
                }
            };
            setSettings(updatedSettings);
            checkForChanges(updatedSettings);
            setCurrentLocation(position); // Set the current location state
            toast.success('Location captured successfully');
        } catch (error) {
            console.error('Error capturing location:', error);
            toast.error('Failed to capture location: ' + error.message);
        }
    };

    // Handle settings save
    const handleSaveSettings = async () => {
        if (!validateBatchNames(settings.batches)) {
            toast.error('Batch names must be unique. Please check for duplicate batch names.');
            return;
        }
        if (!validateIntervalNames(settings.intervals)) {
            toast.error('Interval names must be unique. Please check for duplicate interval names.');
            return;
        }
        setSaving(true);
        try {
            const token = getAuthToken();
            console.log('[Settings] Saving settings for subdomain:', subdomain, 'Payload:', settings);
            await api.put(`/settings/${subdomain}`, settings, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            setOriginalSettings(settings);
            setHasChanges(false);
            toast.success('Settings updated successfully');
        } catch (error) {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    // Reset to original settings
    const handleReset = () => {
        setSettings({ ...originalSettings });
        setHasChanges(false);
    };

    // Custom toggle component
    const CustomToggle = ({ checked, onChange, disabled = false }) => (
        <button
            type="button"
            onClick={onChange}
            disabled={disabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${checked ? 'bg-blue-600' : 'bg-gray-200'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'
                    }`}
            />
        </button>
    );

    useEffect(() => {
        if (subdomain && subdomain !== 'main') {
            fetchSettings();
        } else {
            setLoading(false);
        }
        // eslint-disable-next-line
    }, [subdomain]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    const mealConfigs = [
        {
            key: 'breakfast',
            title: 'Breakfast',
            icon: FiSunrise,
            color: 'yellow',
            enabledKey: 'breakfastEnabled',
            openTimeKey: 'breakfastOpenTime',
            closeTimeKey: 'breakfastCloseTime',
            autoSwitchKey: 'breakfastAutoSwitch'
        },
        {
            key: 'lunch',
            title: 'Lunch',
            icon: FiSun,
            color: 'blue',
            enabledKey: 'foodRequestEnabled', // keep for meal service config only
            openTimeKey: 'foodRequestOpenTime',
            closeTimeKey: 'foodRequestCloseTime',
            autoSwitchKey: 'foodRequestAutoSwitch'
        },
        {
            key: 'dinner',
            title: 'Dinner',
            icon: FiMoon,
            color: 'purple',
            enabledKey: 'dinnerEnabled',
            openTimeKey: 'dinnerOpenTime',
            closeTimeKey: 'dinnerCloseTime',
            autoSwitchKey: 'dinnerAutoSwitch'
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between md:justify-end">
                        <div className="mb-4 sm:mb-0 md:hidden">
                            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                                <FiSettings className="mr-3 text-blue-600" />
                                Application Settings
                            </h1>
                            <p className="mt-2 text-gray-600">
                                Configure your application preferences and meal service settings
                            </p>
                        </div>
                        <div className="flex space-x-3">
                            <Button
                                onClick={handleReset}
                                variant="secondary"
                                disabled={!hasChanges || saving}
                                className="flex items-center"
                            >
                                <FiRefreshCw className="mr-2 h-4 w-4" />
                                Reset Changes
                            </Button>
                            <Button
                                onClick={handleSaveSettings}
                                variant="primary"
                                disabled={!hasChanges || saving}
                                className="flex items-center"
                            >
                                {saving ? (
                                    <Spinner size="sm" className="mr-2" />
                                ) : (
                                    <FiSave className="mr-2 h-4 w-4" />
                                )}
                                Update Settings
                            </Button>
                        </div>
                    </div>

                    {/* Unsaved changes alert */}
                    {hasChanges && (
                        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <FiAlertTriangle className="h-5 w-5 text-amber-400" />
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-amber-800">
                                        Unsaved Changes Detected
                                    </h3>
                                    <div className="mt-2 text-sm text-amber-700">
                                        <p>You have unsaved changes. Click "Update Settings" to save them or "Reset Changes" to discard them.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Meal Settings Grid */}
                <div className="mb-8">
                    <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                        <FiClock className="mr-2 text-gray-600" />
                        Meal Service Configuration
                    </h2>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {mealConfigs.map(({ key, title, icon: Icon, color, enabledKey, openTimeKey, closeTimeKey, autoSwitchKey }) => (
                            <Card key={key} className="overflow-hidden hover:shadow-lg transition-shadow duration-200">
                                <div className={`h-2 bg-gradient-to-r ${color === 'yellow' ? 'from-yellow-400 to-orange-400' :
                                    color === 'blue' ? 'from-blue-400 to-cyan-400' :
                                        'from-purple-400 to-pink-400'
                                    }`} />
                                <div className="p-6">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center">
                                            <div className={`p-3 rounded-lg ${color === 'yellow' ? 'bg-yellow-100' :
                                                color === 'blue' ? 'bg-blue-100' :
                                                    'bg-purple-100'
                                                }`}>
                                                <Icon className={`h-6 w-6 ${color === 'yellow' ? 'text-yellow-600' :
                                                    color === 'blue' ? 'text-blue-600' :
                                                        'text-purple-600'
                                                    }`} />
                                            </div>
                                            <h3 className="ml-3 text-lg font-semibold text-gray-900">{title}</h3>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${settings[enabledKey]
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                            }`}>
                                            {settings[enabledKey] ? 'Active' : 'Inactive'}
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        {/* Enable/Disable Toggle */}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="text-sm font-medium text-gray-700">Enable {title}</label>
                                                <p className="text-xs text-gray-500">Allow {title.toLowerCase()} requests</p>
                                            </div>
                                            <CustomToggle
                                                checked={settings[enabledKey]}
                                                onChange={() => handleInputChange({
                                                    target: {
                                                        name: enabledKey,
                                                        type: 'checkbox',
                                                        checked: !settings[enabledKey]
                                                    }
                                                })}
                                            />
                                        </div>

                                        {/* Time Settings */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Open Time
                                                </label>
                                                <input
                                                    type="time"
                                                    name={openTimeKey}
                                                    value={settings[openTimeKey]}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {formatTimeTo12Hour(settings[openTimeKey])}
                                                </p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Close Time
                                                </label>
                                                <input
                                                    type="time"
                                                    name={closeTimeKey}
                                                    value={settings[closeTimeKey]}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {formatTimeTo12Hour(settings[closeTimeKey])}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Auto Switch */}
                                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div>
                                                <label className="text-sm font-medium text-gray-700 flex items-center">
                                                    <FiToggleRight className="mr-2 h-4 w-4" />
                                                    Auto Switch
                                                </label>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Automatically enable/disable based on time
                                                </p>
                                            </div>
                                            <CustomToggle
                                                checked={settings[autoSwitchKey]}
                                                onChange={() => handleInputChange({
                                                    target: {
                                                        name: autoSwitchKey,
                                                        type: 'checkbox',
                                                        checked: !settings[autoSwitchKey]
                                                    }
                                                })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Additional Settings Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Email Settings */}
                    <Card className="hover:shadow-lg transition-shadow duration-200">
                        <div className="h-2 bg-gradient-to-r from-green-400 to-blue-400" />
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-900">
                                <div className="p-2 bg-green-100 rounded-lg mr-3">
                                    <FiMail className="h-5 w-5 text-green-600" />
                                </div>
                                Email Settings
                            </h3>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Email Reports</label>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Send automatic email reports when meals close
                                    </p>
                                </div>
                                <CustomToggle
                                    checked={settings.emailReportsEnabled}
                                    onChange={() => handleInputChange({
                                        target: {
                                            name: 'emailReportsEnabled',
                                            type: 'checkbox',
                                            checked: !settings.emailReportsEnabled
                                        }
                                    })}
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Attendance Settings */}
                    <Card className="hover:shadow-lg transition-shadow duration-200">
                        <div className="h-2 bg-gradient-to-r from-indigo-400 to-purple-400" />
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-900">
                                <div className="p-2 bg-indigo-100 rounded-lg mr-3">
                                    <FiUser className="h-5 w-5 text-indigo-600" />
                                </div>
                                Attendance Settings
                            </h3>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Consider Overtime</label>
                                        <p className="text-xs text-gray-500">Include overtime in calculations</p>
                                    </div>
                                    <CustomToggle
                                        checked={settings.considerOvertime}
                                        onChange={() => handleInputChange({
                                            target: {
                                                name: 'considerOvertime',
                                                type: 'checkbox',
                                                checked: !settings.considerOvertime
                                            }
                                        })}
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Salary Deduction</label>
                                        <p className="text-xs text-gray-500">Enable salary deductions for breaks</p>
                                    </div>
                                    <CustomToggle
                                        checked={settings.deductSalary}
                                        onChange={() => handleInputChange({
                                            target: {
                                                name: 'deductSalary',
                                                type: 'checkbox',
                                                checked: !settings.deductSalary
                                            }
                                        })}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Holiday Settings */}
                    <Card className="hover:shadow-lg transition-shadow duration-200">
                        <div className="h-2 bg-gradient-to-r from-emerald-400 to-teal-400" />
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-900">
                                <div className="p-2 bg-emerald-100 rounded-lg mr-3">
                                    <FiCalendar className="h-5 w-5 text-emerald-600" />
                                </div>
                                Holidays
                            </h3>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Manage Holidays</label>
                                    <p className="text-xs text-gray-500 mt-1">
                                        View and manage company holidays
                                    </p>
                                </div>
                                <Button
                                    onClick={() => setIsHolidayModalOpen(true)}
                                    variant="primary"
                                    size="sm"
                                >
                                    Open
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Location Settings */}
                <Card className="mb-8 hover:shadow-lg transition-shadow duration-200">
                    <div className="h-2 bg-gradient-to-r from-teal-400 to-cyan-400" />
                    <div className="p-6">
                        <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-900">
                            <div className="p-2 bg-teal-100 rounded-lg mr-3">
                                <FiMapPin className="h-5 w-5 text-teal-600" />
                            </div>
                            Location Settings
                        </h3>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Enable Location Restriction</label>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Restrict attendance to a specific location
                                    </p>
                                </div>
                                <CustomToggle
                                    checked={settings.attendanceLocation.enabled}
                                    onChange={() => handleLocationChange('enabled', !settings.attendanceLocation.enabled)}
                                />
                            </div>

                            {settings.attendanceLocation.enabled && (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-700">
                                                Latitude
                                            </label>
                                            <input
                                                type="number"
                                                step="any"
                                                value={settings.attendanceLocation.latitude}
                                                onChange={(e) => handleLocationChange('latitude', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-700">
                                                Longitude
                                            </label>
                                            <input
                                                type="number"
                                                step="any"
                                                value={settings.attendanceLocation.longitude}
                                                onChange={(e) => handleLocationChange('longitude', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-gray-700">
                                            Radius (meters)
                                        </label>
                                        <input
                                            type="number"
                                            min="10"
                                            max="1000"
                                            value={settings.attendanceLocation.radius}
                                            onChange={(e) => handleLocationChange('radius', parseInt(e.target.value) || 100)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <p className="text-xs text-gray-500">
                                            Workers must be within this radius to mark attendance (10-1000 meters)
                                        </p>
                                    </div>

                                    <div className="pt-4">
                                        <Button
                                            onClick={handleCaptureLocation}
                                            variant="secondary"
                                            className="flex items-center"
                                        >
                                            <FiMapPin className="mr-2 h-4 w-4" />
                                            Capture Current Location
                                        </Button>
                                        <p className="text-xs text-gray-500 mt-2">
                                            Your browser will ask for location permission.{' '}
                                            {currentLocation ? (
                                                <span>
                                                    Current location: {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                                                    {currentLocation.accuracy && ` (±${Math.round(currentLocation.accuracy)}m)`}
                                                </span>
                                            ) : (
                                                <span>
                                                    Location set to: {settings.attendanceLocation.latitude.toFixed(6)}, {settings.attendanceLocation.longitude.toFixed(6)}
                                                </span>
                                            )}
                                        </p>
                                    </div>

                                    <div className="pt-2 bg-blue-50 p-3 rounded-lg">
                                        <p className="text-xs text-blue-700">
                                            <strong>Tip:</strong> Enable location restriction to ensure workers can only mark attendance when they are physically present at the designated location.
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Attendance Access Control Settings */}
                <Card className="mb-8 hover:shadow-lg transition-shadow duration-200">
                    <div className="h-2 bg-gradient-to-r from-pink-400 to-red-400" />
                    <div className="p-6">
                        <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-900">
                            <div className="p-2 bg-pink-100 rounded-lg mr-3">
                                <FiToggleLeft className="h-5 w-5 text-pink-600" />
                            </div>
                            Attendance Access Control
                        </h3>
                        <p className="text-sm text-gray-600 mb-6">
                            Control which attendance buttons are visible to Admins and Employees.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Admin Controls */}
                            <div className="space-y-4">
                                <h4 className="text-md font-medium text-gray-800 border-b pb-2">Admin Attendance Page</h4>

                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Show "+ Attendance" Button</label>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Controls visibility of manual attendance button for admins
                                        </p>
                                    </div>
                                    <CustomToggle
                                        checked={settings.attendanceAccessControl?.admin?.addAttendance ?? true}
                                        onChange={() => handleAccessControlChange('admin', 'addAttendance', !(settings.attendanceAccessControl?.admin?.addAttendance ?? true))}
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Show "Face Attendance" Button</label>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Controls visibility of face attendance button for admins
                                        </p>
                                    </div>
                                    <CustomToggle
                                        checked={settings.attendanceAccessControl?.admin?.faceAttendance ?? true}
                                        onChange={() => handleAccessControlChange('admin', 'faceAttendance', !(settings.attendanceAccessControl?.admin?.faceAttendance ?? true))}
                                    />
                                </div>
                            </div>

                            {/* Employee Controls */}
                            <div className="space-y-4">
                                <h4 className="text-md font-medium text-gray-800 border-b pb-2">Employee Dashboard</h4>

                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Show "RFID Attendance"</label>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Controls visibility of RFID attendance card for employees
                                        </p>
                                    </div>
                                    <CustomToggle
                                        checked={settings.attendanceAccessControl?.employee?.rfidAttendance ?? true}
                                        onChange={() => handleAccessControlChange('employee', 'rfidAttendance', !(settings.attendanceAccessControl?.employee?.rfidAttendance ?? true))}
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Show "Face Attendance"</label>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Controls visibility of face attendance card for employees
                                        </p>
                                    </div>
                                    <CustomToggle
                                        checked={settings.attendanceAccessControl?.employee?.faceAttendance ?? true}
                                        onChange={() => handleAccessControlChange('employee', 'faceAttendance', !(settings.attendanceAccessControl?.employee?.faceAttendance ?? true))}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Financial Settings */}
                <Card className="mb-8 hover:shadow-lg transition-shadow duration-200">
                    <div className="h-2 bg-gradient-to-r from-emerald-400 to-teal-400" />
                    <div className="p-6">
                        <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-900">
                            <div className="p-2 bg-emerald-100 rounded-lg mr-3">
                                <FiDollarSign className="h-5 w-5 text-emerald-600" />
                            </div>
                            Financial Configuration
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Permission Time (Minutes)
                                </label>
                                <input
                                    type="number"
                                    name="permissionTimeMinutes"
                                    value={settings.permissionTimeMinutes}
                                    onChange={handleInputChange}
                                    min="0"
                                    max="60"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="text-xs text-gray-500">
                                    Default break permission time allowed per employee
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Salary Deduction per Break (₹)
                                </label>
                                <input
                                    type="number"
                                    name="salaryDeductionPerBreak"
                                    value={settings.salaryDeductionPerBreak}
                                    onChange={handleInputChange}
                                    min="0"
                                    step="0.01"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="text-xs text-gray-500">
                                    Amount deducted for each unauthorized break
                                </p>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Advanced Leave Deduction Settings */}
                <Card className="mb-8 hover:shadow-lg transition-shadow duration-200">
                    <div className="h-2 bg-gradient-to-r from-red-400 to-orange-400" />
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-lg font-semibold flex items-center text-gray-900">
                                <div className="p-2 bg-red-100 rounded-lg mr-3">
                                    <FiDollarSign className="h-5 w-5 text-red-600" />
                                </div>
                                Advanced Leave Deduction System
                            </h3>
                        </div>

                        {/* Global Multiplier Setting */}
                        <div className="mb-8 p-6 bg-red-50/30 rounded-2xl border-2 border-dashed border-red-100">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-lg font-bold text-gray-800 flex items-center">
                                        <FiActivity className="mr-2 text-red-500" />
                                        Penalty Multiplier Configuration
                                    </h4>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Define how many times the daily salary should be deducted when an employee violates the leave policies below.
                                    </p>
                                </div>
                                <div className="flex items-center bg-white p-2 rounded-xl border border-red-200 shadow-sm self-start md:self-center">
                                    <span className="px-3 text-sm font-bold text-gray-500 uppercase tracking-wider">Factor</span>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={settings.advancedLeaveDeduction.deductionMultiplier}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '');
                                                handleAdvancedSettingsChange('deductionMultiplier', val === '' ? '' : parseInt(val));
                                            }}
                                            onBlur={(e) => {
                                                if (e.target.value === '' || parseInt(e.target.value) < 1) {
                                                    handleAdvancedSettingsChange('deductionMultiplier', 1);
                                                }
                                            }}
                                            className="w-24 px-4 py-2 bg-red-50 border-none rounded-lg focus:ring-2 focus:ring-red-500 font-black text-2xl text-red-700 text-center"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xl font-black text-red-400 pointer-events-none">X</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Rule Toggles */}
                            <div className="space-y-6">
                                <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-bold text-gray-800">Attendance Penalty Policy</h4>
                                        <CustomToggle
                                            checked={settings.advancedLeaveDeduction.attendanceRuleEnabled}
                                            onChange={() => handleAdvancedSettingsChange('attendanceRuleEnabled', !settings.advancedLeaveDeduction.attendanceRuleEnabled)}
                                        />
                                    </div>
                                    <p className="text-sm text-gray-500 mb-6">
                                        Apply {settings.advancedLeaveDeduction.deductionMultiplier}X deduction ({settings.advancedLeaveDeduction.deductionMultiplier} days salary for 1 day leave) if attendance falls below thresholds.
                                    </p>

                                    {settings.advancedLeaveDeduction.attendanceRuleEnabled && (
                                        <div className="space-y-6 pt-6 border-t border-gray-200">
                                            {[
                                                { label: 'Company (%)', key: 'company' },
                                                { label: 'Dept (%)', key: 'department' },
                                                { label: 'Employee (%)', key: 'employee' }
                                            ].map((item) => (
                                                <div key={item.key} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                                                    <div className="flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={settings.advancedLeaveDeduction.thresholds[item.key].enabled}
                                                            onChange={(e) => handleAdvancedSettingsChange(null, e.target.checked, item.key, 'enabled')}
                                                            className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded mr-3"
                                                        />
                                                        <label className="text-sm font-bold text-gray-700">{item.label}</label>
                                                    </div>
                                                    <div className="w-24">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            disabled={!settings.advancedLeaveDeduction.thresholds[item.key].enabled}
                                                            value={settings.advancedLeaveDeduction.thresholds[item.key].value}
                                                            onChange={(e) => handleAdvancedSettingsChange(null, parseInt(e.target.value) || 0, item.key, 'value')}
                                                            className={`w-full px-3 py-1.5 border rounded-lg focus:ring-red-500 focus:border-red-500 transition-all font-medium text-gray-700 text-center ${!settings.advancedLeaveDeduction.thresholds[item.key].enabled ? 'bg-gray-100 text-gray-400' : 'bg-white'
                                                                }`}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 h-full">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-bold text-gray-800">Monthly Limit Policy</h4>
                                        <CustomToggle
                                            checked={settings.advancedLeaveDeduction.monthlyLimitRuleEnabled}
                                            onChange={() => handleAdvancedSettingsChange('monthlyLimitRuleEnabled', !settings.advancedLeaveDeduction.monthlyLimitRuleEnabled)}
                                        />
                                    </div>
                                    <p className="text-sm text-gray-500 mb-6">
                                        Penalty of {settings.advancedLeaveDeduction.deductionMultiplier}X deduction applies once an employee exceeds their monthly leave limit.
                                    </p>

                                     {settings.advancedLeaveDeduction.monthlyLimitRuleEnabled && (
                                        <div className="pt-4 border-t border-gray-200 space-y-6">
                                            <div className="flex items-center">
                                                <div className="flex-grow">
                                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Monthly Limit (Days)</label>
                                                    <div className="flex items-center">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={settings.advancedLeaveDeduction.monthlyLimit}
                                                            onChange={(e) => handleAdvancedSettingsChange('monthlyLimit', parseInt(e.target.value))}
                                                            className="w-32 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 transition-all font-medium text-gray-700"
                                                        />
                                                        <span className="ml-3 text-sm text-gray-600 font-medium">days / month</span>
                                                    </div>
                                                </div>
                                                <div className="flex-shrink-0 bg-red-100 p-3 rounded-full">
                                                    <FiClock className="text-red-600 h-6 w-6" />
                                                </div>
                                            </div>

                                            {/* New Permission Toggle */}
                                            <div className="flex items-center justify-between p-3 bg-white border border-red-100 rounded-lg shadow-sm">
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Include Permission in Penalty</label>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        Apply {settings.advancedLeaveDeduction.deductionMultiplier}X penalty to permission/late time if limit is exceeded.
                                                    </p>
                                                </div>
                                                <CustomToggle
                                                    checked={settings.includePermission}
                                                    onChange={() => handleInputChange({
                                                        target: {
                                                            name: 'includePermission',
                                                            type: 'checkbox',
                                                            checked: !settings.includePermission
                                                        }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Note */}
                        <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start">
                            <FiAlertTriangle className="text-blue-500 h-5 w-5 mr-3 mt-0.5" />
                            <div className="text-xs text-blue-700 font-medium leading-relaxed">
                                <p className="font-bold mb-1">How Deduction Factor Works:</p>
                                <ul className="list-disc ml-4 space-y-1">
                                    <li>When enabled, system evaluates BOTH attendance and limits.</li>
                                    <li>If ANY condition fails (e.g. low dept attendance OR limit exceeded), <strong>{settings.advancedLeaveDeduction.deductionMultiplier}X deduction factor</strong> is recorded for that specific leave request.</li>
                                    <li>If <strong>Include Permission in Penalty</strong> is on, the multiplier applies to late arrival/early departure time as well.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Paid Leave Configuration */}
                <Card className="mb-8 hover:shadow-lg transition-shadow duration-200">
                    <div className="h-2 bg-gradient-to-r from-emerald-400 to-teal-400" />
                    <div className="p-6">
                        <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-900">
                            <div className="p-2 bg-emerald-100 rounded-lg mr-3">
                                <FiUserCheck className="h-5 w-5 text-emerald-600" />
                            </div>
                            Paid Leave Configuration
                        </h3>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Enable Paid Leave</label>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Allow employees to apply for paid leaves
                                    </p>
                                </div>
                                <CustomToggle
                                    checked={settings.paidLeaveConfig?.enabled}
                                    onChange={() => handlePaidLeaveConfigChange('enabled', !settings.paidLeaveConfig?.enabled)}
                                />
                            </div>

                            {settings.paidLeaveConfig?.enabled && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm transition-all hover:border-emerald-200">
                                        <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">
                                            Monthly Limit
                                        </label>
                                        <div className="flex items-center">
                                            <input
                                                type="number"
                                                min="0"
                                                max="31"
                                                value={settings.paidLeaveConfig?.leavesPerMonth}
                                                onChange={(e) => handlePaidLeaveConfigChange('leavesPerMonth', parseInt(e.target.value) || 0)}
                                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm font-bold text-gray-900"
                                            />
                                            <span className="ml-3 text-sm text-gray-500 font-black uppercase tracking-wider">Days</span>
                                        </div>
                                        <p className="mt-3 text-[10px] text-gray-400 font-medium uppercase leading-tight">
                                            Max paid leaves per employee / month
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Work Schedule Configuration */}
                <div className="mb-8">
                    <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                        <FiClock className="mr-2 text-gray-600" />
                        Work Schedule Configuration
                    </h2>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Batches Configuration */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                            <div className="h-2 bg-gradient-to-r from-blue-400 to-indigo-400" />
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                        <div className="p-2 bg-blue-100 rounded-lg mr-3">
                                            <FiUser className="h-5 w-5 text-blue-600" />
                                        </div>
                                        Work Batches
                                    </h3>
                                </div>
                                {/* Batches List */}
                                {settings.batches && settings.batches.map((batch, index) => (
                                    <div key={index} className="batch-item border p-4 mb-4 rounded">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-semibold">Batch {index + 1}</h4>
                                            <button
                                                onClick={() => handleRemoveBatch(index)}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                        {/* Batch Name */}
                                        <div className="mb-3">
                                            <label className="block text-sm font-medium mb-1">Batch Name</label>
                                            <input
                                                type="text"
                                                value={batch.batchName}
                                                onChange={(e) => handleBatchChange(index, 'batchName', e.target.value)}
                                                className="w-full p-2 border rounded"
                                                placeholder="Enter batch name"
                                            />
                                        </div>
                                        {/* Factory Worker Toggle */}
                                        <div className="flex items-center justify-between mb-4 border-b pb-4">
                                            <div>
                                                <label className="block text-sm font-medium">Factory Worker</label>
                                                <p className="text-xs text-gray-500">Enable flexible lunch tracking based on required hours</p>
                                            </div>
                                            <label className="switch">
                                                <input
                                                    type="checkbox"
                                                    checked={batch.isFactoryWorkerToggle}
                                                    onChange={(e) => handleBatchChange(index, 'isFactoryWorkerToggle', e.target.checked)}
                                                />
                                                <span className="slider round"></span>
                                            </label>
                                        </div>

                                        {!batch.isFactoryWorkerToggle ? (
                                            <>
                                                {/* Working Hours */}
                                                <div className="grid grid-cols-2 gap-4 mb-3">
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">From</label>
                                                        <input
                                                            type="time"
                                                            value={batch.from}
                                                            onChange={(e) => handleBatchChange(index, 'from', e.target.value)}
                                                            className="w-full p-2 border rounded"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">To</label>
                                                        <input
                                                            type="time"
                                                            value={batch.to}
                                                            onChange={(e) => handleBatchChange(index, 'to', e.target.value)}
                                                            className="w-full p-2 border rounded"
                                                        />
                                                    </div>
                                                </div>
                                                {/* Lunch Hours */}
                                                <div className="grid grid-cols-2 gap-4 mb-3">
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Lunch From</label>
                                                        <input
                                                            type="time"
                                                            value={batch.lunchFrom}
                                                            onChange={(e) => handleBatchChange(index, 'lunchFrom', e.target.value)}
                                                            className="w-full p-2 border rounded"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Lunch To</label>
                                                        <input
                                                            type="time"
                                                            value={batch.lunchTo}
                                                            onChange={(e) => handleBatchChange(index, 'lunchTo', e.target.value)}
                                                            className="w-full p-2 border rounded"
                                                        />
                                                    </div>
                                                </div>
                                                {/* Consider Work at Lunch Toggle */}
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <label className="block text-sm font-medium">Consider Work at Lunch</label>
                                                        <p className="text-xs text-gray-500">Allow employees to work during lunch hours</p>
                                                    </div>
                                                    <label className="switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={batch.isLunchConsider}
                                                            onChange={(e) => handleBatchChange(index, 'isLunchConsider', e.target.checked)}
                                                        />
                                                        <span className="slider round"></span>
                                                    </label>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                {/* Factory Worker specific settings */}
                                                <div className="grid grid-cols-2 gap-4 mb-3">
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Required Hrs Per Day</label>
                                                        <select
                                                            value={batch.requiredWorkingHours}
                                                            onChange={(e) => handleBatchChange(index, 'requiredWorkingHours', Number(e.target.value))}
                                                            className="w-full p-2 border rounded"
                                                        >
                                                            {[...Array(16).keys()].map(i => (
                                                                <option key={i + 4} value={i + 4}>{i + 4} Hours</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Allowed Free Lunch Hrs</label>
                                                        <select
                                                            value={batch.allowedFreeLunchHours}
                                                            onChange={(e) => handleBatchChange(index, 'allowedFreeLunchHours', Number(e.target.value))}
                                                            className="w-full p-2 border rounded"
                                                        >
                                                            <option value="0.5">0.5 Hours (30 mins)</option>
                                                            <option value="1">1 Hour</option>
                                                            <option value="1.5">1.5 Hours</option>
                                                            <option value="2">2 Hours</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="pt-2">
                                                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                                        Note: Lunch From/To times will be ignored. Workers must complete required hours. Break time exceeding allowed free lunch will be deducted.
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                                <button
                                    onClick={handleAddBatch}
                                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                                >
                                    Add New Batch
                                </button>
                            </div>
                        </Card>

                        {/* Intervals Configuration */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                            <div className="h-2 bg-gradient-to-r from-purple-400 to-pink-400" />
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                        <div className="p-2 bg-purple-100 rounded-lg mr-3">
                                            <FiClock className="h-5 w-5 text-purple-600" />
                                        </div>
                                        Break Intervals
                                    </h3>
                                </div>
                                {/* Intervals List */}
                                {settings.intervals && settings.intervals.map((interval, index) => (
                                    <div key={index} className="interval-item border p-4 mb-4 rounded">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-semibold">Interval {index + 1}</h4>
                                            <button
                                                onClick={() => handleRemoveInterval(index)}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                        {/* Interval Name */}
                                        <div className="mb-3">
                                            <label className="block text-sm font-medium mb-1">Interval Name</label>
                                            <input
                                                type="text"
                                                value={interval.intervalName}
                                                onChange={(e) => handleIntervalChange(index, 'intervalName', e.target.value)}
                                                className="w-full p-2 border rounded"
                                                placeholder="Enter interval name"
                                            />
                                        </div>
                                        {/* Interval Times */}
                                        <div className="grid grid-cols-2 gap-4 mb-3">
                                            <div>
                                                <label className="block text-sm font-medium mb-1">From</label>
                                                <input
                                                    type="time"
                                                    value={interval.from}
                                                    onChange={(e) => handleIntervalChange(index, 'from', e.target.value)}
                                                    className="w-full p-2 border rounded"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-1">To</label>
                                                <input
                                                    type="time"
                                                    value={interval.to}
                                                    onChange={(e) => handleIntervalChange(index, 'to', e.target.value)}
                                                    className="w-full p-2 border rounded"
                                                />
                                            </div>
                                        </div>
                                        {/* Consider Work at Breaks Toggle */}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="block text-sm font-medium">Consider Work at Breaks</label>
                                                <p className="text-xs text-gray-500">Allow employees to work during break time</p>
                                            </div>
                                            <label className="switch">
                                                <input
                                                    type="checkbox"
                                                    checked={interval.isBreakConsider}
                                                    onChange={(e) => handleIntervalChange(index, 'isBreakConsider', e.target.checked)}
                                                />
                                                <span className="slider round"></span>
                                            </label>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={handleAddInterval}
                                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                                >
                                    Add New Interval
                                </button>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Settings Summary */}
                {/* <Card className="bg-gradient-to-br from-gray-50 to-gray-100">
                    <div className="p-6">
                        <h3 className="text-lg font-semibold mb-6 text-gray-900">Configuration Summary</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                                    <FiClock className="mr-2 h-4 w-4" />
                                    Meal Services
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Breakfast:</span>
                                        <span className={settings.breakfastEnabled ? 'text-green-600 font-medium' : 'text-red-600'}>
                                            {settings.breakfastEnabled ? '✓ Enabled' : '✗ Disabled'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Lunch:</span>
                                        <span className={settings.foodRequestEnabled ? 'text-green-600 font-medium' : 'text-red-600'}>
                                            {settings.foodRequestEnabled ? '✓ Enabled' : '✗ Disabled'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Dinner:</span>
                                        <span className={settings.dinnerEnabled ? 'text-green-600 font-medium' : 'text-red-600'}>
                                            {settings.dinnerEnabled ? '✓ Enabled' : '✗ Disabled'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                                    <FiToggleRight className="mr-2 h-4 w-4" />
                                    Automation
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Email Reports:</span>
                                        <span className={settings.emailReportsEnabled ? 'text-green-600 font-medium' : 'text-gray-600'}>
                                            {settings.emailReportsEnabled ? '✓ Active' : '✗ Inactive'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Breakfast Auto:</span>
                                        <span className={settings.breakfastAutoSwitch ? 'text-green-600 font-medium' : 'text-gray-600'}>
                                            {settings.breakfastAutoSwitch ? '✓ Active' : '✗ Inactive'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Lunch Auto:</span>
                                        <span className={settings.foodRequestAutoSwitch ? 'text-green-600 font-medium' : 'text-gray-600'}>
                                            {settings.foodRequestAutoSwitch ? '✓ Active' : '✗ Inactive'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Dinner Auto:</span>
                                        <span className={settings.dinnerAutoSwitch ? 'text-green-600 font-medium' : 'text-gray-600'}>
                                            {settings.dinnerAutoSwitch ? '✓ Active' : '✗ Inactive'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                                    <FiDollarSign className="mr-2 h-4 w-4" />
                                    Financial Settings
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Permission Time:</span>
                                        <span className="font-medium">{settings.permissionTimeMinutes} min</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Deduction Amount:</span>
                                        <span className="font-medium">₹{settings.salaryDeductionPerBreak}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Consider Overtime:</span>
                                        <span className={settings.considerOvertime ? 'text-green-600 font-medium' : 'text-gray-600'}>
                                            {settings.considerOvertime ? '✓ Yes' : '✗ No'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Salary Deduction:</span>
                                        <span className={settings.deductSalary ? 'text-green-600 font-medium' : 'text-gray-600'}>
                                            {settings.deductSalary ? '✓ Enabled' : '✗ Disabled'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                                    <FiMapPin className="mr-2 h-4 w-4" />
                                    Location Settings
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Location Restriction:</span>
                                        <span className={settings.attendanceLocation.enabled ? 'text-green-600 font-medium' : 'text-gray-600'}>
                                            {settings.attendanceLocation.enabled ? '✓ Enabled' : '✗ Disabled'}
                                        </span>
                                    </div>
                                    {settings.attendanceLocation.enabled && (
                                        <>
                                            <div className="flex justify-between">
                                                <span>Latitude:</span>
                                                <span className="font-medium">{settings.attendanceLocation.latitude.toFixed(6)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Longitude:</span>
                                                <span className="font-medium">{settings.attendanceLocation.longitude.toFixed(6)}</span>
                                            </div>
                                            {currentLocation && (
                                                <div className="flex justify-between">
                                                    <span>Current Location:</span>
                                                    <span className="font-medium">
                                                        {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                                                        {currentLocation.accuracy && ` (±${Math.round(currentLocation.accuracy)}m)`}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between">
                                                <span>Radius:</span>
                                                <span className="font-medium">{settings.attendanceLocation.radius}m</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </Card> */}
                {/* Holiday Management Modal */}
                <Modal
                    isOpen={isHolidayModalOpen}
                    onClose={() => setIsHolidayModalOpen(false)}
                    title="Holiday Management"
                    size="xl"
                >
                    <div className="max-h-[80vh] overflow-y-auto">
                        <HolidayManagement />
                    </div>
                </Modal>
            </div>
        </div>
    );
};

export default Settings;