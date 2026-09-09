import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ShatteredLogo from '../components/common/ShatteredLogo';
import {
  ShieldCheck,
  Terminal,
  ArrowRight,
  Cpu,
  Sparkles,
  Lock
} from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, isWorker, loading: authLoading } = useAuth();

  // Auto-redirect if already logged in
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      if (isAdmin) navigate('/admin');
      else if (isWorker) navigate('/worker');
    }
  }, [isAuthenticated, isAdmin, isWorker, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans select-none">
      {/* Ambient Radial Background Glows (Teal Theme #0d9488) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 20%, rgba(13, 148, 136, 0.12), transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(13, 148, 136, 0.06), transparent 45%),
            radial-gradient(circle at 20% 80%, rgba(13, 148, 136, 0.05), transparent 45%)
          `
        }}
      />

      {/* Subtle Mesh Grid Overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(#0d9488 1px, transparent 1px), linear-gradient(90deg, #0d9488 1px, transparent 1px)`,
          backgroundSize: '28px 28px'
        }}
      />

      {/* Main Professional Card */}
      <motion.main
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 max-w-md w-full bg-white/90 backdrop-blur-2xl rounded-3xl p-7 sm:p-9 shadow-2xl shadow-slate-900/10 border border-slate-200/80 text-center overflow-hidden flex flex-col items-center"
      >
        {/* Top Accent Gradient Border Line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0d9488]/20 via-[#0d9488] to-[#0d9488]/20" />

        {/* Company Pill Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0d9488]/10 border border-[#0d9488]/20 text-[#0d9488] text-xs font-semibold tracking-wide mb-6 shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#0d9488]" />
          <span>Tech Vaseegrah</span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-600 font-medium">Workforce OS</span>
        </motion.div>

        {/* Brand Icon & Name */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="flex flex-col items-center gap-3 mb-6"
        >
          <div className="relative h-16 w-16 sm:h-20 sm:w-20 flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d9488]/15 via-[#0d9488]/5 to-slate-50 border border-[#0d9488]/25 p-3 shadow-inner">
            <ShatteredLogo
              src="/logo.png"
              alt="CipherGate Logo"
              className="h-12 w-12 sm:h-14 sm:w-14"
            />
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-display">
              CipherGate
            </h1>
            <span className="p-1 rounded-md bg-[#0d9488]/10 text-[#0d9488]">
              <Cpu className="w-4 h-4" strokeWidth={2} />
            </span>
          </div>
        </motion.div>

        {/* Welcome Message */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="space-y-2 mb-8 max-w-sm"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Welcome to CipherGate
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed">
            Intelligent workforce & attendance management portal built for Tech Vaseegrah teams.
          </p>
        </motion.div>

        {/* Action Buttons (CTAs) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="w-full space-y-3"
        >
          {/* Admin Portal Button */}
          <button
            type="button"
            onClick={() => navigate('/admin/login')}
            className="w-full py-3.5 px-6 bg-[#0d9488] hover:bg-[#0f766e] text-white font-semibold text-sm rounded-xl shadow-lg shadow-[#0d9488]/25 hover:shadow-xl hover:shadow-[#0d9488]/35 transition-all duration-200 flex items-center justify-center gap-2 group active:scale-[0.98] cursor-pointer"
            aria-label="Access Admin Portal"
          >
            <ShieldCheck className="w-4 h-4 text-white/90 group-hover:scale-110 transition-transform" strokeWidth={2} />
            <span>Admin Portal</span>
            <ArrowRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform ml-auto" strokeWidth={2} />
          </button>

          {/* Developer Login Button */}
          <button
            type="button"
            onClick={() => navigate('/worker/login')}
            className="w-full py-3.5 px-6 bg-white hover:bg-teal-50/50 border-2 border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488] hover:text-white font-semibold text-sm rounded-xl shadow-xs transition-all duration-200 flex items-center justify-center gap-2 group active:scale-[0.98] cursor-pointer"
            aria-label="Developer Login"
          >
            <Terminal className="w-4 h-4 text-[#0d9488] group-hover:text-white transition-colors" strokeWidth={2} />
            <span>Developer Login</span>
            <ArrowRight className="w-4 h-4 text-[#0d9488] group-hover:translate-x-1 group-hover:text-white transition-all ml-auto" strokeWidth={2} />
          </button>
        </motion.div>

        {/* Security & System Info Footer */}
        <div className="mt-8 pt-5 border-t border-slate-100 w-full flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-[#0d9488]" />
            <span>Tech Vaseegrah Systems</span>
          </div>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>

      </motion.main>
    </div>
  );
};

export default Home;