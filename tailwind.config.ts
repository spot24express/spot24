import type { Config } from 'tailwindcss';

/**
 * SPOT 24 · Tokens únicos de marca.
 * Regla 70/20/10: negro #000000 domina (70%), blanco #FFFFFF lee (20%),
 * rojo #F40901 señala (10%): CTAs, precios y estados activos.
 * Sin degradados ni sombras decorativas.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#000000', // fondo dominante
        paper: '#FFFFFF', // lectura
        signal: '#F40901', // señal: CTA, precio, activo
        surface: {
          1: '#0A0A0A', // tarjetas sobre negro
          2: '#141414',
          3: '#1E1E1E',
        },
        line: {
          DEFAULT: '#262626',
          strong: '#404040',
        },
        muted: '#A6A6A6',
      },
      fontFamily: {
        display: ['Saira', 'system-ui', 'sans-serif'],
        body: ['Barlow', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'body-base': ['18px', { lineHeight: '1.45' }],
        'body-lg': ['20px', { lineHeight: '1.45' }],
      },
      borderRadius: {
        brand: '10px',
        'brand-lg': '12px',
      },
      letterSpacing: {
        label: '0.12em',
        brand: '0.2em',
      },
      keyframes: {
        'skeleton-pulse': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.7' },
        },
        'speed-sweep': {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(320%)' },
        },
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'skeleton-pulse': 'skeleton-pulse 1.4s ease-in-out infinite',
        'speed-sweep': 'speed-sweep 1.2s linear infinite',
        'rise-in': 'rise-in 0.28s ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
