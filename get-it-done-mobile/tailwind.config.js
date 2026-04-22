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
        // Focus Lock (mobile 3-screen flow)
        'focus-bg': '#3B2F8E',
        'focus-ring-track': '#4A3FC9',
        'focus-ring-progress': '#10E4C1',
        'focus-recommended-badge': '#6B5BF5',
        'focus-no-mercy-badge': '#E5447A',
        'focus-warning': '#F5A623',
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
