import js from "@eslint/js";
import globals from "globals";
import deprecate from "eslint-plugin-deprecate";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],

    plugins: {
      deprecate,
    },

    extends: [js.configs.recommended],

    languageOptions: {
      globals: globals.browser,
    },

    rules: {
      "deprecate/function": "warn",
      "deprecate/import": "warn",
    },
  },
]);
