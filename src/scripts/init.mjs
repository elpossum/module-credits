// GET MODULE FUNCTIONS
import { MODULE } from "./_module.mjs";

// GET SETTINGS
import "./_settings.mjs";

// GET CORE MODULE
import { MMP } from "./module.mjs";

// GET MIGRATION
import "./_migration.mjs";

// GET CSS
import "../styles/module.css";

// HMR
import { Load } from "./hmr.mjs";
import { addBetterDependencies } from "./betterDependencies.mjs";
import { cacheFiles } from "./dialogs/preview.mjs";

export const ModuleManagement =
  foundry.applications.sidebar.apps.ModuleManagement;
export const SettingsConfig = foundry.applications.settings.SettingsConfig;
export const mergeObject = foundry.utils.mergeObject;
export const isNewerVersion = foundry.utils.isNewerVersion;
export const ContextMenu = foundry.applications.ux.ContextMenu.implementation;

Load.listen();

/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
// 🧙 DEVELOPER MODE HOOKS -> devModeReady
/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(MODULE.ID, "level", {
    choiceLabelOverrides: {
      0: "NONE",
      1: "ERROR",
      2: "WARN",
      3: "DEBUG",
      4: "INFO",
      5: "ALL",
    },
  });
});

/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
// socketlib HOOKS -> socketlib.ready
/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
Hooks.once("socketlib.ready", () => {
  MODULE.debug("SOCKETLIB Ready - SOCKET"); // WONT REGISTER CAUSE CALL HAPPENS WAY TO EARLY
  MMP.registerSocketLib();
});

/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
// libThemer HOOKS -> lib-themer.Ready
/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
Hooks.once("lib-themer.Ready", (API) => {
  API.register(`/modules/${MODULE.ID}/styles/TidyMMW.theme`);
});

/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
// FOUNDRY HOOKS -> READY
/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */

Hooks.once("ready", async () => {
  //await MIGRATE.init();
  MMP.init();
  cacheFiles();
});

/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
// FOUNDRY HOOKS -> MODULE FUNCTIONS
/* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
Hooks.on("renderApplicationV2", (app, elem) => MMP.renderSidebarTab(app, elem));

Hooks.on("renderModuleManagement", (app, elem) =>
  MMP.renderModuleManagement(app, elem),
);
Hooks.on("renderSettingsConfig", (app, elem) =>
  MMP.renderSettingsConfig(app, elem),
);

Hooks.on("renderDependencyResolution", (app, elem) =>
  addBetterDependencies(app, elem),
);

Handlebars.registerHelper("incIndex", function (value) {
  return parseInt(value) + 1;
});
