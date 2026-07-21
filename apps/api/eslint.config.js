const base = require("@mezzo/config/eslint");

module.exports = [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
  },
];
