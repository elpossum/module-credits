// GET MODULE CORE
import { MODULE } from "../_module.mjs";
import { ModuleManagement, SettingsConfig } from "../init.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export let ImportDialog;

Hooks.on(
  "i18nInit",
  () =>
    (ImportDialog = class ImportDialog extends (
      HandlebarsApplicationMixin(ApplicationV2)
    ) {
      constructor({ moduleData, importType }) {
        super();

        // Format Module Data
        for (const key of Object.keys(moduleData)) {
          moduleData[key].isInstalled = game.modules.has(key) ?? false;
          /*moduleData[key].isNewerVersion = isNewerVersion(module?.version ?? "0.0.0", game.modules.get(key)?.version ?? "0.0.0");
          moduleData[key].isCurrentVersion = !moduleData[key].isNewerVersion && (module?.version ?? "0.0.0") == (game.modules.get(key)?.version ?? "0.0.0");
          moduleData[key].isOlderVersion = !moduleData[key].isNewerVersion && !moduleData[key].isCurrentVersion*/
          moduleData[key].hasClientSettings =
            moduleData[key].isInstalled &&
            (moduleData[key]?.settings?.client ?? false);
          moduleData[key].hasWorldSettings =
            moduleData[key].isInstalled &&
            (moduleData[key]?.settings?.world ?? false);
        }

        this.importType = importType;
        this.moduleData = moduleData;
      }

      static DEFAULT_OPTIONS = {
        title: `${MODULE.TITLE} - ${MODULE.localize("dialog.titles.import")}`,
        id: `${MODULE.ID}-import-dialog`,
        classes: ["dialog"],
        tag: "form",
        form: {
          handler: this.#submitForm,
          submitOnChange: false,
          closeOnSubmit: true,
        },
        window: {
          resizable: false,
          title: `${MODULE.TITLE} - ${MODULE.localize("dialog.titles.import")}`,
        },
        position: {
          width: window.innerWidth > 580 ? 580 : window.innerWidth - 100,
          height: "auto",
        },
      };

      static PARTS = {
        form: {
          template: `modules/${MODULE.ID}/templates/import.hbs`,
        },
      };

      async _prepareContext() {
        const context = await super._prepareContext();
        context.DIALOG = {
          ID: MODULE.ID,
          TITLE: MODULE.TITLE,
        };
        context.modules = this.moduleData;
        context.IsTidyUI = this.importType == "tidy-ui_game-settings";
        context.IsGM = game.user.isGM;
        return context;
      }

      processSettingData(moduleID, type, settings) {
        return new Promise((resolve) => {
          for (const [key, setting] of Object.entries(settings)) {
            if (type == "client") {
              game.settings.storage
                .get(type)
                .setItem(`${moduleID}.${key}`, setting);
              resolve({ moduleID, key, setting });
            } else if (type == "world" && game.user.isGM) {
              SocketInterface.dispatch("modifyDocument", {
                type: "Setting",
                action: "update",
                data: {
                  key: `${moduleID}.${key}`,
                  value: setting,
                },
              }).then((response) => {
                resolve({ moduleID, key, setting, response });
              });
            } else {
              resolve(false);
            }
          }
        });
      }

      static async #submitForm(event, form) {
        event.preventDefault();
        const keepActiveModules = form.querySelector(
          '.dialog-buttons input[name="keep-enabled-modules"]',
        ).checked;
        const moduleStates = game.settings.get(
          "core",
          ModuleManagement.SETTING,
        );
        const moduleManagment =
          foundry.applications.instances.get("module-management").element;
        const settingsCalls = [];

        // check if User Wants to keep their currently Enabled modules
        if (!keepActiveModules) {
          moduleManagment
            .querySelectorAll('#module-list li.package input[type="checkbox"]')
            .forEach((checkbox) => (checkbox.checked = false));
          moduleManagment
            .querySelectorAll('#module-list li.package input[type="checkbox"]')
            .forEach((checkbox) => checkbox.classList.remove("active"));

          // Disable All Modules
          for (const property in moduleStates) moduleStates[property] = false;
        }

        form
          .querySelectorAll('ul li[data-module] input[type="checkbox"]')
          .forEach((checkbox) => (checkbox.disabled = true));
        form.querySelectorAll("ul li[data-module]").forEach((module) => {
          const moduleID = module.dataset.module;
          const isEnabled = module.querySelector(
            `input[name="import-module"][type="checkbox"]`,
          ).checked;
          const importClientSettings =
            module.querySelector(
              `input[name="import-${moduleID}-settings-client"][type="checkbox"]`,
            )?.checked ?? false;
          const importWorldSettings =
            module.querySelector(
              `input[name="import-${moduleID}-settings-world"][type="checkbox"]`,
            )?.checked ?? false;

          // Control Module Active Status
          moduleStates[moduleID] = isEnabled;

          moduleManagment
            .querySelectorAll(
              `#module-list li.package[data-module-name="${moduleID}"] input[type="checkbox"]`,
            )
            .forEach((checkbox) => (checkbox.checked = isEnabled));
          moduleManagment
            .querySelectorAll(
              `#module-list li.package[data-module-name="${moduleID}"] input[type="checkbox"]`,
            )
            .forEach((checkbox) => checkbox.classList.toggle("active", isEnabled));

          if (isEnabled) {
            // Import World Settings
            if (
              importWorldSettings &&
              (this.moduleData[moduleID]?.settings?.world ?? false)
            ) {
              settingsCalls.push(
                this.processSettingData(
                  moduleID,
                  "world",
                  this.moduleData[moduleID]?.settings?.world,
                ),
              );
            }

            // Import Client Settings
            if (
              importClientSettings &&
              (this.moduleData[moduleID]?.settings?.client ?? false)
            ) {
              settingsCalls.push(
                this.processSettingData(
                  moduleID,
                  "client",
                  this.moduleData[moduleID]?.settings?.client,
                ),
              );
            }
          }
        });

        Promise.allSettled(settingsCalls).then(() => {
          if (!MODULE.setting("storePreviousOnPreset"))
            MODULE.setting("storedRollback", {});
          game.settings
            .set("core", ModuleManagement.SETTING, moduleStates)
            .then(() => {
              SettingsConfig.reloadConfirm({ world: true });
            });
        });
      }

      _onChangeForm(formConfig, event) {
        super._onChangeForm(formConfig, event);
        switch (event.target.name) {
          case "import-module": {
            this.enabledModulesToImport = this.form.querySelectorAll(
              'li[data-module] input[name="import-module"]:not([disabled]):checked',
            ).length;

            this.form.querySelector(
              'input[name="import-toggle-modules"]',
            ).indeterminate =
              this.enabledModulesToImport > 0 &&
              this.enabledModulesToImport != this.totalModulesToImport;
            this.form.querySelector(
              'input[name="import-toggle-modules"]',
            ).checked =
              this.enabledModulesToImport == this.totalModulesToImport;
            break;
          }
          case "import-toggle-modules": {
            this.form
              .querySelectorAll(
                'li[data-module] input[name="import-module"]:not([disabled])',
              )
              .forEach((el) => {
                el.indeterminate = false;
              });
            this.form
              .querySelectorAll(
                'li[data-module] input[name="import-module"]:not([disabled])',
              )
              .forEach((el) => {
                el.checked = this.form.querySelector(
                  'input[name="import-toggle-modules"]',
                ).checked;
              });
            break;
          }
          case "import-settings-client": {
            this.enabledClientSettingsToImport = this.form.querySelectorAll(
              'li[data-module] input[name="import-settings-client"]:not([disabled]):checked',
            ).length;

            this.form.querySelector(
              'input[name="import-toggle-client-settings"]',
            ).indeterminate =
              this.enabledClientSettingsToImport > 0 &&
              this.enabledClientSettingsToImport !=
                this.totalClientSettingsToImport;
            this.form.querySelector(
              'input[name="import-toggle-client-settings"]',
            ).checked =
              this.enabledClientSettingsToImport ==
              this.totalClientSettingsToImport;
            break;
          }
          case "import-toggle-client-settings": {
            this.form
              .querySelectorAll(
                'li[data-module] input[name="import-settings-client"]:not([disabled])',
              )
              .forEach((el) => {
                el.indeterminate = false;
              });
            this.form
              .querySelectorAll(
                'li[data-module] input[name="import-settings-client"]:not([disabled])',
              )
              .forEach((el) => {
                el.checked = this.form.querySelector(
                  'input[name="import-toggle-client-settings"]',
                ).checked;
              });
            break;
          }
          case "import-settings-world": {
            this.enabledWorldSettingsToImport = this.form.querySelectorAll(
              'li[data-module] input[name="import-settings-world"]:not([disabled]):checked',
            ).length;

            this.form.querySelector(
              'input[name="import-toggle-world-settings"]',
            ).indeterminate =
              this.enabledWorldSettingsToImport > 0 &&
              this.enabledWorldSettingsToImport !=
                this.totalWorldSettingsToImport;
            this.form.querySelector(
              'input[name="import-toggle-world-settings"]',
            ).checked =
              this.enabledWorldSettingsToImport ==
              this.totalWorldSettingsToImport;
            break;
          }
          case "import-toggle-world-settings": {
            this.form
              .querySelectorAll(
                'li[data-module] input[name="import-settings-world"]:not([disabled])',
              )
              .forEach((el) => {
                el.indeterminate = false;
              });
            this.form
              .querySelectorAll(
                'li[data-module] input[name="import-settings-world"]:not([disabled])',
              )
              .forEach((el) => {
                el.checked = this.form.querySelector(
                  'input[name="import-toggle-world-settings"]',
                ).checked;
              });
            break;
          }
        }
      }

      async _onFirstRender() {
        this.totalModulesToImport = this.form.querySelectorAll(
          'li[data-module] input[name="import-module"]:not([disabled])',
        ).length;
        this.enabledModulesToImport = this.form.querySelectorAll(
          'li[data-module] input[name="import-module"]:not([disabled]):checked',
        ).length;
        this.totalClientSettingsToImport = this.form.querySelectorAll(
          'li[data-module] input[name="import-settings-client"]:not([disabled])',
        ).length;
        this.enabledClientSettingsToImport = this.form.querySelectorAll(
          'li[data-module] input[name="import-settings-client"]:not([disabled]):checked',
        ).length;
        this.totalWorldSettingsToImport = this.form.querySelectorAll(
          'li[data-module] input[name="import-settings-world"]:not([disabled])',
        ).length;
        this.enabledWorldSettingsToImport = this.form.querySelectorAll(
          'li[data-module] input[name="import-settings-world"]:not([disabled]):checked',
        ).length;
        // Set Import Module Checkbox Initial State
        this.form
          .querySelectorAll('input[name="import-toggle-modules"]')
          .forEach((checkbox) => {
            checkbox.indeterminate =
              this.enabledModulesToImport > 0 &&
              this.enabledModulesToImport != this.totalModulesToImport;
          });
        this.form
          .querySelectorAll('input[name="import-toggle-modules"]')
          .forEach((checkbox) => {
            checkbox.checked =
              this.enabledModulesToImport == this.totalModulesToImport;
          });
      }
    }),
);
