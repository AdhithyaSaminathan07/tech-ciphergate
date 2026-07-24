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
    FiUser,
    FiPhone,
    FiToggleLeft,
    FiToggleRight,
    FiPlus,
    FiTrash2,
    FiMapPin,
    FiActivity,
    FiUserCheck,
    FiInfo,
    FiCalendar,
    FiShield,
    FiCopy,
    FiSliders,
    FiMessageCircle,
    FiLogOut,
    FiUpload,
    FiCheckCircle
} from 'react-icons/fi';
import Modal from '../common/Modal';
import HolidayManagement from './HolidayManagement';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import { getAuthToken } from '../../utils/authUtils';
import { getCurrentPosition } from '../../services/geolocationService';

const Settings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [activeTab, setActiveTab] = useState('profile');

    const { subdomain } = useContext(appContext);
    const { user, logout } = useAuth();
    const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);

    // Profile tab local state
    const [profileName, setProfileName] = useState('');
    const [profilePhone, setProfilePhone] = useState('');

    useEffect(() => {
        if (user) {
            setProfileName(user.name || user.username || 'User');
            setProfilePhone(user.phone || user.phoneNumber || '');
        }
    }, [user]);

    const [originalSettings, setOriginalSettings] = useState({});

    const [settings, setSettings] = useState({
        breakfastEnabled: false,
        breakfastOpenTime: '07:00',
        breakfastCloseTime: '09:00',
        breakfastAutoSwitch: false,
        foodRequestEnabled: false,
        foodRequestOpenTime: '12:00',
        foodRequestCloseTime: '14:00',
        foodRequestAutoSwitch: false,
        dinnerEnabled: false,
        dinnerOpenTime: '18:00',
        dinnerCloseTime: '20:00',
        dinnerAutoSwitch: false,
        emailReportsEnabled: false,
        considerOvertime: false,
        deductSalary: true,
        permissionTimeMinutes: 15,
        salaryDeductionPerBreak: 10,
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
        attendanceLocation: {
            enabled: false,
            latitude: 0,
            longitude: 0,
            radius: 100
        },
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
        advancedLeaveDeduction: {
            attendanceRuleEnabled: false,
            monthlyLimitRuleEnabled: false,
            thresholds: {
                company: { value: 80, enabled: true },
                department: { value: 80, enabled: true },
                employee: { value: 90, enabled: true }
            },
            monthlyLimit: 2,
            deductionMultiplier: 2,
            enableUnauthorizedLeavePenalty: true,
            enableUnauthorizedPermissionPenalty: false
        },
        includePermission: false,
        paidLeaveConfig: {
            enabled: false,
            leavesPerMonth: 1
        },
        aiConfig: {
            deepseekApiKey: '',
            claudeApiKey: '',
            aiMaxDailyRequests: 100,
            aiMaxMonthlyRequests: 1000,
            aiDailyRequestCount: 0,
            aiMonthlyRequestCount: 0,
            aiFeaturesEnabled: true
        },
        bugBountyConfig: {
            enabled: true,
            bugReportUrl: 'https://techvaseegrah.com/bug-bounty',
            disclosureMessage: 'Visit to check the bug bounty to earn for each bug 1000',
            popupFrequency: 'every_day'
        },
        unreadMessageFineConfig: {
            enabled: false,
            amountPerMessage: 0,
            thresholdHours: 24
        },
        faceRecognition: {
            detectorType: 'tinyFaceDetector',
            matchingThreshold: 0.50
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

    const checkForChanges = (currentSettings) => {
        const changed = JSON.stringify(currentSettings) !== JSON.stringify(originalSettings);
        setHasChanges(changed);
    };

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
                deductionMultiplier: fetchedSettings.advancedLeaveDeduction?.deductionMultiplier || 2,
                enableUnauthorizedLeavePenalty: fetchedSettings.advancedLeaveDeduction?.enableUnauthorizedLeavePenalty !== undefined ? fetchedSettings.advancedLeaveDeduction.enableUnauthorizedLeavePenalty : true,
                enableUnauthorizedPermissionPenalty: fetchedSettings.advancedLeaveDeduction?.enableUnauthorizedPermissionPenalty !== undefined ? fetchedSettings.advancedLeaveDeduction.enableUnauthorizedPermissionPenalty : false
            };

            const finalSettings = {
                ...settings,
                ...fetchedSettings,
                advancedLeaveDeduction: mappedAdvanced,
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
                },
                aiConfig: {
                    deepseekApiKey: fetchedSettings.aiConfig?.deepseekApiKey || '',
                    claudeApiKey: fetchedSettings.aiConfig?.claudeApiKey || '',
                    aiMaxDailyRequests: fetchedSettings.aiConfig?.aiMaxDailyRequests ?? 100,
                    aiMaxMonthlyRequests: fetchedSettings.aiConfig?.aiMaxMonthlyRequests ?? 1000,
                    aiDailyRequestCount: fetchedSettings.aiConfig?.aiDailyRequestCount || 0,
                    aiMonthlyRequestCount: fetchedSettings.aiConfig?.aiMonthlyRequestCount || 0,
                    aiFeaturesEnabled: fetchedSettings.aiConfig?.aiFeaturesEnabled ?? true
                },
                bugBountyConfig: {
                    enabled: fetchedSettings.bugBountyConfig?.enabled ?? false,
                    bugReportUrl: fetchedSettings.bugBountyConfig?.bugReportUrl || 'https://techvaseegrah.com/bug-bounty',
                    disclosureMessage: fetchedSettings.bugBountyConfig?.disclosureMessage || 'Visit to check the bug bounty to earn for each bug 1000',
                    popupFrequency: fetchedSettings.bugBountyConfig?.popupFrequency || 'every_day'
                },
                unreadMessageFineConfig: {
                    enabled: fetchedSettings.unreadMessageFineConfig?.enabled ?? false,
                    amountPerMessage: fetchedSettings.unreadMessageFineConfig?.amountPerMessage ?? 0,
                    thresholdHours: fetchedSettings.unreadMessageFineConfig?.thresholdHours ?? 24
                },
                faceRecognition: {
                    detectorType: fetchedSettings.faceRecognition?.detectorType || 'tinyFaceDetector',
                    matchingThreshold: fetchedSettings.faceRecognition?.matchingThreshold ?? 0.50
                }
            };

            setSettings(finalSettings);
            setOriginalSettings(finalSettings);
            setHasChanges(false);
        } catch (error) {
            if (error.response?.status === 404) {
                setOriginalSettings(settings);
            } else {
                toast.error('Failed to fetch settings');
            }
        } finally {
            setLoading(false);
        }
    };

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

    const handleRemoveBatch = (index) => {
        const updatedBatches = settings.batches.filter((_, i) => i !== index);
        const updatedSettings = {
            ...settings,
            batches: updatedBatches
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

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

    const handleRemoveInterval = (index) => {
        const updatedIntervals = settings.intervals.filter((_, i) => i !== index);
        const updatedSettings = {
            ...settings,
            intervals: updatedIntervals
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    const handleLocationChange = (field, value) => {
        const updatedSettings = {
            ...settings,
            attendanceLocation: {
                ...settings.attendanceLocation,
                [field]: value
            }
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

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

    const handleUnreadFineChange = (field, value) => {
        const updatedFineConfig = {
            ...settings.unreadMessageFineConfig,
            [field]: value
        };
        const updatedSettings = {
            ...settings,
            unreadMessageFineConfig: updatedFineConfig
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    const handleFaceRecognitionChange = (field, value) => {
        const updatedFaceRecognition = {
            ...settings.faceRecognition,
            [field]: value
        };
        const updatedSettings = {
            ...settings,
            faceRecognition: updatedFaceRecognition
        };
        setSettings(updatedSettings);
        checkForChanges(updatedSettings);
    };

    const handleCaptureLocation = async () => {
        try {
            const position = await getCurrentPosition();
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
            setCurrentLocation(position);
            toast.success('Location captured successfully');
        } catch (error) {
            console.error('Error capturing location:', error);
            toast.error('Failed to capture location: ' + error.message);
        }
    };

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
            const hasBountyChanges = JSON.stringify(settings.bugBountyConfig) !== JSON.stringify(originalSettings.bugBountyConfig);
            const updatedBountyConfig = {
                ...settings.bugBountyConfig,
                enabled: settings.bugBountyConfig?.popupFrequency !== 'disabled',
                lastUpdated: hasBountyChanges ? new Date().toISOString() : (settings.bugBountyConfig?.lastUpdated || new Date().toISOString())
            };
            const payload = {
                ...settings,
                bugBountyConfig: updatedBountyConfig
            };
            await api.put(`/settings/${subdomain}`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            setSettings(payload);
            setOriginalSettings(payload);
            setHasChanges(false);
            toast.success('Settings updated successfully');
        } catch (error) {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setSettings({ ...originalSettings });
        setHasChanges(false);
    };

    // Sleek, bulletproof custom toggle button component with strict inline pixel dimensions
    const CustomToggle = ({ checked, onChange, disabled = false }) => (
        <button
            type="button"
            onClick={onChange}
            disabled={disabled}
            style={{
                width: '44px',
                height: '24px',
                minWidth: '44px',
                minHeight: '24px',
                maxWidth: '44px',
                maxHeight: '24px',
                padding: 0,
                boxSizing: 'border-box'
            }}
            className={`relative inline-flex flex-shrink-0 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#006666]/30 ${checked ? 'bg-[#006666]' : 'bg-slate-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span
                style={{
                    width: '16px',
                    height: '16px',
                    minWidth: '16px',
                    minHeight: '16px'
                }}
                className={`inline-block transform rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`}
            />
        </button>
    );

    const [isBugBountyExpanded, setIsBugBountyExpanded] = useState(true);
    const [isCopied, setIsCopied] = useState(false);

    const handleBugBountyChange = (field, value) => {
        const updated = {
            ...settings,
            bugBountyConfig: {
                ...(settings.bugBountyConfig || {}),
                [field]: value,
                enabled: field === 'popupFrequency' ? value !== 'disabled' : (settings.bugBountyConfig?.popupFrequency !== 'disabled')
            }
        };
        setSettings(updated);
        checkForChanges(updated);
    };

    const handleCopyUrl = () => {
        const url = settings.bugBountyConfig?.bugReportUrl || 'https://techvaseegrah.com/bug-bounty';
        navigator.clipboard.writeText(url);
        setIsCopied(true);
        toast.success('URL copied to clipboard!');
        setTimeout(() => setIsCopied(false), 2000);
    };

    // Helper function to scroll mobile category pill container HORIZONTALLY ONLY (without jumping vertical page scroll)
    const scrollToMobilePill = (id) => {
        const pill = document.getElementById(`mobile-pill-${id}`);
        const container = document.getElementById('mobile-pill-container');
        if (pill && container) {
            const pillLeft = pill.offsetLeft;
            const pillWidth = pill.offsetWidth;
            const containerWidth = container.offsetWidth;
            const targetScrollLeft = pillLeft - (containerWidth / 2) + (pillWidth / 2);
            container.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
        }
    };

    // Smooth scroll to target section when clicking navigation tab
    const scrollToSection = (id) => {
        if (id === 'holidays') {
            setIsHolidayModalOpen(true);
            return;
        }
        setActiveTab(id);

        // Auto-scroll target section in document
        const target = document.getElementById(`section-${id}`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Auto-scroll active pill horizontally ONLY
        scrollToMobilePill(id);
    };

    // Observe active section on scroll
    useEffect(() => {
        if (loading) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const sectionId = entry.target.id.replace('section-', '');
                        setActiveTab(sectionId);
                        scrollToMobilePill(sectionId);
                    }
                });
            },
            {
                root: null,
                rootMargin: '-20% 0px -60% 0px',
                threshold: 0
            }
        );

        const sectionIds = ['profile', 'meal', 'batches', 'intervals', 'location', 'face', 'access', 'whatsapp', 'advanced', 'ai', 'bounty'];
        sectionIds.forEach((id) => {
            const el = document.getElementById(`section-${id}`);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [loading]);

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
            <div className="flex justify-center items-center min-h-[400px]">
                <Spinner size="lg" />
            </div>
        );
    }

    const navItems = [
        { id: 'profile', label: 'Profile', icon: FiUser },
        { id: 'meal', label: 'Meal Service', icon: FiSunrise },
        { id: 'batches', label: 'Work Batches', icon: FiClock },
        { id: 'intervals', label: 'Break Intervals', icon: FiSliders },
        { id: 'location', label: 'Location & GPS', icon: FiMapPin },
        { id: 'face', label: 'Biometrics & Face', icon: FiUserCheck },
        { id: 'access', label: 'Access Control', icon: FiToggleLeft },
        { id: 'whatsapp', label: 'WhatsApp SLA', icon: FiMessageCircle },
        { id: 'advanced', label: 'Leave Multipliers', icon: FiActivity },
        { id: 'ai', label: 'AI & Second Brain', icon: FiInfo },
        { id: 'bounty', label: 'Bug Bounty', icon: FiShield },
        { id: 'holidays', label: 'Holidays', icon: FiCalendar }
    ];

    const mealConfigs = [
        {
            key: 'breakfast',
            title: 'Breakfast',
            icon: FiSunrise,
            color: 'from-amber-400 to-orange-400',
            bgColor: 'bg-amber-50 text-amber-600',
            enabledKey: 'breakfastEnabled',
            openTimeKey: 'breakfastOpenTime',
            closeTimeKey: 'breakfastCloseTime',
            autoSwitchKey: 'breakfastAutoSwitch'
        },
        {
            key: 'lunch',
            title: 'Lunch',
            icon: FiSun,
            color: 'from-cyan-400 to-teal-500',
            bgColor: 'bg-cyan-50 text-cyan-600',
            enabledKey: 'foodRequestEnabled',
            openTimeKey: 'foodRequestOpenTime',
            closeTimeKey: 'foodRequestCloseTime',
            autoSwitchKey: 'foodRequestAutoSwitch'
        },
        {
            key: 'dinner',
            title: 'Dinner',
            icon: FiMoon,
            color: 'from-purple-400 to-indigo-500',
            bgColor: 'bg-purple-50 text-purple-600',
            enabledKey: 'dinnerEnabled',
            openTimeKey: 'dinnerOpenTime',
            closeTimeKey: 'dinnerCloseTime',
            autoSwitchKey: 'dinnerAutoSwitch'
        }
    ];

    const loggedInEmail = user?.email || 'admin1234@gmail.com';
    const displayName = user?.name || user?.username || 'User';

    return (
        <div className="w-full min-h-screen bg-[#f8fafc] text-slate-800 font-sans pb-12">
            <div className="w-full max-w-[1750px] mx-auto px-2 sm:px-6 lg:px-8">

                {/* DESKTOP & MOBILE RESPONSIVE STICKY HEADER CONTAINER */}
                <div className="sticky top-0 z-30 bg-[#f8fafc] pt-2 pb-2 mb-2 sm:mb-3">
                    <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-xs border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
                        <div className="flex items-center justify-between w-full md:w-auto">
                            <div>
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 sm:p-2 bg-[#006666]/10 text-[#006666] rounded-lg sm:rounded-xl">
                                        <FiSettings className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.2]" />
                                    </div>
                                    <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900">
                                        Settings
                                    </h1>
                                </div>
                                <p className="mt-0.5 text-xs text-slate-500 font-medium hidden sm:block">
                                    Manage your account preferences and app behavior
                                </p>
                                <div className="mt-0.5 inline-flex items-center text-[11px] sm:text-xs font-semibold text-slate-600">
                                    Logged in as:&nbsp;
                                    <span className="font-bold text-[#006666] bg-[#006666]/10 px-1.5 sm:px-2 py-0.5 rounded-md truncate max-w-[160px] sm:max-w-none">{loggedInEmail}</span>
                                </div>
                            </div>
                        </div>

                        {/* Responsive Action Buttons: Ultra-Compact Grid on Mobile, Flex Row on Tablet/Desktop */}
                        <div className="grid grid-cols-3 sm:flex items-center gap-1.5 sm:gap-2.5 w-full md:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                            {logout && (
                                <button
                                    type="button"
                                    onClick={logout}
                                    className="flex items-center justify-center gap-1 px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] sm:text-xs font-bold transition-all shadow-2xs active:scale-95"
                                >
                                    <FiLogOut className="h-3.5 w-3.5 text-slate-500" />
                                    <span className="truncate">Sign Out</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleReset}
                                disabled={!hasChanges || saving}
                                className="flex items-center justify-center gap-1 px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] sm:text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs active:scale-95"
                            >
                                <FiRefreshCw className="h-3.5 w-3.5" />
                                <span className="truncate">Reset</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveSettings}
                                disabled={!hasChanges || saving}
                                className="flex items-center justify-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-[#006666] hover:bg-[#004d4d] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-[#006666]/15 active:scale-95"
                            >
                                {saving ? (
                                    <Spinner size="sm" color="white" />
                                ) : (
                                    <FiSave className="h-3.5 w-3.5" />
                                )}
                                <span className="truncate">Update</span>
                            </button>
                        </div>
                    </div>

                    {hasChanges && (
                        <div className="mt-2 bg-amber-50/95 border border-amber-200 rounded-xl p-2 sm:p-2.5 shadow-2xs flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FiAlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                                <div>
                                    <h3 className="text-xs font-bold text-amber-900">Unsaved Changes Detected</h3>
                                    <p className="text-[10px] sm:text-[11px] text-amber-700 font-medium">Click "Update" to save your updates or "Reset" to revert.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* MOBILE HORIZONTAL PILL NAV CONTAINER (PINNED STICKY BELOW MAIN HEADER WITH PURE HORIZONTAL SCROLL) */}
                <div className="lg:hidden sticky top-[4.2rem] z-20 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl p-1.5 mb-3.5 shadow-xs">
                    <div id="mobile-pill-container" className="overflow-x-auto flex items-center gap-1.5 no-scrollbar">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeTab === item.id;
                            return (
                                <button
                                    key={item.id}
                                    id={`mobile-pill-${item.id}`}
                                    type="button"
                                    onClick={() => scrollToSection(item.id)}
                                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${isActive
                                            ? 'bg-[#006666] text-white shadow-xs font-bold'
                                            : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
                                        }`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Two-Column Layout (Vertical Sticky Sidebar strictly for Desktop lg: screens >= 1024px) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">

                    {/* DESKTOP VERTICAL STICKY SIDEBAR (Hidden on mobile, block on lg:) */}
                    <div className="hidden lg:block lg:col-span-3 lg:sticky lg:top-[8rem] z-20 self-start bg-white rounded-2xl p-2.5 shadow-xs border border-slate-100/90 max-h-[calc(100vh-9rem)] overflow-y-auto custom-sidebar-scroll">
                        <div className="flex flex-col gap-1">
                            {navItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => scrollToSection(item.id)}
                                        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${isActive
                                                ? 'bg-[#006666] text-white shadow-md shadow-[#006666]/20 font-bold'
                                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                            }`}
                                    >
                                        <Icon className={`h-4 w-4 stroke-[2] ${isActive ? 'text-white' : 'text-slate-400'}`} />
                                        <span>{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Column: All Settings Sections Rendered Continuously */}
                    <div className="lg:col-span-9 bg-white rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs border border-slate-100/90 space-y-8 sm:space-y-12">

                        {/* SECTION 1: PROFILE SETTINGS */}
                        <section id="section-profile" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <FiUser className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                        Profile Settings
                                    </h2>
                                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                        Update your personal credentials and account info saved in database
                                    </p>
                                </div>
                            </div>

                            {/* Premium Profile Banner Card */}
                            <div className="bg-gradient-to-r from-slate-900 via-[#004d4d] to-[#006666] text-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-md mb-5 sm:mb-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />

                                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 relative z-10">
                                    <div className="relative group flex-shrink-0">
                                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-md text-white flex items-center justify-center font-black text-2xl sm:text-3xl shadow-inner border-2 border-white/20">
                                            {displayName.charAt(0).toUpperCase()}
                                        </div>
                                        <label
                                            htmlFor="profile-photo-upload"
                                            className="absolute -bottom-1 -right-1 p-1.5 sm:p-2 bg-white text-[#006666] hover:bg-slate-100 rounded-lg sm:rounded-xl shadow-lg border border-slate-200 cursor-pointer transition-transform hover:scale-110"
                                            title="Upload Profile Picture"
                                        >
                                            <FiUpload className="h-3 w-3 sm:h-3.5 sm:w-3.5 stroke-[2.5]" />
                                            <input id="profile-photo-upload" type="file" accept="image/*" className="hidden" />
                                        </label>
                                    </div>

                                    <div className="text-center sm:text-left flex-grow">
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                            <h3 className="text-lg sm:text-xl font-black tracking-wide text-white">{displayName}</h3>
                                            <span className="bg-white/20 backdrop-blur-md text-white text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider px-2 sm:px-2.5 py-0.5 rounded-full border border-white/20">
                                                Administrator
                                            </span>
                                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                                            </span>
                                        </div>
                                        <p className="text-xs text-teal-100 font-medium mt-1">{loggedInEmail}</p>
                                        <p className="text-[10px] sm:text-[11px] text-teal-200/80 mt-1.5 font-normal">
                                            Profile photo will be visible across the entire platform
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Profile Form Fields */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 max-w-4xl">
                                <div>
                                    <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Display Name
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                            <FiUser className="h-4 w-4" />
                                        </div>
                                        <input
                                            type="text"
                                            value={profileName}
                                            onChange={(e) => setProfileName(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666] transition-all"
                                            placeholder="Enter display name"
                                        />
                                    </div>
                                    <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">Saved automatically to database</p>
                                </div>

                                <div>
                                    <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Phone Number
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                            <FiPhone className="h-4 w-4" />
                                        </div>
                                        <input
                                            type="tel"
                                            value={profilePhone}
                                            onChange={(e) => setProfilePhone(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666] transition-all"
                                            placeholder="Enter phone number"
                                        />
                                    </div>
                                    <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">Used for notifications and SMS alerts</p>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Email Address (Read Only)
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                            <FiMail className="h-4 w-4" />
                                        </div>
                                        <input
                                            type="email"
                                            readOnly
                                            value={loggedInEmail}
                                            className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500 cursor-not-allowed"
                                        />
                                    </div>
                                    <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">Managed via authentication provider</p>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 2: MEAL SERVICE CONFIGURATION */}
                        <section id="section-meal" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100">
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <FiSunrise className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    Meal Service Configuration
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                    Manage timings, toggles, and auto-switch schedules for company meals
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                                {mealConfigs.map(({ key, title, icon: Icon, color, bgColor, enabledKey, openTimeKey, closeTimeKey, autoSwitchKey }) => (
                                    <div key={key} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden hover:border-[#006666]/40 transition-all duration-200">
                                        <div className={`h-1.5 bg-gradient-to-r ${color}`} />
                                        <div className="p-3.5 sm:p-5">
                                            <div className="flex items-center justify-between mb-3 sm:mb-4">
                                                <div className="flex items-center gap-2 sm:gap-2.5">
                                                    <div className={`p-1.5 sm:p-2 rounded-xl ${bgColor}`}>
                                                        <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                                                    </div>
                                                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">{title}</h3>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${settings[enabledKey] ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                                                    {settings[enabledKey] ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between gap-3 p-2.5 bg-slate-50/80 rounded-xl min-w-0">
                                                    <div className="min-w-0 flex-1">
                                                        <label className="text-xs font-bold text-slate-800 block">Enable {title}</label>
                                                        <p className="text-[10px] text-slate-500">Allow {title.toLowerCase()} requests</p>
                                                    </div>
                                                    <div className="flex-shrink-0 shrink-0">
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
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 mb-1">Open Time</label>
                                                        <input
                                                            type="time"
                                                            name={openTimeKey}
                                                            value={settings[openTimeKey]}
                                                            onChange={handleInputChange}
                                                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                                        />
                                                        <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 font-medium">
                                                            {formatTimeTo12Hour(settings[openTimeKey])}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 mb-1">Close Time</label>
                                                        <input
                                                            type="time"
                                                            name={closeTimeKey}
                                                            value={settings[closeTimeKey]}
                                                            onChange={handleInputChange}
                                                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                                        />
                                                        <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 font-medium">
                                                            {formatTimeTo12Hour(settings[closeTimeKey])}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between gap-3 p-2.5 bg-slate-50/80 rounded-xl min-w-0">
                                                    <div className="min-w-0 flex-1">
                                                        <label className="text-xs font-bold text-slate-800 block">Auto Switch</label>
                                                        <p className="text-[10px] text-slate-500">Toggle active state based on time</p>
                                                    </div>
                                                    <div className="flex-shrink-0 shrink-0">
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
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* SECTION 3: WORK BATCHES & SHIFT SCHEDULES */}
                        <section id="section-batches" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <FiClock className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                        Work Batches & Shift Schedules
                                    </h2>
                                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                        Define employee shift timings, factory worker modes, and lunch hour rules
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddBatch}
                                    className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-[#006666] text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold hover:bg-[#004d4d] transition-all shadow-2xs active:scale-95"
                                >
                                    <FiPlus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Add New Batch</span><span className="sm:hidden">Add</span>
                                </button>
                            </div>

                            <div className="space-y-4">
                                {settings.batches && settings.batches.map((batch, index) => (
                                    <div key={index} className="bg-slate-50/60 border border-slate-200/80 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl relative">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-xs font-bold text-[#006666] uppercase tracking-wider bg-[#006666]/10 px-2.5 py-0.5 rounded-md">
                                                Batch #{index + 1}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveBatch(index)}
                                                className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1 hover:underline"
                                            >
                                                <FiTrash2 className="h-3.5 w-3.5" /> Remove
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                            <div>
                                                <label className="block text-[11px] sm:text-xs font-bold text-slate-700 mb-1">Batch Name</label>
                                                <input
                                                    type="text"
                                                    value={batch.batchName}
                                                    onChange={(e) => handleBatchChange(index, 'batchName', e.target.value)}
                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                                    placeholder="Enter batch name"
                                                />
                                            </div>

                                            <div className="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 rounded-xl min-w-0">
                                                <div className="min-w-0 flex-1">
                                                    <label className="text-xs font-bold text-slate-800 block">Factory Worker Mode</label>
                                                    <p className="text-[10px] text-slate-500 leading-tight">Flexible lunch tracking based on total required hours</p>
                                                </div>
                                                <div className="flex-shrink-0 shrink-0">
                                                    <CustomToggle
                                                        checked={batch.isFactoryWorkerToggle}
                                                        onChange={() => handleBatchChange(index, 'isFactoryWorkerToggle', !batch.isFactoryWorkerToggle)}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {!batch.isFactoryWorkerToggle ? (
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 bg-white p-3 rounded-xl border border-slate-200/60">
                                                <div>
                                                    <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 mb-1">Shift From</label>
                                                    <input
                                                        type="time"
                                                        value={batch.from}
                                                        onChange={(e) => handleBatchChange(index, 'from', e.target.value)}
                                                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 mb-1">Shift To</label>
                                                    <input
                                                        type="time"
                                                        value={batch.to}
                                                        onChange={(e) => handleBatchChange(index, 'to', e.target.value)}
                                                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 mb-1">Lunch From</label>
                                                    <input
                                                        type="time"
                                                        value={batch.lunchFrom}
                                                        onChange={(e) => handleBatchChange(index, 'lunchFrom', e.target.value)}
                                                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 mb-1">Lunch To</label>
                                                    <input
                                                        type="time"
                                                        value={batch.lunchTo}
                                                        onChange={(e) => handleBatchChange(index, 'lunchTo', e.target.value)}
                                                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-200/60">
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Required Daily Hours</label>
                                                    <select
                                                        value={batch.requiredWorkingHours}
                                                        onChange={(e) => handleBatchChange(index, 'requiredWorkingHours', Number(e.target.value))}
                                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                                                    >
                                                        {[...Array(16).keys()].map(i => (
                                                            <option key={i + 4} value={i + 4}>{i + 4} Hours</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Allowed Free Lunch Time</label>
                                                    <select
                                                        value={batch.allowedFreeLunchHours}
                                                        onChange={(e) => handleBatchChange(index, 'allowedFreeLunchHours', Number(e.target.value))}
                                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                                                    >
                                                        <option value="0.5">0.5 Hours (30 mins)</option>
                                                        <option value="1">1 Hour</option>
                                                        <option value="1.5">1.5 Hours</option>
                                                        <option value="2">2 Hours</option>
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* SECTION 4: BREAK INTERVALS */}
                        <section id="section-intervals" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <FiSliders className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                        Break Intervals
                                    </h2>
                                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                        Configure daily interval breaks and work-during-break rules
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddInterval}
                                    className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-[#006666] text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold hover:bg-[#004d4d] transition-all shadow-2xs active:scale-95"
                                >
                                    <FiPlus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Add New Interval</span><span className="sm:hidden">Add</span>
                                </button>
                            </div>

                            <div className="space-y-3.5">
                                {settings.intervals && settings.intervals.map((interval, index) => (
                                    <div key={index} className="bg-slate-50/60 border border-slate-200/80 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-md">
                                                Interval #{index + 1}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveInterval(index)}
                                                className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1 hover:underline"
                                            >
                                                <FiTrash2 className="h-3.5 w-3.5" /> Remove
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Interval Name</label>
                                                <input
                                                    type="text"
                                                    value={interval.intervalName}
                                                    onChange={(e) => handleIntervalChange(index, 'intervalName', e.target.value)}
                                                    className="w-full px-3 py-1.5 sm:py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                                                    placeholder="Enter interval name"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-700 mb-1">From</label>
                                                <input
                                                    type="time"
                                                    value={interval.from}
                                                    onChange={(e) => handleIntervalChange(index, 'from', e.target.value)}
                                                    className="w-full px-2.5 py-1.5 sm:py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-700 mb-1">To</label>
                                                <input
                                                    type="time"
                                                    value={interval.to}
                                                    onChange={(e) => handleIntervalChange(index, 'to', e.target.value)}
                                                    className="w-full px-2.5 py-1.5 sm:py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* SECTION 5: LOCATION & GPS GEOFENCING */}
                        <section id="section-location" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100">
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <FiMapPin className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    Location & GPS Geofencing
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                    Restrict attendance punch-in to specific geographical coordinates
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl min-w-0">
                                    <div className="min-w-0 flex-1">
                                        <label className="text-xs font-bold text-slate-900 block">Enable Geofencing Restriction</label>
                                        <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 leading-tight">Workers must be physically located within office radius to mark attendance</p>
                                    </div>
                                    <div className="flex-shrink-0 shrink-0">
                                        <CustomToggle
                                            checked={settings.attendanceLocation.enabled}
                                            onChange={() => handleLocationChange('enabled', !settings.attendanceLocation.enabled)}
                                        />
                                    </div>
                                </div>

                                {settings.attendanceLocation.enabled && (
                                    <div className="space-y-3.5 bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200/80">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Latitude</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={settings.attendanceLocation.latitude}
                                                    onChange={(e) => handleLocationChange('latitude', parseFloat(e.target.value) || 0)}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Longitude</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={settings.attendanceLocation.longitude}
                                                    onChange={(e) => handleLocationChange('longitude', parseFloat(e.target.value) || 0)}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Allowed Radius (meters)</label>
                                            <input
                                                type="number"
                                                min="10"
                                                max="1000"
                                                value={settings.attendanceLocation.radius}
                                                onChange={(e) => handleLocationChange('radius', parseInt(e.target.value) || 100)}
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                                            />
                                            <p className="text-[10px] text-slate-400 mt-1">Allowed range: 10 to 1000 meters</p>
                                        </div>

                                        <div className="pt-1 flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
                                            <button
                                                type="button"
                                                onClick={handleCaptureLocation}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-2xs active:scale-95"
                                            >
                                                <FiMapPin className="h-3.5 w-3.5" /> Capture Current Location
                                            </button>
                                            {currentLocation && (
                                                <span className="text-xs text-emerald-600 font-bold">
                                                    Captured: {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* SECTION 6: BIOMETRICS & FACE RECOGNITION */}
                        <section id="section-face" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100">
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <FiUserCheck className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    Biometrics & Face Recognition
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                    Tune face detection models, recognition speed, and match distance thresholds
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                                    <div>
                                        <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                            Detector Model
                                        </label>
                                        <select
                                            value={settings.faceRecognition?.detectorType || 'tinyFaceDetector'}
                                            onChange={(e) => handleFaceRecognitionChange('detectorType', e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                        >
                                            <option value="tinyFaceDetector">High Speed (Tiny Face Detector)</option>
                                            <option value="ssdMobilenetv1">High Accuracy (SSD MobileNet V1)</option>
                                        </select>
                                        <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1 font-normal">
                                            {settings.faceRecognition?.detectorType === 'ssdMobilenetv1'
                                                ? 'High precision deep-learning model for high accuracy requirements.'
                                                : 'Ultralight model (~190KB) optimized for fast browser performance.'}
                                        </p>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-1.5">
                                            <label className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                Similarity Threshold
                                            </label>
                                            <span className="font-mono text-[#006666] font-bold bg-[#006666]/10 px-2 py-0.5 rounded text-xs">
                                                {(settings.faceRecognition?.matchingThreshold ?? 0.50).toFixed(2)}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.10"
                                            max="0.80"
                                            step="0.05"
                                            value={settings.faceRecognition?.matchingThreshold ?? 0.50}
                                            onChange={(e) => handleFaceRecognitionChange('matchingThreshold', parseFloat(e.target.value))}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#006666]"
                                        />
                                        <div className="flex justify-between text-[9px] sm:text-[10px] font-bold text-slate-400 mt-1">
                                            <span>STRICT (0.10)</span>
                                            <span className="text-[#006666]">OPTIMAL (0.50)</span>
                                            <span>RELAXED (0.80)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 7: ACCESS CONTROL */}
                        <section id="section-access" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100">
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <FiToggleLeft className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    Attendance Access Controls
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                    Toggle visibility of specific attendance action buttons for Admin and Employee roles
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                                <div className="bg-slate-50/80 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-3 font-sans">
                                    <h3 className="text-xs font-bold text-slate-900 pb-2 border-b border-slate-200">Admin Attendance Dashboard</h3>
                                    <div className="flex items-center justify-between gap-3 min-w-0">
                                        <div className="min-w-0 flex-1">
                                            <label className="text-xs font-bold text-slate-800 block">Show "+ Attendance" Button</label>
                                            <p className="text-[10px] text-slate-500 leading-tight">Allow manual attendance entry by admins</p>
                                        </div>
                                        <div className="flex-shrink-0 shrink-0">
                                            <CustomToggle
                                                checked={settings.attendanceAccessControl?.admin?.addAttendance ?? true}
                                                onChange={() => handleAccessControlChange('admin', 'addAttendance', !(settings.attendanceAccessControl?.admin?.addAttendance ?? true))}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 pt-1 min-w-0">
                                        <div className="min-w-0 flex-1">
                                            <label className="text-xs font-bold text-slate-800 block">Show "Face Attendance" Button</label>
                                            <p className="text-[10px] text-slate-500 leading-tight">Allow admin biometric face scanner launch</p>
                                        </div>
                                        <div className="flex-shrink-0 shrink-0">
                                            <CustomToggle
                                                checked={settings.attendanceAccessControl?.admin?.faceAttendance ?? true}
                                                onChange={() => handleAccessControlChange('admin', 'faceAttendance', !(settings.attendanceAccessControl?.admin?.faceAttendance ?? true))}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-50/80 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-3 font-sans">
                                    <h3 className="text-xs font-bold text-slate-900 pb-2 border-b border-slate-200">Employee Dashboard</h3>
                                    <div className="flex items-center justify-between gap-3 min-w-0">
                                        <div className="min-w-0 flex-1">
                                            <label className="text-xs font-bold text-slate-800 block">Show "RFID Attendance"</label>
                                            <p className="text-[10px] text-slate-500 leading-tight">Enable RFID tap card access for workers</p>
                                        </div>
                                        <div className="flex-shrink-0 shrink-0">
                                            <CustomToggle
                                                checked={settings.attendanceAccessControl?.employee?.rfidAttendance ?? true}
                                                onChange={() => handleAccessControlChange('employee', 'rfidAttendance', !(settings.attendanceAccessControl?.employee?.rfidAttendance ?? true))}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 pt-1 min-w-0">
                                        <div className="min-w-0 flex-1">
                                            <label className="text-xs font-bold text-slate-800 block">Show "Face Attendance"</label>
                                            <p className="text-[10px] text-slate-500 leading-tight">Enable self-serve face punch-in for workers</p>
                                        </div>
                                        <div className="flex-shrink-0 shrink-0">
                                            <CustomToggle
                                                checked={settings.attendanceAccessControl?.employee?.faceAttendance ?? true}
                                                onChange={() => handleAccessControlChange('employee', 'faceAttendance', !(settings.attendanceAccessControl?.employee?.faceAttendance ?? true))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 8: WHATSAPP SLA FINE */}
                        <section id="section-whatsapp" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100">
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <FiMessageCircle className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    Unread WhatsApp Message Fine SLA
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                    Automatically fine assigned staff when a customer WhatsApp message remains unread beyond the SLA window
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl min-w-0">
                                    <div className="min-w-0 flex-1">
                                        <label className="text-xs font-bold text-slate-900 block">Enable Unread Message Fine</label>
                                        <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 leading-tight">Enforce SLA penalties for unreplied customer conversations</p>
                                    </div>
                                    <div className="flex-shrink-0 shrink-0">
                                        <CustomToggle
                                            checked={settings.unreadMessageFineConfig?.enabled ?? false}
                                            onChange={() => handleUnreadFineChange('enabled', !(settings.unreadMessageFineConfig?.enabled ?? false))}
                                        />
                                    </div>
                                </div>

                                {settings.unreadMessageFineConfig?.enabled && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80">
                                        <div>
                                            <label className="block text-[11px] sm:text-xs font-bold text-slate-700 tracking-wider mb-1.5 uppercase">
                                                Fine Amount per Message (₹)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={settings.unreadMessageFineConfig?.amountPerMessage ?? 0}
                                                onChange={(e) => handleUnreadFineChange('amountPerMessage', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3.5 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                            />
                                            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">Deducted per unread chat assigned to staff</p>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] sm:text-xs font-bold text-slate-700 tracking-wider mb-1.5 uppercase">
                                                SLA Threshold (Hours)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={settings.unreadMessageFineConfig?.thresholdHours ?? 24}
                                                onChange={(e) => handleUnreadFineChange('thresholdHours', parseInt(e.target.value) || 1)}
                                                className="w-full px-3.5 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                            />
                                            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">Hours before unread chat triggers fine penalty</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* SECTION 9: ADVANCED LEAVE DEDUCTION & PAID LEAVE SYSTEM */}
                        <section id="section-advanced" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100">
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <FiActivity className="text-rose-500 h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    Advanced Leave Deduction System
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                    Configure daily salary penalty multipliers for unapproved leave violations, permission penalties, and paid leave rules
                                </p>
                            </div>

                            {/* Penalty Multiplier Banner */}
                            <div className="bg-rose-50/50 border border-rose-100 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 mb-5 sm:mb-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                            <FiActivity className="text-rose-500 h-4 w-4" />
                                            Penalty Multiplier Configuration
                                        </h3>
                                        <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                                            Define how many times the daily salary should be deducted when an employee violates the leave policies below.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xl border border-rose-200 shadow-2xs self-start sm:self-center">
                                        <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Factor</span>
                                        <input
                                            type="number"
                                            min="1"
                                            value={settings.advancedLeaveDeduction.deductionMultiplier}
                                            onChange={(e) => handleAdvancedSettingsChange('deductionMultiplier', parseInt(e.target.value) || 1)}
                                            className="w-12 sm:w-14 text-center font-black text-base sm:text-lg text-rose-600 border-none bg-transparent focus:ring-0"
                                        />
                                        <span className="font-black text-base sm:text-lg text-rose-500">X</span>
                                    </div>
                                </div>
                            </div>

                            {/* 4 Policy Cards Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4 mb-5 sm:mb-6">

                                {/* CARD 1: Attendance Penalty Policy */}
                                <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between hover:border-slate-300 transition-all min-w-0">
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-2.5">
                                            <h3 className="text-xs font-bold text-slate-900 truncate">Attendance Penalty Policy</h3>
                                            <div className="flex-shrink-0 shrink-0">
                                                <CustomToggle
                                                    checked={settings.advancedLeaveDeduction.attendanceRuleEnabled}
                                                    onChange={() => handleAdvancedSettingsChange('attendanceRuleEnabled', !settings.advancedLeaveDeduction.attendanceRuleEnabled)}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] sm:text-[11px] text-slate-500 mb-2.5 sm:mb-3 leading-relaxed">
                                            Apply {settings.advancedLeaveDeduction.deductionMultiplier}X deduction if attendance falls below thresholds.
                                        </p>

                                        {settings.advancedLeaveDeduction.attendanceRuleEnabled && (
                                            <div className="space-y-2 pt-2.5 border-t border-slate-200/60">
                                                {[
                                                    { label: 'Company (%)', key: 'company' },
                                                    { label: 'Dept (%)', key: 'department' },
                                                    { label: 'Employee (%)', key: 'employee' }
                                                ].map((item) => (
                                                    <div key={item.key} className="flex items-center justify-between p-1.5 bg-white border border-slate-200/60 rounded-lg shadow-2xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <input
                                                                type="checkbox"
                                                                checked={settings.advancedLeaveDeduction.thresholds[item.key].enabled}
                                                                onChange={(e) => handleAdvancedSettingsChange(null, e.target.checked, item.key, 'enabled')}
                                                                className="h-3.5 w-3.5 text-[#006666] focus:ring-[#006666] border-slate-300 rounded"
                                                            />
                                                            <label className="text-[10px] sm:text-[11px] font-bold text-slate-700">{item.label}</label>
                                                        </div>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            disabled={!settings.advancedLeaveDeduction.thresholds[item.key].enabled}
                                                            value={settings.advancedLeaveDeduction.thresholds[item.key].value}
                                                            onChange={(e) => handleAdvancedSettingsChange(null, parseInt(e.target.value) || 0, item.key, 'value')}
                                                            className="w-12 sm:w-14 px-1.5 sm:px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-bold text-center focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* CARD 2: Monthly Limit Policy */}
                                <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between hover:border-slate-300 transition-all min-w-0">
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-2.5">
                                            <h3 className="text-xs font-bold text-slate-900 truncate">Monthly Limit Policy</h3>
                                            <div className="flex-shrink-0 shrink-0">
                                                <CustomToggle
                                                    checked={settings.advancedLeaveDeduction.monthlyLimitRuleEnabled}
                                                    onChange={() => handleAdvancedSettingsChange('monthlyLimitRuleEnabled', !settings.advancedLeaveDeduction.monthlyLimitRuleEnabled)}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] sm:text-[11px] text-slate-500 mb-2.5 sm:mb-3 leading-relaxed">
                                            Penalty of {settings.advancedLeaveDeduction.deductionMultiplier}X deduction applies once employee exceeds monthly limit.
                                        </p>

                                        {settings.advancedLeaveDeduction.monthlyLimitRuleEnabled && (
                                            <div className="space-y-2.5 pt-2.5 border-t border-slate-200/60">
                                                <div>
                                                    <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 mb-1">Monthly Limit (Days)</label>
                                                    <div className="relative flex items-center">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={settings.advancedLeaveDeduction.monthlyLimit}
                                                            onChange={(e) => handleAdvancedSettingsChange('monthlyLimit', parseInt(e.target.value) || 0)}
                                                            className="w-full pl-3 pr-16 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                                        />
                                                        <span className="absolute right-2.5 text-[10px] text-slate-400 font-semibold pointer-events-none">
                                                            days/mo
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="p-2 bg-white border border-slate-200/60 rounded-lg space-y-0.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-[10px] font-bold text-slate-800">Include Permission</label>
                                                        <div className="flex-shrink-0 shrink-0">
                                                            <CustomToggle
                                                                checked={settings.advancedLeaveDeduction.enableUnauthorizedPermissionPenalty ?? settings.includePermission ?? false}
                                                                onChange={() => {
                                                                    const newVal = !(settings.advancedLeaveDeduction.enableUnauthorizedPermissionPenalty ?? settings.includePermission ?? false);
                                                                    handleAdvancedSettingsChange('enableUnauthorizedPermissionPenalty', newVal);
                                                                    handleInputChange({ target: { name: 'includePermission', type: 'checkbox', checked: newVal } });
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <p className="text-[9px] text-slate-500">Apply {settings.advancedLeaveDeduction.deductionMultiplier}X penalty to permission/late time.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* CARD 3: 5X Unauthorized Absence Policy */}
                                <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between hover:border-slate-300 transition-all min-w-0">
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-2.5">
                                            <h3 className="text-xs font-bold text-slate-900 truncate">5X Absence Policy</h3>
                                            <div className="flex-shrink-0 shrink-0">
                                                <CustomToggle
                                                    checked={settings.advancedLeaveDeduction.enableUnauthorizedLeavePenalty}
                                                    onChange={() => handleAdvancedSettingsChange('enableUnauthorizedLeavePenalty', !settings.advancedLeaveDeduction.enableUnauthorizedLeavePenalty)}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] sm:text-[11px] text-slate-500 mb-2.5 sm:mb-3 leading-relaxed">
                                            Apply 5X daily basic pay deduction for past absent days with rejected or missing leave requests.
                                        </p>
                                    </div>

                                    <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${settings.advancedLeaveDeduction.enableUnauthorizedLeavePenalty ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
                                            {settings.advancedLeaveDeduction.enableUnauthorizedLeavePenalty ? 'Enabled (5X)' : 'Disabled'}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium">Pending safe</span>
                                    </div>
                                </div>

                                {/* CARD 4: 5X Unauthorized Permission Policy */}
                                <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between hover:border-slate-300 transition-all min-w-0">
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-2.5">
                                            <h3 className="text-xs font-bold text-slate-900 truncate">5X Permission Policy</h3>
                                            <div className="flex-shrink-0 shrink-0">
                                                <CustomToggle
                                                    checked={settings.advancedLeaveDeduction.enableUnauthorizedPermissionPenalty}
                                                    onChange={() => handleAdvancedSettingsChange('enableUnauthorizedPermissionPenalty', !settings.advancedLeaveDeduction.enableUnauthorizedPermissionPenalty)}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] sm:text-[11px] text-slate-500 mb-2.5 sm:mb-3 leading-relaxed">
                                            Apply 5X daily basic pay deduction for past days with unapproved (pending or rejected) leave permissions.
                                        </p>
                                    </div>

                                    <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${settings.advancedLeaveDeduction.enableUnauthorizedPermissionPenalty ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
                                            {settings.advancedLeaveDeduction.enableUnauthorizedPermissionPenalty ? 'Enabled (5X)' : 'Disabled'}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium">Permission hours</span>
                                    </div>
                                </div>

                            </div>

                            {/* How Deduction Factor Works Info Box */}
                            <div className="bg-sky-50/80 border border-sky-100 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 mb-5 sm:mb-6 flex items-start gap-2.5">
                                <FiInfo className="text-sky-600 h-4 w-4 mt-0.5 flex-shrink-0" />
                                <div className="text-[10px] sm:text-[11px] text-sky-800 space-y-1">
                                    <h4 className="font-bold text-sky-900">How Deduction Factor Works:</h4>
                                    <ul className="list-disc list-inside space-y-0.5 text-sky-700 font-medium">
                                        <li>When enabled, system evaluates BOTH attendance and limits.</li>
                                        <li>If ANY condition fails (e.g. low dept attendance OR limit exceeded), <strong>{settings.advancedLeaveDeduction.deductionMultiplier}X deduction factor</strong> is recorded for that specific leave request.</li>
                                        <li>If <strong>Include Permission in Penalty</strong> is on, the multiplier applies to late arrival/early departure time as well.</li>
                                        <li>If <strong>5X Unauthorized Absence Policy</strong> is enabled, unapproved or rejected leave/absence results in a 5X daily basic pay penalty.</li>
                                        <li>If <strong>5X Unauthorized Permission Policy</strong> is enabled, unapproved or rejected permission hours result in a 5X daily basic pay penalty for that duration.</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Paid Leave Configuration Section */}
                            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden pt-0.5">
                                <div className="h-1.5 bg-gradient-to-r from-[#006666] to-teal-400" />
                                <div className="p-4 sm:p-5">
                                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                                        <FiCalendar className="text-[#006666] h-4 w-4" />
                                        Paid Leave Configuration
                                    </h3>
                                    <div className="space-y-3.5">
                                        <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200/80 rounded-xl min-w-0">
                                            <div className="min-w-0 flex-1">
                                                <label className="text-xs font-bold text-slate-900 block">Enable Paid Leave</label>
                                                <p className="text-[10px] text-slate-500 leading-tight">Allow employees to apply for paid leave allocation</p>
                                            </div>
                                            <div className="flex-shrink-0 shrink-0">
                                                <CustomToggle
                                                    checked={settings.paidLeaveConfig?.enabled ?? false}
                                                    onChange={() => handlePaidLeaveConfigChange('enabled', !(settings.paidLeaveConfig?.enabled ?? false))}
                                                />
                                            </div>
                                        </div>

                                        {settings.paidLeaveConfig?.enabled && (
                                            <div>
                                                <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">
                                                    Paid Leaves Per Month
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="10"
                                                    value={settings.paidLeaveConfig?.leavesPerMonth || 1}
                                                    onChange={(e) => handlePaidLeaveConfigChange('leavesPerMonth', parseInt(e.target.value) || 0)}
                                                    className="w-full max-w-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                                />
                                                <p className="text-[10px] text-slate-400 mt-0.5 font-normal">
                                                    Number of paid leave days credited to each employee per month
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 10: AI & SECOND BRAIN SETTINGS */}
                        <section id="section-ai" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100">
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <FiInfo className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    AI & Second Brain Settings
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                    Configure DeepSeek AI integration keys and rate limits
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl min-w-0">
                                    <div className="min-w-0 flex-1">
                                        <label className="text-xs font-bold text-slate-900 block">Enable AI Features</label>
                                        <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 leading-tight">Enable DeepSeek AI developer allocation & search features</p>
                                    </div>
                                    <div className="flex-shrink-0 shrink-0">
                                        <CustomToggle
                                            checked={settings.aiConfig?.aiFeaturesEnabled ?? true}
                                            onChange={() => {
                                                const updated = {
                                                    ...settings,
                                                    aiConfig: {
                                                        ...(settings.aiConfig || {}),
                                                        aiFeaturesEnabled: !(settings.aiConfig?.aiFeaturesEnabled ?? true)
                                                    }
                                                };
                                                setSettings(updated);
                                                checkForChanges(updated);
                                            }}
                                        />
                                    </div>
                                </div>

                                {(settings.aiConfig?.aiFeaturesEnabled !== false) && (
                                    <div className="space-y-3.5">
                                        <div>
                                            <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 tracking-wider mb-1 uppercase">
                                                DeepSeek API Key
                                            </label>
                                            <input
                                                type="password"
                                                value={settings.aiConfig?.deepseekApiKey || ''}
                                                onChange={(e) => {
                                                    const updated = {
                                                        ...settings,
                                                        aiConfig: {
                                                            ...(settings.aiConfig || {}),
                                                            deepseekApiKey: e.target.value
                                                        }
                                                    };
                                                    setSettings(updated);
                                                    checkForChanges(updated);
                                                }}
                                                placeholder="sk-..."
                                                className="w-full px-3.5 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                            />
                                            <p className="text-[10px] text-slate-400 mt-0.5 font-normal">
                                                API key used for developer task matching and Second Brain queries
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                            <div>
                                                <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 tracking-wider mb-1 uppercase">
                                                    Max Daily AI Requests
                                                </label>
                                                <input
                                                    type="number"
                                                    value={settings.aiConfig?.aiMaxDailyRequests ?? 100}
                                                    onChange={(e) => {
                                                        const updated = {
                                                            ...settings,
                                                            aiConfig: {
                                                                ...(settings.aiConfig || {}),
                                                                aiMaxDailyRequests: parseInt(e.target.value) || 0
                                                            }
                                                        };
                                                        setSettings(updated);
                                                        checkForChanges(updated);
                                                    }}
                                                    className="w-full px-3.5 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 tracking-wider mb-1 uppercase">
                                                    Max Monthly AI Requests
                                                </label>
                                                <input
                                                    type="number"
                                                    value={settings.aiConfig?.aiMaxMonthlyRequests ?? 1000}
                                                    onChange={(e) => {
                                                        const updated = {
                                                            ...settings,
                                                            aiConfig: {
                                                                ...(settings.aiConfig || {}),
                                                                aiMaxMonthlyRequests: parseInt(e.target.value) || 0
                                                            }
                                                        };
                                                        setSettings(updated);
                                                        checkForChanges(updated);
                                                    }}
                                                    className="w-full px-3.5 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* SECTION 11: BUG BOUNTY PROGRAM */}
                        <section id="section-bounty" className="scroll-mt-36 lg:scroll-mt-36">
                            <div className="mb-4 sm:mb-5 pb-3 border-b border-slate-100">
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <FiShield className="text-[#006666] h-4.5 w-4.5 sm:h-5 sm:w-5" />
                                    Bug Bounty Program Configuration
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                    Manage public bug bounty URL, disclosure summary messages, and popup frequencies
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 tracking-wider mb-1 uppercase">
                                        Bug Report URL
                                    </label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            value={settings.bugBountyConfig?.bugReportUrl || ''}
                                            onChange={(e) => handleBugBountyChange('bugReportUrl', e.target.value)}
                                            placeholder="https://techvaseegrah.com/bug-bounty"
                                            className="w-full px-3 py-2 sm:py-2.5 bg-[#ffffff] border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666] min-w-0"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleCopyUrl}
                                            className="w-full sm:w-auto px-4 py-2 sm:py-2.5 border border-slate-200 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95 flex-shrink-0"
                                        >
                                            <FiCopy className="h-3.5 w-3.5" />
                                            {isCopied ? 'Copied' : 'Copy URL'}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 tracking-wider mb-1 uppercase">
                                        Disclosure Summary Message
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={settings.bugBountyConfig?.disclosureMessage || ''}
                                        onChange={(e) => handleBugBountyChange('disclosureMessage', e.target.value)}
                                        className="w-full px-3 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                        placeholder="Visit to check the bug bounty to earn rewards"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] sm:text-[11px] font-bold text-slate-700 tracking-wider mb-1 uppercase">
                                        Dashboard Popup Frequency
                                    </label>
                                    <select
                                        value={settings.bugBountyConfig?.popupFrequency || 'every_day'}
                                        onChange={(e) => handleBugBountyChange('popupFrequency', e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#006666]/20 focus:border-[#006666]"
                                    >
                                        <option value="always">Always Show</option>
                                        <option value="every_day">Every Day (Today)</option>
                                        <option value="every_week">Once a Week</option>
                                        <option value="every_month">Once a Month</option>
                                        <option value="once">Once</option>
                                        <option value="disabled">Disable Popup</option>
                                    </select>
                                </div>
                            </div>
                        </section>

                    </div>
                </div>

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

            <style>{`
                .custom-sidebar-scroll::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-sidebar-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-sidebar-scroll::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 10px;
                }
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    );
};

export default Settings;