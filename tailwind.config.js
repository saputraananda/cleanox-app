/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#eef4ff',
          100: '#d6e6ff',
          200: '#b3cfff',
          300: '#85b0ff',
          400: '#4d88f7',
          500: '#2563d4',
          600: '#1d50b8',
          700: '#1B3F78',
          800: '#152f5e',
          900: '#0e1f3f',
        },
      },
      animation: {
        'fade-in':  'fadeIn 0.15s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'loadbar':  'loadbar 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        loadbar: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
      },
    },
  },
  plugins: [],
};
