module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f8f8',
          100: '#ecefed',
          200: '#d5ddd8',
          500: '#64746a',
          700: '#35443a',
          900: '#17221b'
        },
        cobalt: {
          50: '#eef6ff',
          100: '#d9ebff',
          500: '#2772c7',
          600: '#1f5fa8',
          700: '#1b4e88'
        },
        mint: {
          50: '#eefaf5',
          100: '#d5f2e6',
          600: '#208462'
        },
        amber: {
          50: '#fff8e5',
          200: '#f5dda0',
          700: '#8a5d09'
        },
        rose: {
          50: '#fff1f1',
          600: '#c43d4b'
        }
      },
      boxShadow: {
        panel: '0 1px 2px rgba(23, 34, 27, 0.08), 0 8px 28px rgba(23, 34, 27, 0.06)'
      }
    }
  },
  plugins: []
};
