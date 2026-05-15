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
        // Shadcn UI style variables
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222.2 84% 4.9%)",
        card: "hsl(0 0% 100%)",
        'card-foreground': "hsl(222.2 84% 4.9%)",
        popover: "hsl(0 0% 100%)",
        'popover-foreground': "hsl(222.2 84% 4.9%)",
        muted: "hsl(210 40% 96.1%)",
        'muted-foreground': "hsl(215.4 16.3% 46.9%)",
        accent: "hsl(210 40% 96.1%)",
        'accent-foreground': "hsl(222.2 47.4% 11.2%)",
        destructive: "hsl(0 84.2% 60.2%)",
        'destructive-foreground': "hsl(210 40% 98%)",
        border: "hsl(214.3 31.8% 91.4%)",
        input: "hsl(214.3 31.8% 91.4%)",
        ring: "hsl(221.2 83.2% 53.3%)",
        // Custom theme colors
        'theme-red': '#0d9488',
        'theme-white': '#FFFFFF',
        'theme-black': '#000000',
        // Dashboard Premium UI colors
        'dash-green': '#5EB063',
        'dash-orange': '#FFA756',
        'dash-bg': '#F9FBFF',
        'dash-card': '#FFFFFF',
        'dash-text': '#111827',
        'dash-muted': '#9CA3AF',
        'dash-border': '#E9EEF3',
        'dash-soft-green': '#F0FDF4',
        'dash-soft-orange': '#FFF7ED',
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