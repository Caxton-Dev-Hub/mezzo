# @mezzo/config

Shared configuration package for linting, TypeScript, and formatting across all workspace packages.

## Exports

### ESLint Configuration
- `./eslint` - Flat-config ESLint rules with TypeScript support, Prettier integration, and Next.js plugin support

### TypeScript Configuration
- `./tsconfig.base.json` - Base TypeScript configuration to be extended by workspace packages

### Prettier Configuration
- `./prettier` - Shared Prettier formatting rules

## Usage

### ESLint

In a Next.js app (`apps/web` or `apps/charge`):

```javascript
const base = require("@mezzo/config/eslint");
const nextPlugin = require("@next/eslint-plugin-next");

module.exports = [
  ...base,
  {
    plugins: { "@next/next": nextPlugin },
    rules: { "@next/next/no-img-element": "warn" },
  },
];
```

In a backend API (`apps/api`):

```javascript
const base = require("@mezzo/config/eslint");

module.exports = [
  ...base,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: __dirname },
    },
  },
];
```

### TypeScript

In `tsconfig.json`:

```json
{
  "extends": "@mezzo/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  }
}
```

## Dependencies

- `@eslint/js` - ESLint core rules
- `typescript-eslint` - TypeScript linting
- `eslint-config-prettier` - Prettier integration
- `@next/eslint-plugin-next` - Next.js specific rules

## Maintenance

Update configuration versions here and they propagate to all workspace packages that import them.
