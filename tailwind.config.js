/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        floatUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '30%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-14px)', opacity: '0' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pop: 'pop 0.35s ease-out',
        shake: 'shake 0.4s ease-in-out',
        'float-up': 'floatUp 1.1s ease-out forwards',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
