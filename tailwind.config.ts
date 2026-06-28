import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        ocean: 'rgb(var(--color-ocean) / <alpha-value>)',
        mint: 'rgb(var(--color-ocean) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        soft: 'rgb(var(--color-soft) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        dark: 'rgb(var(--color-dark) / <alpha-value>)',
        device: 'rgb(var(--color-device) / <alpha-value>)',
        head: 'rgb(var(--color-head) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Segoe UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 16px 40px rgba(17, 24, 39, 0.08)',
        phone: '0 24px 80px rgba(17, 24, 39, 0.20)',
      },
    },
  },
  plugins: [],
} satisfies Config
