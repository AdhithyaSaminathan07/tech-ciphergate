/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Geist', 'Space Grotesk', 'sans-serif'],
      },
      colors: {
        // Coordinated Forest Green & Emerald Theme
        primary: '#087443',
        'primary-hover': '#065F37',
        'primary-light': '#F0FAF4',
        'primary-mint': '#C9F5D9',
        secondary: '#079455',
        danger: '#E11D48',
        success: '#087443',
        warning: '#D97706',
        info: '#0284C7',
        light: '#F6F9F7',
        dark: '#0F241D',
        // Sidebar Reference Colors
        'sidebar-bg': '#064E3B',
        'sidebar-dark': '#043629',
        'sidebar-border': '#032B20',
        'sidebar-active': '#C9F5D9',
        'sidebar-active-text': '#064E3B',
        'sidebar-text': '#ECFDF5',
        'sidebar-muted': '#A7F3D0',
        // Shadcn UI style variables
        background: "hsl(0 0% 100%)",
        foreground: "hsl(160 84% 4.9%)",
        card: "hsl(0 0% 100%)",
        'card-foreground': "hsl(160 84% 4.9%)",
        popover: "hsl(0 0% 100%)",
        'popover-foreground': "hsl(160 84% 4.9%)",
        muted: "hsl(150 20% 96%)",
        'muted-foreground': "hsl(155 16% 40%)",
        accent: "hsl(150 30% 94%)",
        'accent-foreground': "hsl(160 47% 11%)",
        destructive: "hsl(0 84.2% 60.2%)",
        'destructive-foreground': "hsl(0 0% 98%)",
        border: "hsl(150 20% 90%)",
        input: "hsl(150 20% 90%)",
        ring: "hsl(155 83% 25%)",
        // Theme branding colors
        'theme-green': '#087443',
        'theme-white': '#FFFFFF',
        'theme-black': '#0F241D',
        // Dashboard Enterprise UI tokens
        'dash-green': '#087443',
        'dash-accent': '#079455',
        'dash-mint': '#C9F5D9',
        'dash-orange': '#D97706',
        'dash-bg': '#F6F9F7',
        'dash-card': '#FFFFFF',
        'dash-text': '#0F241D',
        'dash-muted': '#526A5E',
        'dash-border': '#E2ECE5',
        'dash-soft-green': '#F0FAF4',
        'dash-soft-orange': '#FFFBEB',
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