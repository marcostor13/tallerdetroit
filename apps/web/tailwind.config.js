/**
 * Tailwind lee los tokens desde las variables CSS de `src/styles/_tokens.css`.
 * Consecuencia: un solo juego de clases sirve para claro y oscuro; NO se usan
 * variantes `dark:` para color (única excepción legítima: el `src` del logo).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: 'var(--brand-red)',
          gray: 'var(--brand-gray)',
          ink: 'var(--brand-ink)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          dim: 'var(--surface-dim)',
          bright: 'var(--surface-bright)',
          'container-lowest': 'var(--surface-container-lowest)',
          'container-low': 'var(--surface-container-low)',
          container: 'var(--surface-container)',
          'container-high': 'var(--surface-container-high)',
          'container-highest': 'var(--surface-container-highest)',
          variant: 'var(--surface-variant)',
        },
        'inverse-surface': 'var(--inverse-surface)',
        'inverse-on-surface': 'var(--inverse-on-surface)',
        'on-surface': 'var(--on-surface)',
        'on-surface-variant': 'var(--on-surface-variant)',
        background: 'var(--background)',
        'on-background': 'var(--on-background)',
        secondary: {
          DEFAULT: 'var(--secondary)',
          container: 'var(--secondary-container)',
        },
        'on-secondary': 'var(--on-secondary)',
        'on-secondary-container': 'var(--on-secondary-container)',
        'gray-medium': 'var(--gray-medium)',
        subtle: 'var(--border-subtle)',
        outline: {
          DEFAULT: 'var(--outline)',
          variant: 'var(--outline-variant)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          container: 'var(--primary-container)',
          fixed: 'var(--primary-fixed)',
          'fixed-dim': 'var(--primary-fixed-dim)',
        },
        'on-primary': 'var(--on-primary)',
        'on-primary-container': 'var(--on-primary-container)',
        tertiary: {
          DEFAULT: 'var(--tertiary)',
          container: 'var(--tertiary-container)',
        },
        'on-tertiary': 'var(--on-tertiary)',
        'on-tertiary-container': 'var(--on-tertiary-container)',
        success: {
          DEFAULT: 'var(--success)',
          container: 'var(--success-container)',
        },
        'on-success': 'var(--on-success)',
        'on-success-container': 'var(--on-success-container)',
        warning: {
          DEFAULT: 'var(--warning)',
          container: 'var(--warning-container)',
        },
        'on-warning': 'var(--on-warning)',
        'on-warning-container': 'var(--on-warning-container)',
        error: {
          DEFAULT: 'var(--error)',
          container: 'var(--error-container)',
        },
        'on-error': 'var(--on-error)',
        'on-error-container': 'var(--on-error-container)',
      },
      borderColor: {
        DEFAULT: 'var(--border-subtle)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        technical: 'var(--shadow-technical)',
        none: 'none',
      },
      spacing: {
        base: 'var(--space-base)',
        gutter: 'var(--gutter)',
        'margin-mobile': 'var(--margin-mobile)',
        header: 'var(--header-h)',
        'bottom-nav': 'var(--bottom-nav-h)',
        control: 'var(--control-h)',
      },
      maxWidth: {
        container: 'var(--container-max)',
        measure: '68ch',
      },
      minHeight: {
        control: 'var(--control-h)',
        'control-sm': 'var(--control-h-sm)',
        'control-lg': 'var(--control-h-lg)',
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      fontFamily: {
        headline: ['Montserrat', 'system-ui', 'sans-serif'],
        body: ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'headline-xl': ['64px', { lineHeight: '72px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['40px', { lineHeight: '48px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-lg-mobile': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'title-sm': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.05em', fontWeight: '500' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.1em', fontWeight: '500' }],
        'data-md': ['16px', { lineHeight: '24px', fontWeight: '500' }],
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
        fast: '150ms',
        slow: '250ms',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')({ strategy: 'class' })],
};
