import React, { useState, useRef, useEffect, useContext, useMemo } from 'react';
import { FaBell, FaCheckDouble, FaCog, FaBellSlash, FaCalendarCheck, FaCalendarMinus, FaFileInvoice, FaComments, FaCommentDots, FaHamburger, FaBookOpen } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../context/NotificationContext';
import { Bell, CheckCircle2, AlertCircle, Clock, MoreVertical, Settings2, Menu, X, ChevronRight, Search, Plus, LogOut, ChevronDown, Cpu, Sparkles, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFullFileUrl } from '../../utils/fileUtils';
import appContext from '../../context/AppContext';
import { getWorkers } from '../../services/workerService';
import { getAllTasks } from '../../services/taskService';
import { getDepartments } from '../../services/departmentService';
import { searchSecondBrain } from '../../services/aiService';
import AdminMobileMenu from './AdminMobileMenu';

const renderMarkdown = (text) => {
  if (!text) return null;
  
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xs font-bold text-slate-800 mt-2.5 mb-1">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-sm font-black text-slate-900 mt-3.5 mb-1.5">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-base font-black text-slate-900 mt-4.5 mb-2">$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-extrabold text-slate-900">$1</strong>');
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em class="italic text-slate-700">$1</em>');
  
  // Bullet points
  html = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return `<li class="ml-3 list-disc pl-0.5 text-slate-600 text-[11px] font-semibold leading-relaxed">${trimmed.substring(2)}</li>`;
    }
    if (trimmed.startsWith('✓ ')) {
      return `<li class="ml-3 list-none pl-0.5 text-emerald-600 text-[11px] font-semibold leading-relaxed flex items-start gap-1"><span class="shrink-0">✓</span><span>${trimmed.substring(2)}</span></li>`;
    }
    if (!trimmed) {
      return '<div class="h-1"></div>';
    }
    return `<p class="text-[11px] text-slate-600 font-medium leading-relaxed my-0.5">${line}</p>`;
  }).join('');
  
  return <div className="space-y-1 select-text" dangerouslySetInnerHTML={{ __html: html }} />;
};

const Header = ({ user, menuLinks = [], sidebarLinks = [], onLogout, isAdmin = false, onMenuClick, title }) => {
    const { notifications, unreadCount, markAsRead, settings, updateSettings } = useNotification();
    const { subdomain } = useContext(appContext);
    const [isOpen, setIsOpen] = useState(false);
    const [is3DotOpen, setIs3DotOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [workers, setWorkers] = useState([]);
    
    const [isAnsweringBrain, setIsAnsweringBrain] = useState(false);
    const [aiAnswer, setAiAnswer] = useState('');
    const [aiAnswerResults, setAiAnswerResults] = useState([]);
    const [typedAnswer, setTypedAnswer] = useState('');
    const typingTimerRef = useRef(null);
    const [imgError, setImgError] = useState(false);

    // Reset AI search state when the search overlay is closed or query cleared
    useEffect(() => {
        if (!isSearchOpen || searchQuery === '') {
            setIsAnsweringBrain(false);
            setAiAnswer('');
            setAiAnswerResults([]);
            setTypedAnswer('');
            if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        }
    }, [isSearchOpen, searchQuery]);

    const handleAskSecondBrain = async () => {
        if (!searchQuery.trim()) return;
        setIsAnsweringBrain(true);
        setAiAnswer('');
        setTypedAnswer('');
        setAiAnswerResults([]);
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);

        try {
            const data = await searchSecondBrain(searchQuery, subdomain, true);
            const rawAnswer = data.answer || 'No direct answer synthesized. Matched sources are listed below.';
            setAiAnswer(rawAnswer);
            setAiAnswerResults(data.results || []);
            
            // Trigger typing effect
            let current = '';
            let index = 0;
            typingTimerRef.current = setInterval(() => {
                if (index < rawAnswer.length) {
                    current += rawAnswer.charAt(index);
                    if (index + 1 < rawAnswer.length) {
                        current += rawAnswer.charAt(index + 1);
                    }
                    setTypedAnswer(current);
                    index += 2;
                } else {
                    clearInterval(typingTimerRef.current);
                }
            }, 10);
        } catch (error) {
            console.error('AI search failed:', error);
            const errText = `*Failed to consult AI Second Brain:* ${error.message || 'Unknown error'}`;
            setAiAnswer(errText);
            setTypedAnswer(errText);
        } finally {
            setIsAnsweringBrain(false);
        }
    };
    const [tasks, setTasks] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [isLoadingSearch, setIsLoadingSearch] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [notifTab, setNotifTab] = useState('all'); // 'all' or 'unread'
    const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const dotMenuRef = useRef(null);
    const profileRef = useRef(null);
    const quickActionsRef = useRef(null);
    const navigate = useNavigate();
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
            if (dotMenuRef.current && !dotMenuRef.current.contains(event.target)) {
                setIs3DotOpen(false);
            }
            if (profileRef.current && !profileRef.current.contains(event.target)) {
                setIsProfileOpen(false);
            }
            if (quickActionsRef.current && !quickActionsRef.current.contains(event.target)) {
                setIsQuickActionsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const filteredWorkers = useMemo(() => workers.filter(w =>
        w.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.username?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5), [workers, searchQuery]);

    const filteredTasks = useMemo(() => tasks.filter(t =>
        t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5), [tasks, searchQuery]);

    const filteredDepartments = useMemo(() => departments.filter(d =>
        d.name?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5), [departments, searchQuery]);

    const combinedResults = useMemo(() => [
        ...filteredDepartments.map(d => ({ ...d, searchType: 'department' })),
        ...filteredWorkers.map(w => ({ ...w, searchType: 'worker' })),
        ...filteredTasks.map(t => ({ ...t, searchType: 'task' }))
    ], [filteredDepartments, filteredWorkers, filteredTasks]);
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchQuery]);
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen(true);
            }
            if (isSearchOpen && combinedResults.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex(prev => (prev + 1) % combinedResults.length);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex(prev => (prev - 1 + combinedResults.length) % combinedResults.length);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const selectedItem = combinedResults[selectedIndex];
                    if (selectedItem) {
                        handleItemClick(selectedItem);
                    }
                } else if (e.key === 'Escape') {
                    setIsSearchOpen(false);
                    setSearchQuery('');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen, combinedResults, selectedIndex]);
    const handleItemClick = (item) => {
        setIsSearchOpen(false);
        setSearchQuery('');
        if (item.searchType === 'worker') {
            navigate(`/admin/workers`);
        } else if (item.searchType === 'task') {
            navigate(`/admin/tasks`);
        } else if (item.searchType === 'department') {
            navigate(`/admin/departments`);
        }
    };
    useEffect(() => {
        if (isSearchOpen && (isAdmin ? workers.length === 0 : tasks.length === 0)) {
            const fetchSearchData = async () => {
                setIsLoadingSearch(true);
                try {
                    const [workersData, tasksData, deptsData] = await Promise.all([
                        isAdmin ? getWorkers({ subdomain }) : Promise.resolve([]),
                        getAllTasks({ subdomain }),
                        isAdmin ? getDepartments({ subdomain }) : Promise.resolve([])
                    ]);
                    setWorkers(Array.isArray(workersData) ? workersData : []);
                    setTasks(Array.isArray(tasksData) ? tasksData : []);
                    setDepartments(Array.isArray(deptsData) ? deptsData : []);
                } catch (error) {
                    console.error("Error fetching search data:", error);
                } finally {
                    setIsLoadingSearch(false);
                }
            };
            fetchSearchData();
        }
    }, [isSearchOpen, subdomain, workers.length, tasks.length, isAdmin]);

    const handleNotificationClick = (notification) => {
        markAsRead(notification._id);
        setIsOpen(false);
        if (notification.link) {
            navigate(notification.link);
        }
    };
    return (
        <>
            <header className={`sticky top-0 z-[100] w-full ${isAdmin ? 'px-0 py-0' : 'px-0.5 md:px-4 py-1 md:py-4'} transition-all duration-300 pointer-events-none`}>
                <div className={`${isAdmin ? 'w-full' : 'max-w-[1440px] mx-auto'} relative h-14 md:h-16 pointer-events-auto`}>
                    {/* Background Bar */}
                    <div className="absolute inset-0">
                        <div
                            className={`mx-auto h-14 md:h-16 flex items-stretch bg-white border-b border-slate-200/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-md relative overflow-hidden transition-all duration-300 ${isAdmin ? 'ring-0' : ''}`}
                        />
                    </div>
                    {/* Content Overlay */}
                    <div className={`relative z-10 h-full flex items-stretch justify-between ${isAdmin ? 'px-2 md:px-8' : 'px-2 md:px-6'}`}>
                        {/* Left Side: Logo & Menu */}
                        <div className="flex items-center gap-2 h-full flex-1 min-w-0 lg:min-w-[240px]">
                            {isAdmin && (
                                <button
                                    onClick={onMenuClick}
                                    className="p-2 -ml-2 shrink-0 rounded-xl text-slate-500 hover:bg-slate-100/80 hover:text-slate-900 transition-all active:scale-90 md:hidden"
                                >
                                    <Menu size={20} />
                                </button>
                            )}

                            {/* Company Logo */}
                            <img src="/logo.png" alt="Logo" className="md:hidden h-6 sm:h-8 w-auto shrink-0 object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                            
                            {/* Desktop Title (Hidden on mobile) */}
                            <h1 className={`hidden md:block font-extrabold text-emerald-800 tracking-tight truncate ${isAdmin ? 'text-xl' : 'text-lg'}`}>
                                {title || 'Dashboard'}
                            </h1>

                            {/* Mobile Title */}
                            <h1 className="md:hidden font-extrabold text-emerald-800 tracking-tight text-xs sm:text-sm line-clamp-2 leading-tight">
                                {title || 'Dashboard'}
                            </h1>
                        </div>

                        {/* Center: Search Bar */}
                        <div className="hidden md:flex items-center justify-center flex-1 max-w-xl px-4 h-full">
                            <div
                                className={`w-full max-w-[560px] flex items-center bg-slate-100/50 border border-transparent rounded-xl px-4 py-2.5 gap-3 cursor-pointer hover:bg-slate-100 transition-all group ${isAdmin ? 'bg-slate-50/80 hover:ring-2 hover:ring-teal-500/10 shadow-sm' : ''}`}
                                onClick={() => setIsSearchOpen(true)}
                            >
                                <Search size={18} className="text-teal-600/80" />
                                <span className="text-[13px] text-slate-500 font-medium group-hover:text-slate-600 flex-1">
                                    {isAdmin ? "Search everything..." : "Search tasks..."}
                                </span>
                                <div className="hidden lg:flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                    <kbd className="text-[10px] font-sans font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-sm">⌘</kbd>
                                    <kbd className="text-[10px] font-sans font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-sm">K</kbd>
                                </div>
                            </div>
                        </div>
                        {/* Right Side: Tools & Profile */}
                        <div className="flex items-center gap-1 md:gap-4 shrink-0 justify-end lg:min-w-[240px] h-full">
                            {/* Mobile Search Icon */}
                            <button
                                onClick={() => setIsSearchOpen(true)}
                                className="md:hidden p-2 rounded-xl text-slate-400 hover:bg-slate-50"
                            >
                                <Search size={18} />
                            </button>
                            {/* Mobile Three Dots Menu (Worker Only) */}
                            {!isAdmin && (
                                <div className="relative md:hidden" ref={dotMenuRef}>
                                    <button
                                        onClick={() => setIs3DotOpen(!is3DotOpen)}
                                        className={`p-2 rounded-xl transition-all duration-300 ${is3DotOpen ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <MoreVertical size={18} />
                                    </button>
                                    <AnimatePresence>
                                        {is3DotOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute right-0 mt-3 w-48 sm:w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[350] origin-top-right"
                                            >
                                                <div className="p-1.5 sm:p-2 space-y-0.5 sm:space-y-1">
                                                    {[
                                                        { label: 'Apply for Leave', icon: <FaCalendarCheck />, path: '/worker/leave-apply' },
                                                        { label: 'Leave Requests', icon: <FaCalendarMinus />, path: '/worker/leave-requests' },
                                                        { label: 'Invoices', icon: <FaFileInvoice />, path: '/worker/invoices' },
                                                        { label: 'Comments', icon: <FaComments />, path: '/worker/comments' },
                                                        { label: 'Communication', icon: <FaCommentDots />, path: '/worker/communication' },
                                                        { label: 'Food Request', icon: <FaHamburger />, path: '/worker/food-request' },
                                                        { label: 'Daily Topics', icon: <FaBookOpen />, path: '/worker/daily-topics' },
                                                    ].map((item) => (
                                                        <button
                                                            key={item.path}
                                                            onClick={() => { navigate(item.path); setIs3DotOpen(false); }}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0d9488] rounded-xl transition-all"
                                                        >
                                                            <span className="text-slate-400 group-hover:text-[#0d9488]">{item.icon}</span>
                                                            <span>{item.label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                            {/* Quick Actions Removed */}

                            {/* Notifications */}
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setIsOpen(!isOpen)}
                                    className={`relative p-2.5 rounded-xl transition-all duration-300 ${isOpen ? 'bg-teal-50 text-teal-600 shadow-inner' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'}`}
                                >
                                    <Bell className={`w-[18px] h-[18px] md:w-[20px] md:h-[20px] ${unreadCount > 0 ? 'animate-wiggle' : ''}`} strokeWidth={isAdmin ? 2.5 : 2} />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-2 right-2 inline-flex items-center justify-center w-4 h-4 text-[9px] font-black text-white bg-rose-500 rounded-full border-2 border-white shadow-sm ring-2 ring-rose-500/20">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                    )}
                                </button>

                                <AnimatePresence>
                                    {isOpen && (
                                        <>
                                            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[340] sm:hidden" onClick={() => setIsOpen(false)}></div>
                                            <motion.div
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 20 }}
                                                className="fixed inset-x-0 bottom-0 sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-full sm:mt-3 w-full sm:w-[400px] md:w-[450px] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden z-[350] border-t sm:border border-slate-100"
                                            >
                                                <div className="py-4 px-5 bg-white flex justify-between items-center border-b border-slate-50">
                                                    <div>
                                                        <h3 className="font-black text-slate-900 text-sm tracking-tight">Notifications</h3>
                                                        <p className="text-[9px] text-slate-400 font-black tracking-widest mt-0.5">Alert Center</p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => updateSettings({ pushEnabled: !settings.pushEnabled })}
                                                            className={`p-2 rounded-lg transition-colors ${settings.pushEnabled ? 'text-teal-600 hover:bg-teal-50' : 'text-slate-300 hover:bg-slate-50'}`}
                                                        >
                                                            {settings.pushEnabled ? <Bell className="w-4 h-4" /> : <FaBellSlash className="w-4 h-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => markAsRead('all')}
                                                            className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                                        >
                                                            <FaCheckDouble className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="px-5 py-2 bg-slate-50/50 flex gap-4 border-b border-slate-50">
                                                    <button
                                                        onClick={() => setNotifTab('all')}
                                                        className={`text-[10px] font-black tracking-wider py-1 ${notifTab === 'all' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-400 hover:text-slate-600'}`}
                                                    >
                                                        All ({notifications.length})
                                                    </button>
                                                    <button
                                                        onClick={() => setNotifTab('unread')}
                                                        className={`text-[10px] font-black tracking-wider py-1 ${notifTab === 'unread' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-400 hover:text-slate-600'}`}
                                                    >
                                                        Unread ({unreadCount})
                                                    </button>
                                                </div>

                                                <div className="max-h-[400px] md:max-h-[600px] overflow-y-auto custom-scrollbar bg-slate-50/30">
                                                    {notifications.filter(n => notifTab === 'unread' ? !n.isRead : true).length === 0 ? (
                                                        <div className="flex flex-col items-center justify-center py-12 px-6">
                                                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-3 border border-slate-100 shadow-sm">
                                                                <Bell className="w-6 h-6 text-slate-200" />
                                                            </div>
                                                            <p className="text-[10px] font-black text-slate-400 tracking-widest">No notifications</p>
                                                        </div>
                                                    ) : (
                                                        <div className="divide-y divide-slate-50">
                                                            {notifications.filter(n => notifTab === 'unread' ? !n.isRead : true).map((notification) => {
                                                                let iconBg = 'bg-teal-50';
                                                                let iconColor = 'text-teal-500';
                                                                let Icon = Bell;

                                                                if (notification.type === 'system_alert') {
                                                                    iconBg = 'bg-amber-50';
                                                                    iconColor = 'text-amber-500';
                                                                    Icon = Bell;
                                                                } else if (notification.type?.includes('task')) {
                                                                    iconBg = 'bg-indigo-50';
                                                                    iconColor = 'text-indigo-500';
                                                                    Icon = CheckCircle2;
                                                                } else if (notification.type?.includes('proof')) {
                                                                    if (notification.type.includes('rejected')) {
                                                                        iconBg = 'bg-rose-50';
                                                                        iconColor = 'text-rose-500';
                                                                        Icon = AlertCircle;
                                                                    } else {
                                                                        iconBg = 'bg-emerald-50';
                                                                        iconColor = 'text-emerald-500';
                                                                        Icon = CheckCircle2;
                                                                    }
                                                                }

                                                                return (
                                                                    <div
                                                                        key={notification._id}
                                                                        onClick={() => handleNotificationClick(notification)}
                                                                        className={`px-5 py-4 cursor-pointer hover:bg-white transition-all group relative ${notification.isRead ? 'opacity-60' : 'bg-teal-50/20'}`}
                                                                    >
                                                                        <div className="flex gap-4">
                                                                            <div className={`shrink-0 w-10 h-10 ${iconBg} ${iconColor} rounded-xl flex items-center justify-center border border-white shadow-sm group-hover:scale-110 transition-transform`}>
                                                                                <Icon size={18} strokeWidth={2.5} />
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex justify-between items-start mb-0.5">
                                                                                    <h4 className="text-sm font-bold text-slate-800 truncate pr-4">{notification.title}</h4>
                                                                                    <span className="text-[9px] font-black text-slate-400 whitespace-nowrap bg-white px-2 py-0.5 rounded-full border border-slate-100">
                                                                                        {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                                    </span>
                                                                                </div>
                                                                                <p className="text-[11px] font-semibold text-slate-500 leading-relaxed mt-1 line-clamp-2">
                                                                                    {notification.message}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Profile Section */}
                            {user && (
                                <div className="flex items-center pl-1 md:pl-8 relative h-full" ref={profileRef}>
                                    <div
                                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                                        className={`flex items-center gap-1.5 md:gap-3 cursor-pointer group px-1.5 md:px-3 py-1.5 rounded-2xl transition-all duration-300 ${isProfileOpen ? 'bg-slate-100/80 shadow-inner' : 'hover:bg-slate-50'}`}
                                    >
                                        <div className="flex flex-col items-end hidden sm:flex">
                                            <span className="text-[13px] font-black text-slate-900 leading-tight tracking-tight">{user.name || 'User'}</span>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="text-[9px] font-black text-teal-600 tracking-[0.15em]">{user.role || 'Member'}</span>
                                            </div>
                                        </div>

                                        <div className={`relative h-9 w-9 md:h-10 md:w-10 rounded-xl overflow-hidden shadow-md transition-all duration-300 group-hover:shadow-teal-500/10 group-hover:scale-105 border-2 ${isProfileOpen ? 'border-teal-500 shadow-teal-500/20' : 'border-white'}`}>
                                            {user.photo && !imgError ? (
                                                <img 
                                                    src={getFullFileUrl(user.photo)} 
                                                    alt="Profile" 
                                                    className="w-full h-full object-cover" 
                                                    onError={() => setImgError(true)}
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white font-black text-sm">
                                                    {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                                                </div>
                                            )}
                                            <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-xl" />
                                        </div>

                                        <ChevronDown size={14} className={`hidden md:block text-slate-400 transition-transform duration-300 ${isProfileOpen ? 'rotate-180 text-teal-600' : 'group-hover:text-slate-600'}`} />
                                    </div>

                                    <AnimatePresence>
                                        {isProfileOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 12, scale: 0.95 }}
                                                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                                                className="absolute right-0 mt-2 top-[85%] w-[260px] bg-white/98 backdrop-blur-xl rounded-[20px] shadow-[0_15px_40px_rgba(0,0,0,0.12)] border border-slate-100 overflow-hidden z-[500]"
                                            >
                                                {/* Compact Premium Header */}
                                                <div className="p-4 bg-slate-900 text-white relative overflow-hidden">
                                                    <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl" />

                                                    <div className="relative flex items-center gap-3">
                                                        <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 p-0.5 shadow-lg flex-shrink-0">
                                                            <div className="w-full h-full rounded-lg overflow-hidden flex items-center justify-center">
                                                                {user.photo && !imgError ? (
                                                                    <img 
                                                                        src={getFullFileUrl(user.photo)} 
                                                                        alt="Profile" 
                                                                        className="w-full h-full object-cover" 
                                                                        onError={() => setImgError(true)}
                                                                    />
                                                                ) : (
                                                                    <span className="text-sm font-black">{user.name ? user.name.charAt(0).toUpperCase() : 'U'}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="text-[13px] text-white font-black tracking-tight truncate">{user.displayName || user.name}</h3>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                                <span className="text-[9px] font-black text-teal-400 tracking-[0.15em]">{user.role || 'Member'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-1.5 bg-white">
                                                    <div className="space-y-0.5">
                                                        <button
                                                            onClick={() => {
                                                                navigate(isAdmin ? '/admin/profile' : '/worker/profile');
                                                                setIsProfileOpen(false);
                                                            }}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-teal-600 hover:bg-slate-50 transition-all group/btn"
                                                        >
                                                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover/btn:bg-white shadow-sm transition-all">
                                                                <Settings2 size={16} />
                                                            </div>
                                                            <span className="text-[12px] font-bold tracking-tight">Account Settings</span>
                                                            <ChevronRight size={12} className="ml-auto opacity-40 group-hover/btn:opacity-100 transition-all" />
                                                        </button>

                                                        <button
                                                            onClick={() => {
                                                                setIsProfileOpen(false);
                                                                onLogout();
                                                            }}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-500 hover:bg-rose-50 transition-all group/btn"
                                                        >
                                                            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center group-hover/btn:bg-white shadow-sm transition-all">
                                                                <LogOut size={16} />
                                                            </div>
                                                            <span className="text-[12px] font-bold tracking-tight">Logout Session</span>
                                                            <ChevronRight size={12} className="ml-auto opacity-40 group-hover/btn:opacity-100 transition-all" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-50 flex justify-center">
                                                    <p className="text-[8px] font-bold text-slate-400 tracking-[0.2em]">Security Core v2.4</p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{
                    __html: `
                @keyframes wiggle {
                    0%, 100% { transform: rotate(0deg); }
                    25% { transform: rotate(10deg); }
                    75% { transform: rotate(-10deg); }
                }
                .animate-wiggle {
                    animation: wiggle 0.5s ease-in-out infinite;
                }
                `
                }} />
            </header>

            {/* Command Palette Modal */}
            <AnimatePresence>
                {isSearchOpen && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-start justify-center pt-[10vh]" onClick={() => setIsSearchOpen(false)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="border-b border-slate-100 p-4 flex items-center gap-3">
                                <Search size={20} className="text-teal-600" />
                                <input
                                    type="text"
                                    placeholder="Search employees, tasks, reports..."
                                    className="text-base flex-1 outline-none text-[#111827]"
                                    autoFocus
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery.trim().length > 0 && !isAnsweringBrain && !typedAnswer && (
                                    <button
                                        onClick={handleAskSecondBrain}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-500 to-indigo-600 text-white rounded-xl text-xs font-black shadow-md hover:opacity-90 active:scale-[0.98] transition-all shrink-0"
                                    >
                                        <Cpu size={14} className="animate-pulse" />
                                        Ask AI
                                    </button>
                                )}
                                <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="text-slate-400 hover:text-slate-600">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-4 max-h-[400px] overflow-y-auto">
                                {isAnsweringBrain ? (
                                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center border border-teal-100 animate-pulse">
                                                <BrainCircuit className="w-6 h-6 text-teal-600" />
                                            </div>
                                            <div className="absolute inset-0 rounded-full border-2 border-teal-500 border-t-transparent animate-spin"></div>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-700 tracking-widest">Consulting AI Second Brain</h4>
                                            <p className="text-[10px] text-slate-400 font-medium mt-1">Retrieving repository files, wikis, and historical tasks...</p>
                                        </div>
                                    </div>
                                ) : typedAnswer ? (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        {/* AI Answer Card */}
                                        <div className="bg-gradient-to-br from-indigo-50/50 to-teal-50/50 border border-teal-100 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl"></div>
                                            <div className="flex items-center justify-between border-b border-teal-100/50 pb-2.5 mb-3">
                                                <div className="flex items-center gap-1.5">
                                                    <Cpu size={16} className="text-teal-600" />
                                                    <span className="text-xs font-black text-slate-700 tracking-wider">AI Second Brain Synthesis</span>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        setTypedAnswer('');
                                                        setAiAnswer('');
                                                        setAiAnswerResults([]);
                                                    }}
                                                    className="text-[9px] font-black text-teal-600 hover:text-teal-700 tracking-widest"
                                                >
                                                    ← Back to Search
                                                </button>
                                            </div>
                                            <div className="text-slate-800 text-xs font-medium prose max-w-none">
                                                {renderMarkdown(typedAnswer)}
                                            </div>
                                        </div>

                                        {/* Matches Sources */}
                                        {aiAnswerResults.length > 0 && (
                                            <div className="space-y-2">
                                                <h4 className="text-[10px] font-black text-[#9CA3AF] tracking-[0.15em] mb-1">📂 Matched Context Sources ({aiAnswerResults.length})</h4>
                                                <div className="space-y-1.5">
                                                    {aiAnswerResults.map((r, i) => (
                                                        <div key={i} className="p-2.5 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-slate-200 transition-all flex flex-col gap-1">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[11px] font-bold text-slate-800">{r.title}</span>
                                                                <span className="text-[8px] font-extrabold px-1.5 py-0.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-full">{r.type}</span>
                                                            </div>
                                                            <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">{r.content}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : isLoadingSearch ? (
                                    <div className="flex justify-center py-4">
                                        <span className="text-sm text-slate-500">Loading data...</span>
                                    </div>
                                ) : searchQuery === '' ? (
                                    <div className="mb-4">
                                        <h4 className="text-[10px] font-black text-[#9CA3AF] tracking-[0.15em] mb-2">⚡ Recent Modules</h4>
                                        <div className="space-y-1">
                                            {[
                                                { name: 'Workers', path: '/admin/workers' },
                                                { name: 'Tasks', path: '/admin/tasks' },
                                                { name: 'Departments', path: '/admin/departments' },
                                                { name: 'Attendance', path: '/admin/attendance' }
                                            ].map(mod => (
                                                <div key={mod.path} className="p-2 hover:bg-[#F5F7FA] rounded-lg flex justify-between items-center cursor-pointer" onClick={() => { navigate(mod.path); setIsSearchOpen(false); }}>
                                                    <div>
                                                        <p className="text-sm font-bold text-[#111827]">{mod.name}</p>
                                                        <p className="text-[10px] text-[#6B7280]">Quick Access</p>
                                                    </div>
                                                    <ChevronRight size={14} className="text-[#9CA3AF]" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : ((isAdmin ? filteredWorkers.length : 0) === 0 && filteredTasks.length === 0 && (isAdmin ? filteredDepartments.length : 0) === 0) ? (
                                    <div className="text-center py-4 text-sm text-slate-500">
                                        No results found.
                                    </div>
                                ) : (
                                    <>
                                        {isAdmin && filteredDepartments.length > 0 && (
                                            <div className="mb-4">
                                                <h4 className="text-[10px] font-black text-[#9CA3AF] tracking-[0.15em] mb-2">🏢 Departments</h4>
                                                <div className="space-y-2">
                                                    {filteredDepartments.map((dept, idx) => {
                                                        const isSelected = idx === selectedIndex;
                                                        return (
                                                            <div key={dept._id} className={`p-2 ${isSelected ? 'bg-[#F5F7FA]' : 'hover:bg-[#F5F7FA]'} rounded-lg flex justify-between items-center cursor-pointer`} onClick={() => handleItemClick({ ...dept, searchType: 'department' })}>
                                                                <div>
                                                                    <p className="text-sm font-bold text-[#111827]">{dept.name}</p>
                                                                    <p className="text-[10px] text-[#6B7280]">Department</p>
                                                                </div>
                                                                <button className="text-xs text-[#0D9488] font-bold hover:underline">View</button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        {isAdmin && filteredWorkers.length > 0 && (
                                            <div className="mb-4">
                                                <h4 className="text-[10px] font-black text-[#9CA3AF] tracking-[0.15em] mb-2">👤 People</h4>
                                                <div className="space-y-2">
                                                    {filteredWorkers.map((worker, idx) => {
                                                        const isSelected = (filteredDepartments.length + idx) === selectedIndex;
                                                        return (
                                                            <div key={worker._id} className={`p-2 ${isSelected ? 'bg-[#F5F7FA]' : 'hover:bg-[#F5F7FA]'} rounded-lg flex justify-between items-center cursor-pointer`} onClick={() => handleItemClick({ ...worker, searchType: 'worker' })}>
                                                                <div>
                                                                    <p className="text-sm font-bold text-[#111827]">{worker.name}</p>
                                                                    <p className="text-[10px] text-[#6B7280]">Employee</p>
                                                                </div>
                                                                <button className="text-xs text-[#0D9488] font-bold hover:underline">View Profile</button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        {filteredTasks.length > 0 && (
                                            <div>
                                                <h4 className="text-[10px] font-black text-[#9CA3AF] tracking-[0.15em] mb-2">📋 Tasks</h4>
                                                <div className="space-y-2">
                                                    {filteredTasks.map((task, idx) => {
                                                        const isSelected = (filteredDepartments.length + filteredWorkers.length + idx) === selectedIndex;
                                                        return (
                                                            <div key={task._id} className={`p-2 ${isSelected ? 'bg-[#F5F7FA]' : 'hover:bg-[#F5F7FA]'} rounded-lg flex justify-between items-center cursor-pointer`} onClick={() => handleItemClick({ ...task, searchType: 'task' })}>
                                                                <div>
                                                                    <p className="text-sm font-bold text-[#111827]">{task.title}</p>
                                                                    <p className="text-[10px] text-[#6B7280]">Task</p>
                                                                </div>
                                                                <button className="text-xs text-[#0D9488] font-bold hover:underline">View Task</button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default Header;
