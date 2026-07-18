/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx,vue,svelte}'],
  theme: {
    extend: {
      colors: {
        primary: '#f76f53',
        secondary: '#2596be',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-light': 'var(--color-surface-light)',
        muted: 'var(--color-muted)',
        main: 'var(--color-main)',
      },
    },
  },
  plugins: [],
};
