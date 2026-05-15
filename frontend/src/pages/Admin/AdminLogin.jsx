import { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import appContext from '../../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { requestPasswordResetOtp, resetPasswordWithOtp } from '../../services/authService';
import { FaMoneyBillAlt, FaCamera, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import Spinner from '../../components/common/Spinner';

const AdminLogin = () => {
    const { subdomain, setSubdomain } = useContext(appContext);
    const [credentials, setCredentials] = useState({
        username: '',
        password: '',
        subdomain
    });
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isForgotPasswordFlow, setIsForgotPasswordFlow] = useState(false);

    // Forgot Password Flow States
    const [subdomainForReset, setSubdomainForReset] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [isOtpSent, setIsOtpSent] = useState(false);
    const [isOtpVerified, setIsOtpVerified] = useState(false);

    const { login, isAuthenticated, isAdmin, isWorker, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    // Auto-redirect if already logged in
    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            if (isWorker) navigate('/worker');
            else if (isAdmin) navigate('/admin');
        }
    }, [isAuthenticated, isWorker, isAdmin, authLoading, navigate]);

    // Generate floating particles for background animation
    const particles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 20 + 10,
        delay: Math.random() * 5
    }));

    useEffect(() => {
        setCredentials(prev => ({ ...prev, subdomain }));
    }, [subdomain]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setCredentials({ ...credentials, [name]: value });
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();

        setIsLoading(true);

        try {
            const result = await login(credentials, 'admin');
            localStorage.setItem('tasktracker-subdomain', result.subdomain);

            // Fix race condition: update context immediately
            if (setSubdomain) {
                setSubdomain(result.subdomain);
            }

            navigate('/admin');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Login failed. Please check your credentials.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRequestOtp = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await requestPasswordResetOtp({ subdomain: subdomainForReset });
            toast.success(response.message);
            setIsOtpSent(true);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send OTP. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();

        if (newPassword !== confirmNewPassword) {
            toast.error('Passwords do not match.');
            return;
        }

        setIsLoading(true);

        try {
            const response = await resetPasswordWithOtp({
                subdomain: subdomainForReset,
                otp,
                password: newPassword
            });
            toast.success(response.message);
            setIsForgotPasswordFlow(false); // Go back to login
            setIsOtpSent(false);
            setIsOtpVerified(false);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to reset password. Invalid OTP.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-white text-black overflow-hidden relative">
            {/* Animated Particles */}
            {particles.map((particle) => (
                <motion.div
                    key={particle.id}
                    className="absolute rounded-full bg-gray-200/20"
                    initial={{
                        x: `${particle.x}%`,
                        y: `${particle.y}%`,
                        opacity: 0.1 + Math.random() * 0.3
                    }}
                    animate={{
                        x: [`${particle.x}%`, `${particle.x + (Math.random() * 10 - 5)}%`],
                        y: [`${particle.y}%`, `${particle.y - 20}%`],
                        opacity: [0.1 + Math.random() * 0.3, 0]
                    }}
                    transition={{
                        repeat: Infinity,
                        duration: particle.duration,
                        delay: particle.delay,
                        ease: "linear"
                    }}
                    style={{
                        width: `${particle.size}px`,
                        height: `${particle.size}px`
                    }}
                />
            ))}

            {/* Back Button and Side Switch */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-50">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 px-3 py-2 bg-white/50 backdrop-blur-sm border border-gray-200 rounded-xl text-gray-600 hover:text-[#0d9488] hover:bg-white transition-all shadow-sm active:scale-95 group"
                >
                    <FaChevronLeft className="text-xs group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-bold uppercase tracking-wider">Back</span>
                </button>

                <Link
                    to="/worker/login"
                    className="flex items-center gap-2 px-4 py-2 bg-teal-50 border border-teal-100 rounded-xl text-[#0d9488] hover:bg-[#0d9488] hover:text-white transition-all shadow-sm active:scale-95 group"
                >
                    <span className="text-sm font-black uppercase tracking-wider">Employee Side</span>
                    <FaChevronRight className="text-xs group-hover:translate-x-1 transition-transform" />
                </Link>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-[85%] max-w-md z-10 bg-white backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-200 mx-auto"
            >
                <div className="mb-8 text-center">
                    <motion.h1
                        className="text-2xl sm:text-3xl font-bold text-[#0d9488]"
                        initial={{ y: -20 }}
                        animate={{ y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        {isForgotPasswordFlow ? 'Forgot Password' : 'Admin Login'}
                    </motion.h1>
                    <motion.div
                        className="h-1 bg-[#0d9488] rounded-full w-0 mx-auto mt-2"
                        initial={{ width: 0 }}
                        animate={{ width: isForgotPasswordFlow ? '90px' : '50px' }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    />
                </div>

                {!isForgotPasswordFlow ? (
                    /* Regular Login Form */
                    <form onSubmit={handleLoginSubmit} className="space-y-5">
                        {/* ... (username and password fields from previous code) ... */}

                        <motion.div
                            className="form-group"
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.3 }}
                        >
                            <label htmlFor="username" className="text-black flex items-center text-sm font-medium mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#0d9488]" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                </svg>
                                Username
                            </label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black"
                                value={credentials.username}
                                onChange={handleChange}
                                placeholder="Enter your username"
                                required
                            />
                        </motion.div>

                        <motion.div
                            className="form-group relative"
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.4 }}
                        >
                            <label htmlFor="password" className="text-black flex items-center text-sm font-medium mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#0d9488]" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black pr-10"
                                    value={credentials.password}
                                    onChange={handleChange}
                                    placeholder="Enter your password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-[#0d9488] focus:outline-none"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </motion.div>

                        <motion.button
                            type="submit"
                            disabled={isLoading}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.98 }}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{
                                type: "spring",
                                duration: 0.5,
                                delay: 0.5,
                                stiffness: 120
                            }}
                            className="w-full py-3 bg-[#0d9488] text-white rounded-lg hover:bg-white hover:text-[#0d9488] border-2 border-[#0d9488] transition-colors disabled:opacity-70 font-medium"
                        >
                            {isLoading ? <Spinner size="sm" /> : 'Sign In'}
                        </motion.button>
                    </form>
                ) : !isOtpSent ? (
                    /* Forgot Password Step 1: Enter Company Name */
                    <div className="flex flex-col items-center justify-center min-h-[200px]">
                        <form onSubmit={handleRequestOtp} className="space-y-5 w-full max-w-sm">
                            <motion.div
                                className="form-group w-full"
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                            >
                                <label htmlFor="subdomain" className="text-black flex items-center text-sm font-medium mb-2">
                                    Company Name
                                </label>
                                <input
                                    type="text"
                                    id="subdomain"
                                    name="subdomain"
                                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black"
                                    value={subdomainForReset}
                                    onChange={(e) => setSubdomainForReset(e.target.value)}
                                    required
                                    placeholder="Enter your company name"
                                />
                            </motion.div>
                            <motion.button
                                type="submit"
                                disabled={isLoading}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full py-3 bg-[#0d9488] text-white rounded-lg hover:bg-white hover:text-[#0d9488] border-2 border-[#0d9488] transition-colors disabled:opacity-70 font-medium"
                            >
                                {isLoading ? <Spinner size="sm" /> : 'Send OTP'}
                            </motion.button>
                        </form>
                    </div>
                ) : (
                    /* Forgot Password Step 2: Enter OTP and New Password */
                    <form onSubmit={handleResetPasswordSubmit} className="space-y-5">
                        <motion.div
                            className="form-group"
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.3 }}
                        >
                            <label htmlFor="otp" className="text-black flex items-center text-sm font-medium mb-2">
                                OTP
                            </label>
                            <input
                                type="text"
                                id="otp"
                                name="otp"
                                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                required
                                placeholder="Enter the OTP from your email"
                            />
                        </motion.div>

                        <motion.div
                            className="form-group relative"
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.4 }}
                        >
                            <label htmlFor="newPassword" className="text-black flex items-center text-sm font-medium mb-2">
                                New Password
                            </label>
                            <input
                                type="password"
                                id="newPassword"
                                name="newPassword"
                                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black pr-10"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                minLength="6"
                                placeholder="Enter your new password"
                            />
                        </motion.div>

                        <motion.div
                            className="form-group relative"
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.5 }}
                        >
                            <label htmlFor="confirmNewPassword" className="text-black flex items-center text-sm font-medium mb-2">
                                Confirm New Password
                            </label>
                            <input
                                type="password"
                                id="confirmNewPassword"
                                name="confirmNewPassword"
                                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black pr-10"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                required
                                minLength="6"
                                placeholder="Confirm your new password"
                            />
                        </motion.div>
                        <motion.button
                            type="submit"
                            disabled={isLoading}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full py-3 bg-[#0d9488] text-white rounded-lg hover:bg-white hover:text-[#0d9488] border-2 border-[#0d9488] transition-colors disabled:opacity-70 font-medium"
                        >
                            {isLoading ? <Spinner size="sm" /> : 'Reset Password'}
                        </motion.button>
                    </form>
                )}

                {/* Back to Login Link */}
                <div className="flex justify-between items-center mt-6">
                    <button
                        onClick={() => setIsForgotPasswordFlow(prev => !prev)}
                        className="text-[#0d9488] hover:text-black text-sm font-medium transition-colors"
                    >
                        {isForgotPasswordFlow ? 'Back to Login' : 'Forgot password?'}
                    </button>
                    <Link
                        to="/admin/register"
                        className="text-[#0d9488] hover:text-black text-sm font-medium transition-colors"
                    >
                        Create Account
                    </Link>
                </div>
            </motion.div>
        </div>
    );
};

export default AdminLogin;