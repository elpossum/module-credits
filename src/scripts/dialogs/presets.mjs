// GET MODULE CORE
import { MODULE } from "../_module.mjs";
import { ModuleManagement, SettingsConfig, mergeObject } from "../init.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } =
  foundry.applications.api;

export let PresetDialog;

Hooks.once(
  "i18nInit",
  () =>
    (PresetDialog = class PresetDialog extends (
      HandlebarsApplicationMixin(ApplicationV2)
    ) {
      static DEFAULT_OPTIONS = {
        title: `${MODULE.TITLE} - ${MODULE.localize("dialog.titles.presets")}`,
        id: `${MODULE.ID}-preset-dialog`,
        classes: ["dialog"],
        template: `modules/${MODULE.ID}/templates/presets.hbs`,
        window: {
          resizable: false,
          title: `${MODULE.TITLE} - ${MODULE.localize("dialog.titles.presets")}`,
        },
        position: {
          width: window.innerWidth > 400 ? 400 : window.innerWidth - 100,
          height: "auto",
        },
        actions: {
          info: this.#info,
          update: this.#update,
          delete: this.#delete,
          activate: this.#activate,
          create: this.#create,
        },
      };

      static PARTS = {
        content: {
          template: `modules/${MODULE.ID}/templates/presets.hbs`,
        },
      };

      async _prepareContext() {
        const context = await super._prepareContext();
        context.DIALOG = {
          ID: MODULE.ID,
          TITLE: MODULE.TITLE,
        };
        context.presets = MODULE.setting("presets");
        return context;
      }

      static #info(event, target) {
        const presetKey = target.closest("li").dataset.preset;
        const preset = MODULE.setting("presets")[presetKey];
        const uninstalledModules = preset.modules.filter((module) => {
          return (game.modules.get(module.id) ?? false) == false;
        });
        const installedModules = preset.modules.filter((module) => {
          return (game.modules.get(module.id) ?? false) != false;
        });
        const output = [];
        if (uninstalledModules.length > 0) {
          output.push(
            `### ${MODULE.localize("dialog.presets.info.uninstalledModules")}`,
          );
          uninstalledModules.forEach((module) => {
            output.push(module.title);
          });
        }
        if (installedModules.length > 0) {
          if (uninstalledModules.length > 0) output.push("");
          output.push(
            `### ${MODULE.localize("dialog.presets.info.installedModules")}`,
          );
          installedModules.forEach((module) => {
            output.push(module.title);
          });
        }
        DialogV2.prompt({
          id: `${MODULE.ID}-preset-info`,
          window: {
            title: MODULE.TITLE,
          },
          content: `<p style="margin-top: 0px;">${MODULE.localize("dialog.presets.info.description", { name: preset.name })}</p>
          <textarea readonly rows="15" style="margin-bottom: 0.5rem;">${output.join("\n")}</textarea>`,
        });
      }

      static #update(event, target) {
        const presetKey = target.closest("li").dataset.preset;
        const presets = MODULE.setting("presets");

        // Get Active Modules
        const packages = document.querySelectorAll(
          "#module-management .package-list li.package",
        );
        const presetPackages = [];
        packages.forEach((elemPackage) => {
          if (
            elemPackage.querySelector('input[type="checkbox"]:checked') ??
            false
          ) {
            presetPackages.push({
              id: game.modules.get(elemPackage.dataset.moduleId).id,
              title: game.modules.get(elemPackage.dataset.moduleId).title,
            });
          }
        });

        DialogV2.confirm({
          id: `${MODULE.ID}-update-preset`,
          window: {
            title: MODULE.TITLE,
          },
          content: `<p style="margin-top: 0px;">${MODULE.localize("dialog.presets.update.description")}</p>
          <textarea readonly rows="${presetPackages.length <= 15 ? presetPackages.length + 2 : 15}" style="margin-bottom: 0.5rem;">### ${MODULE.localize("dialog.generic.activeModules")}\n${presetPackages
            .map((module) => {
              return module.title;
            })
            .join("\n")}</textarea>`,
          yes: {
            callback: () => {
              presets[presetKey].modules = presetPackages;
              MODULE.setting("presets", presets).then((response) => {
                MODULE.log("UPDATE", response);
              });
            },
          },
        });
      }

      static #delete(event, target) {
        const presetKey = target.closest("li").dataset.preset;
        const presets = MODULE.setting("presets");

        DialogV2.confirm({
          id: `${MODULE.ID}-delete-preset`,
          window: {
            title: MODULE.TITLE,
          },
          content: `<p style="margin-top: 0px;">${MODULE.localize("dialog.presets.delete.description", { name: presets[presetKey].name })}</p>
          <div class="notification warning">${MODULE.localize("dialog.presets.delete.warning")}</div>`,
          yes: {
            callback: () => {
              delete presets[presetKey];
              MODULE.setting("presets", presets).then(() => {
                target.closest("li").remove();
              });
            },
          },
        });
      }

      static #activate(event, target) {
        const presetKey = target.closest("li").dataset.preset;
        const moduleStates = game.settings.get(
          "core",
          ModuleManagement.SETTING,
        );
        const preset = MODULE.setting("presets")[presetKey];

        DialogV2.confirm({
          id: `${MODULE.ID}-activate-preset`,
          window: {
            title: MODULE.TITLE,
          },
          content: `<p style="margin-top: 0px;">${MODULE.localize("dialog.presets.activate.description")}</p>
          <textarea readonly rows="${preset.modules.length <= 15 ? preset.modules.length + 2 : 15}" style="margin-bottom: 0.5rem;">### ${MODULE.localize("dialog.generic.activeModules")}\n${preset.modules
            .filter((module) => {
              return (game.modules.get(module.id) ?? false) != false;
            })
            .map((module) => {
              return module.title;
            })
            .join("\n")}</textarea>`,
          yes: {
            callback: () => {
              // Disable All Modules
              for (const property in moduleStates)
                moduleStates[property] = false;

              // Enable Modules
              preset.modules.forEach((module) => {
                if (typeof moduleStates[module.id] != "undefined") {
                  moduleStates[module.id] = true;
                }
              });

              // Update Modules and Reload Game
              if (!MODULE.setting("storePreviousOnPreset"))
                MODULE.setting("storedRollback", {});
              game.settings
                .set("core", ModuleManagement.SETTING, moduleStates)
                .then(() => {
                  SettingsConfig.reloadConfirm({ world: true });
                });
            },
          },
        });
      }

      static #create() {
        const packages = document.querySelectorAll(
          "#module-management .package-list li.package",
        );
        const presetPackages = [];
        packages.forEach((elemPackage) => {
          if (
            elemPackage.querySelector('input[type="checkbox"]:checked') ??
            false
          ) {
            presetPackages.push({
              id: game.modules.get(elemPackage.dataset.moduleId).id,
              title: game.modules.get(elemPackage.dataset.moduleId).title,
            });
          }
        });

        DialogV2.confirm({
          id: `${MODULE.ID}-create-preset`,
          window: {
            title: MODULE.TITLE,
          },
          content: `<p style="margin-top: 0px;">${MODULE.localize("dialog.presets.create.title")}</p>
              <input type="text" name="${MODULE.ID}-preset-title" placeholder="${MODULE.localize("dialog.presets.create.placeholder")}" />
              <textarea readonly rows="${presetPackages.length <= 15 ? presetPackages.length + 2 : 15}" style="margin-bottom: 0.5rem;">### ${MODULE.localize("dialog.generic.activeModules")}\n${presetPackages
                .map((module) => {
                  return module.title;
                })
                .join("\n")}</textarea>`,
          yes: {
            callback: (event, target, dialog) => {
              const elemDialog = dialog.element;
              if (
                elemDialog.querySelector(
                  `input[name="${MODULE.ID}-preset-title"]`,
                )?.value?.length == 0
              ) {
                throw `<strong>${MODULE.TITLE}</strong> ${MODULE.localize("dialog.presets.create.notification.noTitleError")}`;
              }

              const presetKey = foundry.utils.randomID();
              MODULE.setting(
                "presets",
                mergeObject(
                  MODULE.setting("presets"),
                  {
                    [presetKey]: {
                      name: elemDialog.querySelector(
                        `input[name="${MODULE.ID}-preset-title"]`,
                      )?.value,
                      modules: presetPackages,
                    },
                  },
                  { inplace: false },
                ),
              ).then(() => {
                this.element
                  .querySelector(`#${MODULE.ID}-presets-list`)
                  .insertAdjacentHTML(
                    "beforeend",
                    `<li data-preset="${presetKey}">
                        <label for="preset-${presetKey}">${elemDialog.querySelector(`input[name="${MODULE.ID}-preset-title"]`)?.value}</label>
                        <button data-action="info" data-tooltip="${MODULE.localize("dialog.presets.tooltips.info")}">
                         <i class="fa-solid fa-circle-info"></i>
                        </button>
                        <button data-action="update" data-tooltip="${MODULE.localize("dialog.presets.tooltips.update")}">
                         <i class="fa-solid fa-floppy-disk"></i>
                        </button>
                        <button data-action="delete" data-tooltip="${MODULE.localize("dialog.presets.tooltips.delete")}">
                         <i class="fa-solid fa-trash"></i>
                        </button>
                        <button data-action="activate" data-tooltip="${MODULE.localize("dialog.presets.tooltips.activate")}">
                          <i class="fa-solid fa-circle-play"></i>
                        </button>
                      </li>`,
                  );
                return true;
              });
            },
          },
          no: {
            callback: () => {
              return "Player Rejected Setting";
            },
          },
          render: (event, dialog) => {
            setTimeout(() => {
              dialog.element
                .querySelector(
                  `input[type="text"][name="${MODULE.ID}-preset-title"]`,
                )
                .focus();
            }, 1);
          },
        });
      }
    }),
);
