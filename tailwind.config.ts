import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0E0D12', soft: '#2A2832', mute: '#6E6A75' },
        cream: { DEFAULT: '#FAF6F1', deep: '#F3EDE5', warm: '#FFFDFA' },
        pink: { DEFAULT: '#F0578C', deep: '#C9366B', soft: '#FF9DBE', wash: '#FDEEF3' },
        line: {
          DEFAULT: 'rgba(14,13,18,0.12)',
          strong: 'rgba(14,13,18,0.20)',
          // Form controls need a 3:1 boundary (WCAG 1.4.11), which a hairline
          // divider weight cannot reach on cream.
          field: 'rgba(14,13,18,0.45)',
        },
        // Stage colours are used as small chip text, so each one clears
        // WCAG AA (4.5:1) against the cream surfaces.
        stage: {
          slate: '#645F6C',
          sky: '#1F6690',
          amber: '#8A6020',
          violet: '#6B4FB0',
          emerald: '#1F6E4C',
          rose: '#BE2F62',
        },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Fraunces', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Manrope', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display': ['clamp(2rem, 1.4rem + 2.2vw, 3.25rem)', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        'title': ['clamp(1.35rem, 1.1rem + 1vw, 1.9rem)', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
        'metric': ['clamp(1.6rem, 1.3rem + 1.1vw, 2.35rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'micro': ['0.6875rem', { lineHeight: '1.3', letterSpacing: '0.09em' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(14,13,18,0.04), 0 12px 32px -22px rgba(14,13,18,0.35)',
        lift: '0 2px 4px rgba(14,13,18,0.05), 0 26px 60px -30px rgba(14,13,18,0.45)',
        pink: '0 14px 34px -16px rgba(240,87,140,0.55)',
      },
      borderRadius: { xl2: '1.25rem' },
      transitionTimingFunction: { out: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      maxWidth: { shell: '96rem' },
    },
  },
  plugins: [],
};

export default config;
