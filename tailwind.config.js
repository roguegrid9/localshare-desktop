/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,html}',
    // If you render anything from outside src/, add it here too:
    // './renderer/**/*.{js,ts,jsx,tsx,html}',
    // './packages/**/*.{js,ts,jsx,tsx,html}',
  ],
  theme: { extend: {} },
  safelist: [
    'drop-shadow-[0_0_20px_rgba(0,245,255,0.25)]',
    'drop-shadow-[0_0_16px_rgba(0,245,255,0.25)]',
    'bg-gradient-to-r',
    'from-[#FF8A00]',
    'to-[#FF3D00]',
  ],
  plugins: [],
}
