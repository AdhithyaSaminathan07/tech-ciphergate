/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: '#0d9488', // Changed to teal as requested
        'primary-hover': '#0f766e', // Darker teal for hover
        secondary: '#2196F3',
        danger: '#f44336',
        success: '#4CAF50',
        warning: '#FFC107',
        info: '#2196F3',
        light: '#f4f4f4',
        dark: '#333',
        // Custom theme colors
        'theme-red': '#0d9488',
        'theme-white': '#FFFFFF',
        'theme-black': '#000000'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        rise: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-15px)' },
        },
        buildRotate: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '50%': { transform: 'rotate(10deg)' },
        },
        moveUp: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        moveDown: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(10px)' },
        },
        workflowStretch: {
          '0%, 100%': { transform: 'scaleX(1)' },
          '50%': { transform: 'scaleX(1.05)' },
        }
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        rise: 'rise 6s ease-in-out infinite',
        'build-rotate': 'buildRotate 6s ease-in-out infinite',
        'move-up': 'moveUp 6s ease-in-out infinite',
        'move-down': 'moveDown 6s ease-in-out infinite',
        'workflow-stretch': 'workflowStretch 6s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}