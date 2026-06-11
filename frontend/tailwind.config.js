/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Inter"', "ui-sans-serif", "system-ui"],
      },
      colors: {
        ink: "#0b0f14",
        paper: "#f6f1e7",
        sunset: "#e85d2a",
        desert: "#c89b57",
        forest: "#3f6b49",
      },
    },
  },
  plugins: [],
};
