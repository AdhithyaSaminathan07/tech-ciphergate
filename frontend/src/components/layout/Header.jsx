import React, { useState, useRef, useEffect, useContext, useMemo } from 'react';
import { FaBell, FaCheckDouble, FaCog, FaBellSlash, FaCalendarCheck, FaFileInvoice, FaComments, FaCommentDots, FaHamburger, FaBookOpen } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../context/NotificationContext';
import { Bell, CheckCircle2, AlertCircle, Clock, MoreVertical, Settings2, Menu, X, ChevronRight, Search, Plus, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFullFileUrl } from '../../utils/fileUtils';
import appContext from '../../context/AppContext';
import { getWorkers } from '../../services/workerService';
import { getAllTasks } from '../../services/taskService';
import { getDepartments } from '../../services/departmentService';

import AdminMobileMenu from './AdminMobileMenu';

const Header = ({ user, menuLinks = [], sidebarLinks = [], onLogout, isAdmin = false, onMenuClick, title }) => {
    const { notifications, unreadCount, markAsRead, settings, updateSettings } = useNotification();
    const { subdomain } = useContext(appContext);
    const [isOpen, setIsOpen] = useState(false);
    const [is3DotOpen, setIs3DotOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [workers, setWorkers] = useState([]);
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
            <header className="sticky top-0 z-[100] w-full px-0.5 md:px-4 py-1 md:py-4 pointer-events-none">
                <div className="max-w-[1440px] mx-auto relative h-14 md:h-16 pointer-events-auto">
                    {/* Background Bar */}
                    <div className="absolute inset-0">
                        <div className="h-full bg-white/90 backdrop-blur-md rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-slate-100/50" />
                    </div>

                    {/* Content Overlay */}
                    <div className="relative z-10 h-full flex items-center justify-between px-2 md:px-6">
                        {/* Left Side: Logo & Menu */}
                        <div className="flex items-center gap-2 md:gap-3 flex-none lg:flex-initial lg:min-w-[240px]">
                            {isAdmin && (
                                <button
                                    onClick={onMenuClick}
                                    className="p-2 -ml-2 rounded-xl text-slate-600 hover:bg-slate-50 transition-all active:scale-95 md:hidden"
                                >
                                    <Menu size={22} />
                                </button>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-teal-600 tracking-tight text-base md:text-lg uppercase whitespace-nowrap">{title || 'Dashboard'}</span>
                            </div>
                        </div>

                        {/* Center: Search Bar */}
                        <div className="hidden md:flex items-center justify-center flex-1 max-w-xl px-4">
                            <div 
                                className="w-full max-w-[480px] flex items-center bg-slate-50/50 border border-slate-200/60 rounded-2xl px-4 py-2 gap-3 cursor-pointer hover:border-teal-300 hover:bg-white transition-all group" 
                                onClick={() => setIsSearchOpen(true)}
                            >
                                <Search size={18} className="text-teal-600" />
                                <span className="text-[14px] text-slate-400 font-medium group-hover:text-slate-500 flex-1">
                                    {isAdmin ? "Search employees, tasks, reports..." : "Search tasks..."}
                                </span>
                                <kbd className="hidden lg:inline-flex text-[10px] font-black text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100">⌘K</kbd>
                            </div>
                        </div>

                        {/* Right Side: Tools & Profile */}
                        <div className="flex items-center gap-1.5 md:gap-4 flex-1 justify-end lg:flex-initial lg:min-w-[240px]">
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
                                                className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[350]"
                                            >
                                                <div className="p-2 space-y-1">
                                                    {[
                                                        { label: 'Apply for Leave', icon: <FaCalendarCheck />, path: '/worker/leave-apply' },
                                                        { label: 'Invoices', icon: <FaFileInvoice />, path: '/worker/invoices' },
                                                        { label: 'Comments', icon: <FaComments />, path: '/worker/comments' },
                                                        { label: 'Communication', icon: <FaCommentDots />, path: '/worker/communication' },
                                                        { label: 'Food Request', icon: <FaHamburger />, path: '/worker/food-request' },
                                                        { label: 'Daily Topics', icon: <FaBookOpen />, path: '/worker/daily-topics' },
                                                    ].map((item) => (
                                                        <button
                                                            key={item.path}
                                                            onClick={() => { navigate(item.path); setIs3DotOpen(false); }}
                                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0d9488] rounded-xl transition-all"
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

                            {/* Quick Actions (+) */}
                            <div className="relative" ref={quickActionsRef}>
                                <button
                                    onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
                                    className={`p-2 rounded-xl transition-all duration-300 ${isQuickActionsOpen ? 'bg-teal-100 text-teal-700' : 'bg-teal-50 text-teal-600 hover:bg-teal-100'}`}
                                    title="Quick Actions"
                                >
                                    <Plus size={18} strokeWidth={2.5} />
                                </button>

                                <AnimatePresence>
                                    {isQuickActionsOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 mt-3 w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[350]"
                                        >
                                            <div className="p-2 space-y-1">
                                                {isAdmin ? (
                                                    <>
                                                        <button
                                                            onClick={() => { navigate('/admin/workers'); setIsQuickActionsOpen(false); }}
                                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0d9488] rounded-xl transition-all"
                                                        >
                                                            <Plus size={16} />
                                                            <span>New Employee</span>
                                                        </button>
                                                        <button
                                                            onClick={() => { navigate('/admin/tasks'); setIsQuickActionsOpen(false); }}
                                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0d9488] rounded-xl transition-all"
                                                        >
                                                            <Plus size={16} />
                                                            <span>New Task</span>
                                                        </button>
                                                        <button
                                                            onClick={() => { navigate('/admin/departments'); setIsQuickActionsOpen(false); }}
                                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0d9488] rounded-xl transition-all"
                                                        >
                                                            <Plus size={16} />
                                                            <span>New Department</span>
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => { navigate('/worker/leave-apply'); setIsQuickActionsOpen(false); }}
                                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0d9488] rounded-xl transition-all"
                                                        >
                                                            <Plus size={16} />
                                                            <span>Apply for Leave</span>
                                                        </button>
                                                        <button
                                                            onClick={() => { navigate('/worker/food-request'); setIsQuickActionsOpen(false); }}
                                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0d9488] rounded-xl transition-all"
                                                        >
                                                            <Plus size={16} />
                                                            <span>Request Food</span>
                                                        </button>
                                                        <button
                                                            onClick={() => { navigate('/worker/invoices'); setIsQuickActionsOpen(false); }}
                                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0d9488] rounded-xl transition-all"
                                                        >
                                                            <Plus size={16} />
                                                            <span>My Invoices</span>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Notifications */}
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setIsOpen(!isOpen)}
                                    className={`relative p-2 rounded-xl transition-all duration-300 ${isOpen ? 'bg-teal-50 text-teal-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'}`}
                                >
                                    <Bell className={`w-4 h-4 md:w-5 md:h-5 ${unreadCount > 0 ? 'animate-wiggle' : ''}`} />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 text-[9px] font-black text-white bg-rose-500 rounded-full border-2 border-white shadow-sm">
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
                                                        <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase">Notifications</h3>
                                                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Alert Center</p>
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
                                                        className={`text-[10px] font-black uppercase tracking-wider py-1 ${notifTab === 'all' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-400 hover:text-slate-600'}`}
                                                    >
                                                        All ({notifications.length})
                                                    </button>
                                                    <button
                                                        onClick={() => setNotifTab('unread')}
                                                        className={`text-[10px] font-black uppercase tracking-wider py-1 ${notifTab === 'unread' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-400 hover:text-slate-600'}`}
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
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No notifications</p>
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

                            {/* Profile */}
                            {user && (
                                <div className="flex items-center pl-1.5 md:pl-4 border-l border-slate-100 ml-0.5 relative" ref={profileRef}>
                                    <div className="flex flex-col items-end mr-3 hidden lg:flex">
                                        <span className="text-xs font-black text-slate-800 leading-none">{user.name || 'User'}</span>
                                        <span className="text-[9px] font-black text-teal-600 uppercase tracking-widest mt-1">{user.role || 'Member'}</span>
                                    </div>

                                    <button
                                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                                        className={`h-9 w-9 rounded-xl bg-[#0d9488] text-white flex items-center justify-center font-black shadow-sm border-2 border-white relative group overflow-hidden transition-all active:scale-95 ${isProfileOpen ? 'ring-2 ring-teal-500 ring-offset-2' : ''}`}
                                    >
                                        {user.photo ? (
                                            <img src={getFullFileUrl(user.photo)} alt="Profile" className="w-full h-full object-cover relative z-10" />
                                        ) : (
                                            <span className="relative z-10 text-xs">{user.name ? user.name.charAt(0).toUpperCase() : 'U'}</span>
                                        )}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                                    </button>

                                    <AnimatePresence>
                                        {isProfileOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute right-0 mt-3 top-full w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[350]"
                                            >
                                                <div className="p-4 border-b border-slate-50 bg-slate-50/30">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white font-black text-sm overflow-hidden">
                                                            {user.photo ? (
                                                                <img src={getFullFileUrl(user.photo)} alt="Profile" className="w-full h-full object-cover" />
                                                            ) : (
                                                                user.name ? user.name.charAt(0).toUpperCase() : 'U'
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-black text-slate-900 truncate">{user.displayName || user.name}</p>
                                                            <p className="text-[10px] text-teal-600 font-black uppercase tracking-widest truncate">{user.role || 'Member'}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-2 space-y-1">
                                                    <button
                                                        onClick={() => {
                                                            navigate(isAdmin ? '/admin/profile' : '/worker/profile');
                                                            setIsProfileOpen(false);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0d9488] rounded-xl transition-all"
                                                    >
                                                        <Settings2 size={18} className="opacity-70" />
                                                        <span>Profile Settings</span>
                                                    </button>

                                                    <div className="h-px bg-slate-50 mx-2" />

                                                    <button
                                                        onClick={() => {
                                                            setIsProfileOpen(false);
                                                            onLogout();
                                                        }}
                                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                                    >
                                                        <LogOut size={18} className="opacity-70" />
                                                        <span>Logout Session</span>
                                                    </button>
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
                                <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="text-slate-400 hover:text-slate-600">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-4 max-h-[400px] overflow-y-auto">
                                {isLoadingSearch ? (
                                    <div className="flex justify-center py-4">
                                        <span className="text-sm text-slate-500">Loading data...</span>
                                    </div>
                                ) : searchQuery === '' ? (
                                    <div className="mb-4">
                                        <h4 className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-[0.15em] mb-2">⚡ Recent Modules</h4>
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
                                                <h4 className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-[0.15em] mb-2">🏢 Departments</h4>
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
                                                <h4 className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-[0.15em] mb-2">👤 People</h4>
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
                                                <h4 className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-[0.15em] mb-2">📋 Tasks</h4>
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
