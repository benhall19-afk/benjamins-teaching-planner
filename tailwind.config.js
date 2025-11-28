/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['Playfair Display', 'Georgia', 'serif'],
        'body': ['Source Sans Pro', 'system-ui', 'sans-serif'],
      },
      colors: {
        'parchment': '#f5f1e8',
        'ink': '#2c2416',
        'gold': '#c9a227',
        'burgundy': '#722f37',
        'sage': '#87ae73',
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
      }
    },
  },
  plugins: [],
}
