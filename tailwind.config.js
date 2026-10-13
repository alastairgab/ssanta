/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pine: {
          50: '#f0f7f3', 100: '#dbede2', 200: '#b8dbc6', 300: '#89c2a3', 400: '#57a27c',
          500: '#368560', 600: '#256a4b', 700: '#1e553e', 800: '#1a4433', 900: '#15382b', 950: '#0b1f18',
        },
        berry: {
          50: '#fdf3f3', 100: '#fce4e4', 200: '#facfcf', 300: '#f5aaaa', 400: '#ee7878',
          500: '#e24c4c', 600: '#cd2f2f', 700: '#ac2424', 800: '#8f2222', 900: '#772323', 950: '#410d0d',
        },
        gold: { 100: '#f7efd9', 200: '#eedcaa', 300: '#e3c477', 400: '#d6a94a', 500: '#c08f32', 600: '#9c6f27' },
        snow: '#fbfaf6',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        script: ['"Great Vibes"', '"Segoe Script"', 'cursive'],
        festive: ['"Mountains of Christmas"', 'Georgia', 'serif'],
        elegant: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px -4px rgb(21 56 43 / 0.12)' },
    },
  },
  plugins: [],
};
