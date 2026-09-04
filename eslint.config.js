import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      // Build output: the bundled CLI and the exported dashboard. Linting
      // generated code reports thousands of problems about code nobody wrote.
      "dist-package/**",
      "apps/web/out/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "**/coverage/**",
      "database/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain JS config files (next.config.mjs, postcss.config.mjs, this file)
    // run in Node. TypeScript files get their globals from @types/node.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", __dirname: "readonly" },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "off",
    },
  },
);
