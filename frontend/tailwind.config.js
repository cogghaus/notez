/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Enable dark mode with class strategy
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // Ascending order matters: Tailwind emits min-width rules in config order, so `medium` must come
    // first or its rules would land after `xl` and let `medium:flex` beat `xl:hidden` (spec 1.1).
    screens: { medium: '600px', sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
    extend: {
      keyframes: {
        'toast-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'toast-in': 'toast-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
