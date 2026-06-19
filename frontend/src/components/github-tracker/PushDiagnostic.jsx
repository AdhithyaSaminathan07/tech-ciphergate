import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { 
    Activity, 
    CheckCircle2, 
    AlertTriangle, 
    XCircle, 
    RefreshCw, 
    Key, 
    Send, 
    ShieldAlert, 
    Terminal 
} from 'lucide-react';

export default function PushDiagnostic() {
    const { subscribeToPush } = useNotification();
    const [permission, setPermission] = useState('default');
    const [swStatus, setSwStatus] = useState('checking');
    const [subscription, setSubscription] = useState(null);
    const [vapidLoaded, setVapidLoaded] = useState(false);
    const [testResults, setTestResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [swError, setSwError] = useState('');

    const runChecks = async () => {
        // 1. Check permission
        setPermission(Notification.permission);

        // 2. Check VAPID
        const publicVapidKey = import.meta.env.VITE_PUBLIC_VAPID_KEY;
        setVapidLoaded(!!publicVapidKey);

        // 3. Check service worker
        if (!('serviceWorker' in navigator)) {
            setSwStatus('unsupported');
            setSwError('Service workers are not supported by this browser.');
            return;
        }

        try {
            const reg = await navigator.serviceWorker.ready;
            if (reg) {
                setSwStatus('active');
                
                // 4. Check push subscription
                const sub = await reg.pushManager.getSubscription();
                setSubscription(sub);
                setSwError('');
            } else {
                setSwStatus('inactive');
            }
        } catch (err) {
            setSwStatus('failed');
            setSwError(err.message || 'Failed to check service worker ready state.');
        }
    };

    useEffect(() => {
        runChecks();
    }, []);

    const handleRequestPermission = async () => {
        if (!('Notification' in window)) return;
        const status = await Notification.requestPermission();
        setPermission(status);
        runChecks();
    };

    const handleRegisterSubscription = async () => {
        setLoading(true);
        try {
            await subscribeToPush();
            await runChecks();
        } catch (err) {
            console.error('Subscription error in diagnostics:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSendTestPush = async () => {
        setLoading(true);
        setTestResults(null);
        try {
            const res = await api.post('/user-notifications/test-push', {
                permissionStatus: permission
            });
            setTestResults(res.data);
        } catch (err) {
            console.error('Test push error:', err);
            setTestResults(err.response?.data || {
                success: false,
                message: err.message || 'API request failed.'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Heading */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl border border-slate-800 shadow-xl text-white">
                <div className="flex items-center space-x-3">
                    <div className="bg-indigo-500/10 p-3 rounded-lg text-indigo-400">
                        <Activity className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold tracking-tight">Push Notification Diagnostic Suite</h3>
                        <p className="text-slate-400 text-sm mt-1">
                            Verify client permissions, service worker readiness, VAPID configurations, and test server delivery pipelines.
                        </p>
                    </div>
                </div>
            </div>

            {/* Grid of status cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 1. Permission status */}
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Browser Permission</span>
                        <h4 className="text-lg font-bold text-slate-800 mt-1 capitalize">{permission}</h4>
                    </div>
                    <div className="mt-4 flex items-center space-x-2">
                        {permission === 'granted' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : permission === 'denied' ? (
                            <XCircle className="w-5 h-5 text-rose-500" />
                        ) : (
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                        )}
                        <span className="text-xs text-slate-500">
                            {permission === 'granted' ? 'Allowed to show push alerts' : 'Please grant permissions'}
                        </span>
                    </div>
                </div>

                {/* 2. Service Worker */}
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Service Worker</span>
                        <h4 className="text-lg font-bold text-slate-800 mt-1 capitalize">
                            {swStatus === 'active' ? 'Active' : swStatus === 'checking' ? 'Checking...' : 'Inactive/Failed'}
                        </h4>
                    </div>
                    <div className="mt-4 flex items-center space-x-2">
                        {swStatus === 'active' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                            <XCircle className="w-5 h-5 text-rose-500" />
                        )}
                        <span className="text-xs text-slate-500">
                            {swStatus === 'active' ? 'Service worker registered' : 'Worker missing or stopped'}
                        </span>
                    </div>
                </div>

                {/* 3. Subscription Status */}
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Push Subscription</span>
                        <h4 className="text-lg font-bold text-slate-800 mt-1">
                            {subscription ? 'Subscribed' : 'Not Subscribed'}
                        </h4>
                    </div>
                    <div className="mt-4 flex items-center space-x-2">
                        {subscription ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                        )}
                        <span className="text-xs text-slate-500">
                            {subscription ? 'Ready to accept payloads' : 'No subscription active'}
                        </span>
                    </div>
                </div>

                {/* 4. VAPID Keys */}
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">VAPID Config</span>
                        <h4 className="text-lg font-bold text-slate-800 mt-1">
                            {vapidLoaded ? 'Configured' : 'Missing Key'}
                        </h4>
                    </div>
                    <div className="mt-4 flex items-center space-x-2">
                        {vapidLoaded ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                            <ShieldAlert className="w-5 h-5 text-rose-500" />
                        )}
                        <span className="text-xs text-slate-500 font-mono select-all">
                            {vapidLoaded ? 'VITE_PUBLIC_VAPID_KEY active' : 'Check frontend environment'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Sw error banner if any */}
            {swError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-start space-x-3">
                    <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <h5 className="font-semibold text-sm">Service Worker Registration Error</h5>
                        <p className="text-xs mt-1">{swError}</p>
                    </div>
                </div>
            )}

            {/* Check list & action pane */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Checklist & Verification */}
                <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm space-y-4">
                    <h4 className="text-base font-bold text-slate-800">Verification Steps Check</h4>
                    
                    <div className="space-y-3">
                        {/* SW capability */}
                        <div className="flex items-center justify-between text-sm py-1 border-b border-slate-50">
                            <span className="text-slate-600">Browser Service Worker Capability</span>
                            {'serviceWorker' in navigator ? (
                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-medium">Supported</span>
                            ) : (
                                <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full text-xs font-medium">Unsupported</span>
                            )}
                        </div>

                        {/* SW Ready */}
                        <div className="flex items-center justify-between text-sm py-1 border-b border-slate-50">
                            <span className="text-slate-600">Active Service Worker Ready</span>
                            {swStatus === 'active' ? (
                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-medium">Ready</span>
                            ) : (
                                <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full text-xs font-medium">Not Ready</span>
                            )}
                        </div>

                        {/* Permission check */}
                        <div className="flex items-center justify-between text-sm py-1 border-b border-slate-50">
                            <span className="text-slate-600">Notification Permission Status</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                permission === 'granted' ? 'bg-emerald-50 text-emerald-700' :
                                permission === 'denied' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                            }`}>{permission}</span>
                        </div>

                        {/* Subscription payload */}
                        <div className="flex items-center justify-between text-sm py-1 border-b border-slate-50">
                            <span className="text-slate-600">Active Subscription Object</span>
                            {subscription ? (
                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-medium">Generated</span>
                            ) : (
                                <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium">None</span>
                            )}
                        </div>

                        {/* Database Storage Endpoint */}
                        {subscription && (
                            <div className="space-y-1 text-slate-500 text-xs py-2 bg-slate-50 rounded-lg p-3 font-mono break-all max-h-32 overflow-y-auto select-all">
                                <strong>Endpoint:</strong> {subscription.endpoint}
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3 pt-3">
                        <button
                            onClick={handleRequestPermission}
                            className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-indigo-700 flex items-center gap-1.5 shadow-sm"
                        >
                            Request Permission
                        </button>
                        
                        <button
                            onClick={handleRegisterSubscription}
                            disabled={loading || swStatus !== 'active' || permission !== 'granted'}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-emerald-700 flex items-center gap-1.5 shadow-sm"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Register / Update Subscription
                        </button>

                        <button
                            onClick={runChecks}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                            Refresh Diagnostics
                        </button>
                    </div>
                </div>

                {/* End-to-End Test Dispatches */}
                <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="space-y-4">
                        <h4 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                            <Send className="w-4 h-4 text-indigo-500" /> End-to-End Push Delivery Test
                        </h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Trigger an active Web Push notification dispatch to all browser endpoints saved for your profile in the database. 
                        </p>

                        {!subscription && (
                            <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-lg text-xs flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                Please complete the verification checklist and register a subscription first.
                            </div>
                        )}

                        <button
                            onClick={handleSendTestPush}
                            disabled={loading || !subscription}
                            className="w-full bg-gradient-to-r from-indigo-650 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                        >
                            <Send className="w-4 h-4" /> Trigger Test Notification
                        </button>
                    </div>

                    {/* Results panel */}
                    <div className="flex-1 flex flex-col justify-end pt-2">
                        {testResults && (
                            <div className="bg-slate-900 rounded-xl p-4 text-slate-300 font-mono text-xs space-y-2 border border-slate-850">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                    <span className="flex items-center gap-1 text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
                                        <Terminal className="w-3.5 h-3.5" /> API Response Statistics
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        testResults.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`}>
                                        {testResults.success ? 'SUCCESS' : 'FAILED'}
                                    </span>
                                </div>
                                <div className="space-y-1 overflow-x-auto pt-1 text-[11px] leading-relaxed">
                                    <div><strong className="text-slate-400">Permission:</strong> {testResults.permissionStatus}</div>
                                    <div><strong className="text-slate-400">Active Subscriptions:</strong> {testResults.subscriptionCount}</div>
                                    <div><strong className="text-slate-400">Pushes Sent:</strong> {testResults.notificationsSent}</div>
                                    <div><strong className="text-slate-400">Pushes Failed:</strong> {testResults.notificationsFailed}</div>
                                    <div><strong className="text-slate-400">Expired Pruned:</strong> {testResults.expiredSubscriptionsRemoved}</div>
                                    {testResults.errorDetails && testResults.errorDetails.length > 0 && (
                                        <div className="mt-2 text-rose-400 border-t border-slate-800 pt-2">
                                            <strong className="text-rose-300">Errors:</strong>
                                            <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-[10px]">
                                                {JSON.stringify(testResults.errorDetails, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
