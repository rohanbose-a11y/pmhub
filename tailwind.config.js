/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },

      // ── Design-system brand palette ─────────────────────────────────
      colors: {
        brand: {
          50:  '#F3F0FF',
          100: '#E9DDFF',
          200: '#D4BFFF',
          300: '#B58AFF',
          400: '#9A5CFF',
          500: '#7B3FF2',
          600: '#692EE0',
          700: '#5623BE',
          800: '#451D97',
          900: '#38197A',
        },
      },

      animation: {
        'fade-in':   'fadeIn 0.2s ease-out',
        'slide-up':  'slideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        'spin-fast': 'spin 0.9s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
      },

      // ── Design-system shadow tokens ──────────────────────────────────
      boxShadow: {
        // DS: Small — subtle lift
        sm:       '0 1px 2px rgba(0,0,0,.08)',
        // DS: Medium — floating elements (dropdowns, popovers)
        md:       '0 4px 12px rgba(0,0,0,.10)',
        // DS: Large — modals, overlays
        lg:       '0 10px 30px rgba(0,0,0,.15)',
        // Aliases kept for backward compat
        card:     '0 1px 2px rgba(0,0,0,.08)',
        elevated: '0 4px 12px rgba(0,0,0,.10)',
        nav:      '0 4px 12px rgba(0,0,0,.10)',
        modal:    '0 10px 30px rgba(0,0,0,.15)',
        brand:    '0 2px 8px -2px rgba(123,63,242,.22)',
      },

      borderRadius: {
        xs:  '4px',
        sm:  '6px',
        md:  '8px',
        lg:  '12px',
        xl:  '16px',
        '2xl': '24px',
      },
    },
  },
  plugins: [],
}
