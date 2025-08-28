import globals from "globals";
import pluginJs from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        game: "readonly",
        ui: "readonly",
        SocketInterface: "readonly",
        Dialog: "readonly",
        foundry: "readonly",
        showdown: "readonly",
        Hooks: "readonly",
        Handlebars: "readonly",
        libWrapper: "readonly",
        socketlib: "readonly",
        CONST: "readonly",
      },
    },
  },
  globalIgnores(["**/libraries/", "dist/"]),
  pluginJs.configs.recommended,
  eslintConfigPrettier,
]);
