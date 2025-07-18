/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        myBrown: "#B6B09F",
        gold: "#c19853",
        darkbrown: "#1a0e00",
        backDark: "#0B0400",
        backBrown: "#462512",
      },
      fontFamily: {
        Arita: ['Arita'],
        noto: ['"Cinzel Decorative"', "serif"],
      },
      backgroundImage: {
        "davinci-gradient": "linear-gradient(to right, #0B0400, #462512)",
      },
    },
  },
  plugins: [],
};