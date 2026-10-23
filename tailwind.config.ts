import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          border: "var(--sidebar-border)",
        },
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "75ch",
            color: "var(--foreground)",
            a: {
              color: "#3B82F6",
              "&:hover": {
                color: "#60A5FA",
              },
            },
          },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
