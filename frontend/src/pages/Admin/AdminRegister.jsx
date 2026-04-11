import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { registerAdmin } from '../../services/authService';
import { subdomainAvailable } from '../../services/authService';
import { motion, AnimatePresence } from 'framer-motion';
import { FaLink } from 'react-icons/fa';
import Spinner from '../../components/common/Spinner';

const AdminRegister = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    subdomain: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [domainAvailable, setDomainAvailable] = useState(true);
  const navigate = useNavigate();

  // Form field animation variants
  const formFieldVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (custom) => ({
      opacity: 1,
      x: 0,
      transition: { delay: custom * 0.1 }
    })
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Check subdomain availability when subdomain field changes
    if (name === 'subdomain') {
      handleSubdomainChange(value);
    }
  };

  const handleSubdomainChange = async (value) => {
    
    // Basic validation
    if (value.length < 3) {
      setDomainAvailable(false);
      return;
    }

    try {
      const response = await subdomainAvailable({ subdomain: value });
      setDomainAvailable(response.available);
    } catch (error) {
      console.error('Subdomain check error:', error);
      // If there's a network error, we'll allow the user to continue
      // but show a warning that availability couldn't be checked
      if (error.message.includes('Failed to check subdomain availability') || 
          error.message.includes('Network Error')) {
        setDomainAvailable(true); // Allow typing but don't show error
      } else {
        setDomainAvailable(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    // Validate subdomain
    if (!domainAvailable) {
      toast.error('Please choose an available company name');
      return;
    }

    setIsLoading(true);

    try {
      const response = await registerAdmin(formData);
      toast.success(response.message || 'Registration successful! Please check your email to verify your account.');
      navigate('/admin/login');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-black overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-gray-200/10"
            initial={{
              x: `${Math.random() * 100}%`,
              y: `${Math.random() * 100}%`,
              scale: Math.random() * 0.5 + 0.5
            }}
            animate={{
              y: [`${Math.random() * 100}%`, `${Math.random() * 100 - 20}%`],
              opacity: [0.3, 0]
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              delay: Math.random() * 5
            }}
            style={{
              width: `${Math.random() * 20 + 5}px`,
              height: `${Math.random() * 20 + 5}px`
            }}
          />
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-[85%] max-w-md z-10 bg-white backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-200 mx-auto my-10"
      >
        {/* Register Title with Animated Underline */}
        <div className="mb-6 text-center">
          <motion.h1
            className="text-2xl sm:text-3xl font-bold text-[#0d9488]"
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Create Admin Account
          </motion.h1>
          <motion.div
            className="h-1 bg-[#0d9488] rounded-full w-0 mx-auto mt-2"
            initial={{ width: 0 }}
            animate={{ width: "60px" }}
            transition={{ duration: 0.5, delay: 0.4 }}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Field */}
          <motion.div 
            className="form-group"
            variants={formFieldVariants}
            initial="hidden"
            animate="visible"
            custom={1}
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
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="Enter your username"
            />
          </motion.div>

          {/* Subdomain Field */}
          <motion.div 
            className="form-group"
            variants={formFieldVariants}
            initial="hidden"
            animate="visible"
            custom={2}
          >
            <label htmlFor="subdomain" className="text-black flex items-center text-sm font-medium mb-2">
              <FaLink className="h-4 w-4 mr-2 text-[#0d9488]" />
              Company name
            </label>
            <input
              type="text"
              id="subdomain"
              name="subdomain"
              className={`w-full px-4 py-3 bg-gray-100 border ${domainAvailable ? 'border-gray-300' : 'border-red-500'} rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black`}
              value={formData.subdomain}
              onChange={handleChange}
              required
              placeholder="Enter your company name"
            />
            {!domainAvailable && (
              <p className="text-red-500 text-xs mt-1">
                This company name is not available or too short
              </p>
            )}
          </motion.div>

          {/* Email Field */}
          <motion.div 
            className="form-group"
            variants={formFieldVariants}
            initial="hidden"
            animate="visible"
            custom={3}
          >
            <label htmlFor="email" className="text-black flex items-center text-sm font-medium mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#0d9488]" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Enter your email"
            />
          </motion.div>

          {/* Password Field */}
          <motion.div 
            className="form-group relative"
            variants={formFieldVariants}
            initial="hidden"
            animate="visible"
            custom={4}
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
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black pr-10"
                value={formData.password}
                onChange={handleChange}
                required
                minLength="6"
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-[#0d9488] focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
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

          {/* Confirm Password Field */}
          <motion.div 
            className="form-group relative"
            variants={formFieldVariants}
            initial="hidden"
            animate="visible"
            custom={5}
          >
            <label htmlFor="confirmPassword" className="text-black flex items-center text-sm font-medium mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#0d9488]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent text-black pr-10"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength="6"
                placeholder="Confirm your password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-[#0d9488] focus:outline-none"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
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

          {/* Submit Button */}
          <motion.div
            variants={formFieldVariants}
            initial="hidden"
            animate="visible"
            custom={6}
          >
            <motion.button
              type="submit"
              disabled={isLoading || !domainAvailable}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3 bg-[#0d9488] text-white rounded-lg hover:bg-[#0f766e] border-2 border-[#0d9488] transition-colors disabled:opacity-70 font-medium"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <Spinner size="sm" className="mr-2" />
                  Creating Account...
                </span>
              ) : 'Create Account'}
            </motion.button>
          </motion.div>
        </form>

        {/* Login Link */}
        <motion.p
          className="mt-6 text-center text-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          Already have an account?{' '}
          <Link
            to="/admin/login"
            className="text-[#0d9488] hover:text-[#0f766e] font-medium transition-colors"
          >
            Sign in
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
};

export default AdminRegister;