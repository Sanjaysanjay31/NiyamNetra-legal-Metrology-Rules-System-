/**
 * Tailwind is configured as a *thin naming layer over the CSS custom properties
 * in src/theme/tokens.css*, not as a second source of truth.
 *
 * Why: the palette lives in CSS custom properties, so components style against
 * semantic names (`bg-surface text-ink`) rather than hex values. Redesigning
 * the product is a tokens.css edit, not a sweep through every className in the
 * app.
 *
 * Consequence to remember: opacity modifiers like `bg-surface/50` will not work
 * on these colours, because a var() is not a channel triple. Where translucency
 * is needed, the token itself is declared as an rgba (see --nn-ring-halo).
 */

const px = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  11: '44px', // minimum touch target, 08 SS2.5
  12: '48px', // primary action height, and the header row
  14: '56px',
  16: '64px', // collapsed rail, header height
  20: '80px',
  24: '96px',
  60: '240px', // expanded rail
}

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // brand
        navy: {
          DEFAULT: 'var(--nn-navy)',
          hover: 'var(--nn-navy-hover)',
        },
        teal: {
          DEFAULT: 'var(--nn-teal)',
        },

        // canvas
        accent: {
          DEFAULT: 'var(--nn-accent)',
          text: 'var(--nn-accent-text)',
          on: 'var(--nn-accent-on)',
          soft: 'var(--nn-accent-soft)',
          ring: 'var(--nn-accent-ring)',
        },

        // canvas
        canvas: 'var(--nn-bg)',
        surface: {
          DEFAULT: 'var(--nn-surface)',
          2: 'var(--nn-surface-2)',
          sunken: 'var(--nn-surface-sunken)',
        },
        rail: {
          DEFAULT: 'var(--nn-rail)',
          hover: 'var(--nn-rail-hover)',
          label: 'var(--nn-rail-label)',
          ink: 'var(--nn-rail-ink)',
          border: 'var(--nn-rail-border)',
        },

        // lines. `divider` is decorative; `control` is the >= 3:1 form boundary.
        divider: 'var(--nn-divider)',
        control: 'var(--nn-control)',

        // text. Named `ink` so `text-ink` reads as a colour, not a size.
        ink: {
          DEFAULT: 'var(--nn-text)',
          2: 'var(--nn-text-2)',
          3: 'var(--nn-text-3)',
          inverse: 'var(--nn-text-on-dark)',
        },

        /* Semantic verdict families. Named for the verdict, never for the hue:
           a reviewer renaming "pass" to "green" is how a colour-only status
           indicator gets shipped. Each family is fill / border / text / graphic
           so the >= 4.5:1 text tone and the >= 3:1 icon tone stay distinct. */
        pass: {
          fill: 'var(--nn-pass-fill)',
          border: 'var(--nn-pass-border)',
          text: 'var(--nn-pass-text)',
          graphic: 'var(--nn-pass-graphic)',
        },
        violation: {
          fill: 'var(--nn-violation-fill)',
          border: 'var(--nn-violation-border)',
          text: 'var(--nn-violation-text)',
          graphic: 'var(--nn-violation-graphic)',
        },
        review: {
          fill: 'var(--nn-review-fill)',
          border: 'var(--nn-review-border)',
          text: 'var(--nn-review-text)',
          graphic: 'var(--nn-review-graphic)',
        },
        na: {
          fill: 'var(--nn-na-fill)',
          border: 'var(--nn-na-border)',
          text: 'var(--nn-na-text)',
          graphic: 'var(--nn-na-graphic)',
        },
        info: {
          fill: 'var(--nn-info-fill)',
          border: 'var(--nn-info-border)',
          text: 'var(--nn-info-text)',
          graphic: 'var(--nn-info-graphic)',
        },
        offline: {
          fill: 'var(--nn-offline-fill)',
          text: 'var(--nn-offline-text)',
        },

        chart: {
          1: 'var(--nn-chart-1)',
          2: 'var(--nn-chart-2)',
          3: 'var(--nn-chart-3)',
          4: 'var(--nn-chart-4)',
          5: 'var(--nn-chart-5)',
          grid: 'var(--nn-chart-grid)',
        },
      },

      fontFamily: {
        // Devanagari is inside the sans stack, not a separate class: a Hindi
        // label sitting next to an English one must not change weight or size.
        sans: [
          'Inter',
          'Noto Sans Devanagari',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      // 08 SS2.2. Line heights are baked in so a heading cannot be used at a
      // body line-height by accident.
      fontSize: {
        display: ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '700' }],
        h2: ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['16px', { lineHeight: '24px' }],
        small: ['14px', { lineHeight: '20px' }],
        caption: ['12px', { lineHeight: '16px' }],
        micro: ['11px', { lineHeight: '14px', letterSpacing: '0.08em' }],
      },

      spacing: px,
      minHeight: { touch: '44px', action: '48px' },
      minWidth: { touch: '44px' },
      maxWidth: { prose: '68ch', shell: '1440px' },

      borderRadius: {
        sm: 'var(--nn-r-sm)',
        DEFAULT: 'var(--nn-r-sm)',
        card: 'var(--nn-r-card)',
        hero: 'var(--nn-r-hero)',
        pill: 'var(--nn-r-pill)',
      },

      boxShadow: {
        card: 'var(--nn-shadow-card)',
        hover: 'var(--nn-shadow-hover)',
        modal: 'var(--nn-shadow-modal)',
        halo: '0 0 0 4px var(--nn-ring-halo)',
      },

      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        slow: '240ms',
      },
      transitionTimingFunction: {
        // One easing for the whole product. Motion that reads as "mechanical
        // settling" suits an instrument; bounce and overshoot do not.
        settle: 'cubic-bezier(0.2, 0, 0.2, 1)',
      },

      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'tick-in': {
          from: { opacity: '0', transform: 'scaleY(0.3)' },
          to: { opacity: '1', transform: 'none' },
        },
        'sheen': {
          from: { backgroundPosition: '-160% 0' },
          to: { backgroundPosition: '260% 0' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 240ms cubic-bezier(0.2,0,0.2,1) both',
        'tick-in': 'tick-in 220ms cubic-bezier(0.2,0,0.2,1) both',
        sheen: 'sheen 1.4s linear infinite',
      },

      zIndex: { rail: '30', header: '40', overlay: '50', toast: '60' },
    },
  },
  plugins: [],
}
