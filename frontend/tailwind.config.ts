import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:           '#09090b',
        surface:      '#111113',
        card:         '#18181b',
        'card-hover': '#1c1c1f',
        border:       '#27272a',
        accent:       '#3b82f6',
        'accent-dim': '#1d4ed8',
        'accent-muted': 'rgba(59, 130, 246, 0.10)',
        green:        '#16a34a',
        'green-dim':  '#14532d',
        'green-muted': 'rgba(22, 163, 74, 0.10)',
        red:          '#dc2626',
        'red-dim':    '#7f1d1d',
        'red-muted':  'rgba(220, 38, 38, 0.10)',
        muted:        '#71717a',
        'muted-fg':   '#a1a1aa',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        display: ['Orbitron', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
