// GET MODULE CORE
import { MODULE } from "../_module.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export let ExportDialog;

Hooks.once(
  "i18nInit",
  () =>
    (ExportDialog = class ExportDialog extends (
      HandlebarsApplicationMixin(ApplicationV2)
    ) {
      constructor({ packages }) {
        super();

        const moduleData = {};
        packages.forEach((module) => {
          if (module.querySelector('input[type="checkbox"]').checked) {
            const moduleID = module.dataset.moduleId;
            moduleData[moduleID] = {
              title: game.modules.get(moduleID)?.title ?? "",
              version: game.modules.get(moduleID)?.version ?? "0.0.0",
              bugs: game.modules.get(moduleID)?.bugs ?? false,
              settings: {},
            };
          }
        });

        // Get Module Settings
        for (const setting of game.settings.settings.values()) {
          if (Object.hasOwn(moduleData, setting.namespace)) {
            if (
              !Object.hasOwn(
                moduleData[setting.namespace].settings,
                setting.scope,
              )
            ) {
              moduleData[setting.namespace].settings[setting.scope] = {};
            }

            moduleData[setting.namespace].settings[setting.scope][setting.key] =
              game.settings.storage
                .get(setting.scope)
                .getItem(`${setting.namespace}.${setting.key}`);
          }
        }

        this.moduleData = moduleData;
      }

      static DEFAULT_OPTIONS = {
        id: `${MODULE.ID}-export-dialog`,
        classes: ["dialog"],
        window: {
          resizable: false,
          title: `${MODULE.TITLE} - ${MODULE.localize("dialog.titles.export")}`,
        },
        position: {
          width: window.innerWidth > 400 ? 400 : window.innerWidth - 100,
          height: "auto",
        },
        actions: {
          copy: this.#copy,
          export: this.#export,
        },
      };

      async _prepareContext() {
        const context = await super._prepareContext();
        context.DIALOG = {
          ID: MODULE.ID,
          TITLE: MODULE.TITLE,
        };
        context.activeModules = () => {
          // Build Markdown Display
          const markdown = [
            `### ${MODULE.localize("dialog.generic.activeModules")}`,
          ];
          for (const value of Object.values(this.moduleData)) {
            markdown.push(
              `${value.title} v${value.version}` +
                (value.bugs
                  ? ` [${MODULE.localize("dialog.export.bugsUrl")}](${value.bugs})`
                  : ""),
            );
          }
          return markdown.join("\n");
        };
        return context;
      }

      static PARTS = {
        content: {
          template: `modules/${MODULE.ID}/templates/export.hbs`,
        },
      };

      static #copy() {
        try {
          const text = this.element.querySelector(
            `#${MODULE.ID}-copy-export`,
          ).value;
          navigator.clipboard.writeText(text);
        } catch {
          //Do nothing
        }
        ui.notifications.info(
          `<strong>${MODULE.TITLE}</strong>: ${MODULE.localize("dialog.export.notification.copied")}`,
        );
      }

      static #export() {
        foundry.utils.saveDataToFile(
          JSON.stringify(this.moduleData, null, 4),
          "application/json",
          "PackageList.json",
        );
      }
    }),
);
