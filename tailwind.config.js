/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'display': ['Inter', 'system-ui', 'sans-serif'],
        'body': ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Sage green gradient spectrum (Bible Teaching Planner)
        'sage': {
          50: '#f4f7f2',
          100: '#e8efe4',
          200: '#d1dfca',
          300: '#b3cba6',
          400: '#9ab889',
          500: '#87ae73',
          600: '#6b9359',
          700: '#547545',
          800: '#445d39',
          900: '#394d31',
          DEFAULT: '#87ae73',
        },
        // Amber/Orange gradient spectrum (Hall Family Devotions)
        'amber': {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          DEFAULT: '#f59e0b',
        },
        // Slate/Neutral spectrum (All Scheduled combined view)
        'slate': {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          DEFAULT: '#64748b',
        },
        // Neutral warm tones
        'warm': {
          50: '#faf9f7',
          100: '#f5f3ef',
          200: '#e8e4db',
          800: '#2c2416',
          900: '#1c1917',
        },
        // Purple spectrum (Teaching English)
        'purple': {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7c3aed',
          800: '#6b21a8',
          900: '#581c87',
          DEFAULT: '#a855f7',
        },
        // Navy spectrum (Relationships)
        'navy': {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
          DEFAULT: '#627d98',
        },
        // Legacy colors (for compatibility)
        'parchment': '#f5f1e8',
        'ink': '#1c1917',
        'gold': '#c9a227',
        'burgundy': '#722f37',
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'float-slow': 'float-slow 20s ease-in-out infinite',
        'float-slow-reverse': 'float-slow 15s ease-in-out infinite reverse',
        'nav-slide-down': 'nav-slide-down 0.6s ease-out',
        'card-fade-in': 'card-fade-in 0.4s ease-out forwards',
        'modal-scale-in': 'modal-scale-in 0.3s ease-out forwards',
        'gentle-pulse': 'gentle-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-20px) scale(1.05)' },
        },
        'nav-slide-down': {
          from: { opacity: '0', transform: 'translateY(-20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'card-fade-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'modal-scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'gentle-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
        'glass-hover': '0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',
        'button': '0 4px 14px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'button-hover': '0 6px 20px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'nav': '0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
}
