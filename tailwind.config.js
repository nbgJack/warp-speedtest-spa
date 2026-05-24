/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0b0c10',
        darkCard: '#1f2833',
        neonBlue: '#66fcf1',
        neonGreen: '#45f3ff',
        neonPurple: '#a855f7',
        cyanGlow: '#00ffff',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['Fira Code', 'Courier New', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 15px rgba(102, 252, 241, 0.3)',
        neonGreen: '0 0 15px rgba(34, 197, 94, 0.4)',
        neonPurple: '0 0 15px rgba(168, 85, 247, 0.4)',
      }
    },
  },
  plugins: [],
}
