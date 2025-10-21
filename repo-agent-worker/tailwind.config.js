/** @type {import('tailwindcss').Config} */
export default {
  content: ['./public/**/*.{html,js}', './node_modules/flowbite/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [require('flowbite/plugin')],
};
