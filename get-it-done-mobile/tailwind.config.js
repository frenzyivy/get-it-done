/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#8b5cf6',
        ink: '#1a1a2e',
        muted: '#888888',
        danger: '#dc2626',
        success: '#10b981',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['DMSans_400Regular'],
        medium: ['DMSans_500Medium'],
        semibold: ['DMSans_600SemiBold'],
        bold: ['DMSans_700Bold'],
        extrabold: ['DMSans_800ExtraBold'],
      },
    },
  },
  plugins: [],
};
