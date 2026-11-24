const base = require("@mezzo/config/eslint");
const nextPlugin = require("@next/eslint-plugin-next");

module.exports = [
  ...base,
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      "@next/next/no-img-element": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    ignores: [".next/**", "next-env.d.ts", "postcss.config.mjs", "next.config.mjs", "eslint.config.js"],
  },
];
