import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#25231f',
        paper: '#fbf8f1',
        spice: '#b94d2c',
        saffron: '#e5a13b',
        leaf: '#426b4d',
      },
      boxShadow: { soft: '0 18px 55px rgba(52, 37, 23, .09)' },
      fontFamily: { display: ['Georgia', 'serif'], sans: ['Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
