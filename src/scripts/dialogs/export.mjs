// GET MODULE CORE
import { MODULE } from "../_module.mjs";

export class ExportDialog extends FormApplication {
  constructor(packages) {
    super();

    const moduleData = {};
    $(packages).each((index, module) => {
      if ($(module).find('input[type="checkbox"]').is(":checked")) {
        const moduleID = $(module).data("module-id");
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
          !Object.hasOwn(moduleData[setting.namespace].settings, setting.scope)
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

  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      title: `${MODULE.TITLE} - ${MODULE.localize("dialog.titles.export")}`,
      id: `${MODULE.ID}-export-dialog`,
      classes: ["dialog"],
      template: `modules/${MODULE.ID}/templates/export.hbs`,
      resizable: false,
      width: $(window).width() > 400 ? 400 : $(window).width() - 100,
      height: $(window).height() > 275 ? 275 : $(window).height() - 100,
    };
  }

  getData() {
    return {
      DIALOG: {
        ID: MODULE.ID,
        TITLE: MODULE.TITLE,
      },
      activeModules: () => {
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
      },
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    $(html)
      .find('[data-button="copy"]')
      .on("click", () => {
        try {
          navigator.clipboard.writeText(
            $(html).find(`#${MODULE.ID}-copy-export`).val(),
          );
        } catch {
          //Do nothing
        }
        ui.notifications.info(
          `<strong>${MODULE.TITLE}</strong>: ${MODULE.localize("dialog.export.notification.copied")}`,
        );
      });

    $(html)
      .find('[data-button="export"]')
      .on("click", () => {
        foundry.utils.saveDataToFile(
          JSON.stringify(this.moduleData, null, 4),
          "application/json",
          "PackageList.json",
        );
      });
  }
}
