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
        $: "readonly",
        ui: "readonly",
        FormApplication: "readonly",
        saveDataToFile: "readonly",
        SocketInterface: "readonly",
        ModuleManagement: "readonly",
        SettingsConfig: "readonly",
        Dialog: "readonly",
        foundry: "readonly",
        mergeObject: "readonly",
        showdown: "readonly",
        Hooks: "readonly",
        Handlebars: "readonly",
        renderTemplate: "readonly",
        libWrapper: "readonly",
        socketlib: "readonly",
        FilePicker: "readonly",
        isNewerVersion: "readonly",
        readTextFromFile: "readonly",
        ContextMenu: "readonly",
      },
    },
  },
  globalIgnores(["**/libraries/", "dist/"]),
  pluginJs.configs.recommended,
  eslintConfigPrettier,
]);
