import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordResetOtp } from '../../services/authService';
import { motion } from 'framer-motion';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    // Generate floating particles for background animation
    const particles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 20 + 10,
        delay: Math.random() * 5
    }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            await requestPasswordResetOtp({ email });
            toast.success('A password reset link has been sent to your registered email address.');
            navigate('/admin/login'); // Redirect back to login
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send password reset link.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#80d8d0] to-[#0d9488] text-white overflow-hidden relative">
            {/* Animated Particles */}
            {particles.map((particle) => (
                <motion.div
                    key={particle.id}
                    className="absolute rounded-full bg-white/20"
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
            
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-[85%] max-w-md z-10 bg-white/20 backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-white/30 mx-auto"
            >
                <div className="mb-8 text-center">
                    <motion.h1
                        className="text-2xl sm:text-3xl font-bold text-white"
                        initial={{ y: -20 }}
                        animate={{ y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        Forgot Password
                    </motion.h1>
                    <motion.div
                        className="h-1 bg-white rounded-full w-0 mx-auto mt-2"
                        initial={{ width: 0 }}
                        animate={{ width: "60px" }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    />
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <motion.div
                        className="form-group"
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                    >
                        <label htmlFor="email" className="text-white flex items-center text-sm font-medium mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                            </svg>
                            Email Address
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            className="w-full px-4 py-3 bg-white/30 border border-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent text-white placeholder-white/70"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email address"
                            required
                        />
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
                        className="w-full py-3 bg-white text-[#0d9488] rounded-lg hover:bg-[#0d9488] hover:text-white border-2 border-white transition-colors disabled:opacity-70 font-medium"
                    >
                        {isLoading ? <Spinner size="sm" /> : 'Send Reset Link'}
                    </motion.button>
                </form>

                {/* Back to Login Link */}
                <div className="flex justify-center mt-6">
                    <Link
                        to="/admin/login"
                        className="text-white hover:text-white/80 text-sm font-medium transition-colors flex items-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        Back to Login
                    </Link>
                </div>
            </motion.div>
        </div>
    );
};

export default ForgotPassword;