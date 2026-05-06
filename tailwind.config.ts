import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cla: {
          "bg-dark": "#1e0707",
          "bg-card": "#3c1212",
          burgundy: "#581616",
          amber: "#E89A10",
          "amber-light": "#F8BA18",
          plum: "#4d2060",
          "off-white": "#F2EAE0",
          white: "#FFFFFF",
          "logo-yellow": "#d4e000",
          "logo-olive": "#7a8c00",
          "logo-purple": "#6b38a8",
          "logo-wine": "#9b2020",
        },
      },
      fontFamily: {
        condensed: ["Barlow Condensed", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
      backgroundImage: {
        "amber-gradient": "linear-gradient(135deg, #E89A10, #F8BA18)",
        "dark-gradient": "linear-gradient(180deg, #1e0707 0%, #3c1212 100%)",
        "card-gradient": "linear-gradient(135deg, #3c1212, #4a1616)",
      },
      boxShadow: {
        amber: "0 0 20px rgba(212, 134, 10, 0.2)",
        "amber-strong": "0 0 30px rgba(212, 134, 10, 0.4)",
        card: "0 4px 24px rgba(0,0,0,0.4)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        shimmer: "shimmer 2s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
