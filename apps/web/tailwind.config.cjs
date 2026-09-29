// Visual system "papel contable": green-tinted neutrals, a ledger green for actions, amber for what needs a
// look and brick red for errors. The palette names are kept (ink, cobalt, mint, amber, rose) so every
// existing screen takes the new look; cobalt is the action color.
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#f6f8f5',
        sheet: '#ffffff',
        ink: {
          50: '#f1f5f2',
          100: '#e6ece8',
          200: '#d5ded8',
          300: '#b7c4bd',
          400: '#7d8b86',
          500: '#5e6d68',
          700: '#34443f',
          900: '#172521'
        },
        cobalt: {
          50: '#eef5f1',
          100: '#dcebe2',
          500: '#3b7c5d',
          600: '#2f6b4f',
          700: '#255a42'
        },
        mint: {
          50: '#edf6f0',
          100: '#d6ebdd',
          600: '#2e7d55'
        },
        amber: {
          50: '#fbf6ea',
          100: '#fbf1dc',
          200: '#f1d7a0',
          400: '#e8b04b',
          700: '#8a5a07'
        },
        rose: {
          50: '#fbefec',
          200: '#efc2b8',
          600: '#b4412e',
          700: '#963422'
        }
      },
      fontFamily: {
        sans: ['"Atkinson Hyperlegible Next"', '"Atkinson Hyperlegible"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Atkinson Hyperlegible Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        panel: '0 1px 2px rgba(23, 37, 33, 0.05)',
        pop: '0 12px 32px -14px rgba(23, 37, 33, 0.35)'
      }
    }
  },
  plugins: []
};
