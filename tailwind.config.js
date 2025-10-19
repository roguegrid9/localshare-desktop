/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,html}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Using CSS variables for theme support
        bg: {
          primary: 'var(--bg-primary)',
          surface: 'var(--bg-surface)',
          muted: 'var(--bg-muted)',
          hover: 'var(--bg-hover)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
        },
        border: {
          DEFAULT: 'var(--border)',
          hover: 'var(--border-hover)',
          glass: 'var(--glass-border)',
        },
        accent: {
          solid: 'var(--accent-solid)',
          gradient: {
            start: 'var(--accent-gradient-start)',
            end: 'var(--accent-gradient-end)',
          },
          glow: 'var(--accent-glow)',
        },
        success: 'var(--success)',
        error: 'var(--error)',
        warning: 'var(--warning)',
        info: 'var(--info)',
      },
      fontFamily: {
        heading: ['IBM Plex Sans', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      fontWeight: {
        heading: '600',
        body: '400',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        glow: '0 0 32px var(--accent-glow)',
      },
      opacity: {
        disabled: 'var(--opacity-disabled)',
        hover: 'var(--opacity-hover)',
      },
      lineHeight: {
        base: '1.5',
      },
    },
  },
  plugins: [],
}
