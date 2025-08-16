import globals from "globals";
import pluginJs from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  { languageOptions: { globals: globals.browser } },
  globalIgnores(["**/libraries/", "dist/"]),
  pluginJs.configs.recommended,
  eslintConfigPrettier,
]);
