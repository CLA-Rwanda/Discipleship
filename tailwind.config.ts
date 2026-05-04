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
          "bg-dark": "#1A0505",
          "bg-card": "#2E0A0A",
          burgundy: "#4A0A0A",
          amber: "#D4860A",
          "amber-light": "#F0A500",
          plum: "#3D1A3D",
          "off-white": "#E8E0D8",
          white: "#FFFFFF",
          "logo-yellow": "#C8D400",
          "logo-olive": "#6B7A00",
          "logo-purple": "#5B2D8E",
          "logo-wine": "#8B1A1A",
        },
      },
      fontFamily: {
        condensed: ["Barlow Condensed", "sans-serif"],
        body: ["Barlow", "Inter", "sans-serif"],
      },
      backgroundImage: {
        "amber-gradient": "linear-gradient(135deg, #D4860A, #F0A500)",
        "dark-gradient": "linear-gradient(180deg, #1A0505 0%, #2E0A0A 100%)",
        "card-gradient": "linear-gradient(135deg, #2E0A0A, #3D1010)",
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
