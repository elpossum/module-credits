// GET REQUIRED LIBRARIES
import tippy, { hideAll } from "tippy.js";
import PublicGoogleSheetsParser from "public-google-sheets-parser";

// GET MODULE CORE
import { MODULE } from "./_module.mjs";
import { PreviewDialog } from "./dialogs/preview.mjs";
import { ExportDialog } from "./dialogs/export.mjs";
import { ImportDialog } from "./dialogs/import.mjs";
import { PresetDialog } from "./dialogs/presets.mjs";
import {
  ModuleManagement,
  SettingsConfig,
  mergeObject,
  isNewerVersion,
  ContextMenu,
} from "./init.mjs";

// DEFINE MODULE CLASS
export class MMP {
  static socket = false;
  static #LockedSettings = {};

  /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
  // MODULE SUPPORT CODE
  /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
  // MODULE SUPPORT FOR || 🐛 Bug Reporter Support ||
  static bugReporterSupport(moduleData) {
    // 🐛 Bug Reporter Support
    const bugReporter = game.modules.get("bug-reporter") || { api: undefined };

    // Check if Bug Reporter is Exists and Enabled
    return (
      typeof bugReporter.api != "undefined" &&
      moduleData?.flags?.allowBugReporter
    );
  }

  // MODULE SUPPORT FOR || socketlib ||
  static registerSocketLib() {
    this.socket = socketlib.registerModule(MODULE.ID);
    this.socket.register("useFilePicker", this.useFilePicker);
    this.socket.register("setUserSetting", this.setUserSetting);
    this.socket.register("getGMSetting", this.getGMSetting);
  }

  static async getGMSetting({ moduleId, settingName }) {
    return await game.settings.get(moduleId, settingName);
  }

  static async setUserSetting({ moduleId, settingName, settingValue }) {
    MODULE.log(
      "RECIEVED SETTING",
      moduleId,
      settingName,
      settingValue,
      game.settings.settings.get(`${moduleId}.${settingName}`).name,
    );
    function setSetting(moduleId, settingName, settingValue) {
      game.settings
        .set(moduleId, settingName, settingValue)
        .then((response) => {
          if (
            game.settings.settings.get(`${moduleId}.${settingName}`)
              ?.requiresReload ??
            false
          )
            location.reload();
          return response;
        });
    }

    if (MODULE.setting("disableSyncPrompt")) {
      return setSetting(moduleId, settingName, settingValue);
    } else {
      return await Dialog.confirm({
        title: MODULE.localize("title"),
        content: `<p style="margin-top:0px;">${MODULE.localize("dialog.clientSettings.syncSetting.askPermission")}</p> 
					<p>${game.i18n.localize(game.settings.settings.get(moduleId + "." + settingName).name)}<br/>
					${game.i18n.localize(game.settings.settings.get(moduleId + "." + settingName).hint)}</p>`,
        yes: () => {
          return setSetting(moduleId, settingName, settingValue);
        },
        no: () => {
          return "Player Rejected Setting";
        },
      });
    }
  }

  // DEFINE API
  static installAPI() {
    game.modules.get(MODULE.ID).API = {
      getContent: async (module, fileType, options = { dir: "modules" }) => {
        const fileString = `./${options.dir}/${module.id}/${fileType}${fileType.toLowerCase() === "license" ? "" : ".md"}`;
        const fileExists = await foundry.utils.srcExists(fileString);

        if (fileExists == false || fileExists == undefined) {
          return await this.getGithubMarkdown(module[fileType.toLowerCase()]);
        }

        return await this.getFile(fileString);
      },
    };
  }

  static init() {
    this.installAPI();

    this.getChangelogs();

    if (game.user.isGM) MODULE.setting("storedRollback", {});
    MMP.#LockedSettings = MODULE.setting("lockedSettings");
  }

  /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
  // WHAT IS THIS?
  /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
  static get hasPermission() {
    return (
      game.permissions.FILES_BROWSE.includes(game.user.role) ||
      (game.modules.get("socketlib")?.active ?? false)
    );
  }
  static get isGMOnline() {
    return game.users.find((user) => user.isGM && user.active);
  }

  /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
  // FUNCTIONS
  /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
  static async useFilePicker(url, options = {}) {
    // IF URL HAS FILE EXTENSION, ASSUME WE ARE LOOKING FOR A SPECIFIC FILE
    const getFile = url.split("/").pop().includes(".");

    return await foundry.applications.apps.FilePicker.implementation
      .browse("user", url, options)
      .then((response) => {
        const files = getFile
          ? []
          : response.files.filter((file) =>
              file.toLowerCase().endsWith(url.split("/").pop().toLowerCase()),
            );
        if (files.length > 0 || !getFile) {
          return getFile ? files[0] : response.files;
        }
        throw TypeError(`unable to access ${url}`);
      })
      .then((file) => file)
      .catch((error) => {
        MODULE.debug(error);
        return false;
      });
  }

  static async useFetch(url) {
    return await fetch(url)
      .then((response) => {
        if (response.status >= 200 && response.status <= 299) {
          return response;
        }
        throw TypeError("unable to fetch file content");
      })
      .then(() => {
        return url;
      })
      .catch((error) => {
        MODULE.debug(error);
        return false;
      });
  }

  static async checkIfFilesExists(url, options = {}) {
    // Check if User is able to use FilePicker
    if (!this.hasPermission) return false;

    // Use socketlib if user does not have access to `FILES_BROWSE`
    if (
      !game.permissions.FILES_BROWSE.includes(game.user.role) &&
      this.isGMOnline
    ) {
      return await this.socket
        .executeAsGM("useFilePicker", url, options)
        .then((file) => file);
    }

    // Else use file picker directly
    return await this.useFilePicker(url, options).then((file) => file);
  }

  static async getFile(url) {
    return await fetch(url)
      .then((response) => {
        if (response.status >= 200 && response.status <= 299) {
          if (url.split(".").pop().toLowerCase().startsWith("json")) {
            return response.json();
          } else {
            return response.text();
          }
        }
        throw TypeError("unable to fetch file content");
      })
      .catch((error) => {
        MODULE.debug(error);
        return false;
      });
  }

  static async getGithubMarkdown(url) {
    // Supported Remote APIs
    const APIs = {
      github:
        /https?:\/\/github.com\/(?<user>[^/]+)\/(?<repo>[^/]+)\/blob\/[^/]+\/(?<path>.*)/,
      rawGithub:
        /https?:\/\/raw.githubusercontent.com\/(?<user>[^/]+)\/(?<repo>[^/]+)\/master\/(?<path>.*)/,
    };
    if (url.match(APIs.github) || url.match(APIs.rawGithub)) {
      const { user, repo, path } = (
        url.match(APIs.github) ?? url.match(APIs.rawGithub)
      ).groups;
      return await fetch(
        `https://api.github.com/repos/${user}/${repo}/contents/${path}`,
      )
        .then((response) => {
          if (response.status >= 200 && response.status <= 299) {
            try {
              return response.json();
            } catch {
              throw TypeError("unable to fetch file content");
            }
          }
          throw TypeError("unable to fetch file content");
        })
        .then((response) => {
          return atob(response.content);
        })
        .catch((error) => {
          MODULE.debug(error);
          return false;
        });
    }
  }

  static async globalConflicts() {
    return new PublicGoogleSheetsParser()
      .parse("1eRcaqt8VtgDRC-iWP3SfOnXh-7kIw2k7po9-3dcftAk")
      .then((items) => {
        const globalConflicts = [];
        items.forEach((conflict) => {
          if (conflict?.["Module ID"] ?? false) {
            if (
              ((conflict?.["Type"] ?? "").toLowerCase() == "system" &&
                game.system.id == (conflict?.["Package ID"] ?? "")) ||
              (conflict?.["Type"] ?? "").toLowerCase() != "system"
            ) {
              globalConflicts.push({
                id: conflict?.["Module ID"],
                packageId: conflict?.["Package ID"] ?? undefined,
                type: conflict?.["Type"] ?? false,
                manifest: conflict?.["Manifest URL"] ?? "",
                reason: conflict?.["Reason"] ?? "",
                compatibility: {
                  minimum: conflict?.["Compatibility Minimum"] ?? "0.0.0",
                  maximum: conflict?.["Compatibility Maximum"] ?? undefined,
                  version: conflict?.["Compatibility Version"] ?? undefined,
                },
              });
            }
          }
        });
        return globalConflicts;
      });
  }

  static getModuleProperty(moduleID, property) {
    if (property.lastIndexOf(".") == -1) property = "." + property;
    const indexOfProperty =
      property.lastIndexOf(".") >= 0 ? property.lastIndexOf(".") : 0;
    const flagsPath = (
      property.slice(0, indexOfProperty) +
      ".flags." +
      property.slice(indexOfProperty + 1)
    ).substring(1);

    return (
      foundry.utils.getProperty(
        game.modules.get(moduleID),
        property.substring(1),
      ) ??
      foundry.utils.getProperty(game.modules.get(moduleID), flagsPath) ??
      false
    );
  }

  static async cleanUpRemovedChangelogs() {
    const trackedChangelogs = MODULE.setting("trackedChangelogs");

    for (const [key, module] of Object.entries(trackedChangelogs)) {
      if (!game.modules.has(key)) {
        MODULE.debug(
          `${module.title} is no longer installed, remove from tracked changelogs`,
        );
        delete trackedChangelogs[key];
      }
    }

    return await MODULE.setting("trackedChangelogs", trackedChangelogs);
  }

  static async getChangelogs() {
    for await (const [key, module] of game.modules.entries()) {
      //const module = game.modules.get(key);
      // Get Files From Server
      const getFiles = await MMP.checkIfFilesExists(`./modules/${key}/`, {
        extensions: [".md"],
      });
      const changelog = getFiles
        ? getFiles.filter((file) =>
            file.toLowerCase().endsWith("CHANGELOG.md".toLowerCase()),
          )[0]
        : false;

      // Track Changelogs
      // Check if version is newer then saved.
      if (changelog && game.user.isGM) {
        const version =
          module?.version != "This is auto replaced"
            ? module?.version
            : "0.0.0";
        let hasSeen =
          MODULE.setting("trackedChangelogs")?.[key]?.hasSeen ?? false;
        if (
          isNewerVersion(
            version ?? "0.0.0",
            MODULE.setting("trackedChangelogs")?.[key]?.version ?? "0.0.0",
          )
        ) {
          MODULE.debug(
            `${module.title} is newer then last seen, set hasSeen to false`,
          );
          hasSeen = false;
        }
        await MODULE.setting(
          "trackedChangelogs",
          mergeObject(MODULE.setting("trackedChangelogs"), {
            [key]: {
              title: module?.title,
              version: version ?? "0.0.0",
              hasSeen: hasSeen,
              type: "CHANGELOG",
            },
          }),
        );
      }
    }

    // Clean Up changelogs
    await this.cleanUpRemovedChangelogs();

    // If the user is the GM and has show New Changelogs on Load
    if (MODULE.setting("showNewChangelogsOnLoad") && game.user.isGM) {
      const unSeenChangelogs = Object.keys(
        MODULE.setting("trackedChangelogs"),
      ).reduce((result, key) => {
        if (!MODULE.setting("trackedChangelogs")[key].hasSeen)
          result[key] = MODULE.setting("trackedChangelogs")[key];
        return result;
      }, {});
      if (Object.keys(unSeenChangelogs).length >= 1)
        new PreviewDialog(unSeenChangelogs).render(true);
    }
  }

  /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
  // F### Your Emoji (Better Title Sorting)
  // ? Needs to be rewritten to use plain JS
  /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
  static smartLabel(module) {
    // If user has overwritten Module Name, Return Overwrite
    if (MODULE.setting("renamedModules")[module.id] ?? false)
      return MODULE.setting("renamedModules")[module.id];

    // Handle for Smart Prefixing
    if (MODULE.setting("smartPrefix")) {
      // Merge Library Modules
      if (module?.library ?? false)
        return `${MODULE.localize("settings.smartPrefix.prefixes.library")} - ${module.title.replace("lib - ", "")}`;
      // Is Module a UI Module
      if (
        [" UI", "UI "].some(
          (checkfor) =>
            (module?.title ?? "").toUpperCase().includes(checkfor) ?? false,
        ) ||
        (module?.title ?? "").toUpperCase().endsWith("UI")
      )
        return `${MODULE.localize("settings.smartPrefix.prefixes.ui")} - ${module.title}`;
      // Is Module a Map Pack
      if (
        ["MAPS", "BATTLEMAP"].some((checkfor) =>
          (module?.title ?? "").toUpperCase().includes(checkfor),
        )
      )
        return `${MODULE.localize("settings.smartPrefix.prefixes.maps")} - ${module.title}`;
    }

    // If Auto Prefix is Disabled, return Module Title
    if (!MODULE.setting("smartLabels")) return module.title;
    // If Module does not require any other modules, return Module title
    if ((module?.relationships?.requires ?? []).length == 0)
      return module.title;

    // Build Prefix based off Module Requirements
    let prefixes = [];
    (module?.relationships?.requires ?? []).forEach((requiredModule) => {
      // Exclude Library Modules
      if (
        !game.modules.get(requiredModule?.id)?.library &&
        (game.modules.get(requiredModule?.id)?.title ?? false)
      ) {
        const labelDetails = MMP.smartLabel(
          game.modules.get(requiredModule?.id),
        );
        prefixes = prefixes.concat(labelDetails);
        prefixes.push(game.modules.get(requiredModule?.id)?.title);
        prefixes = [...new Set(prefixes)];
      }
    });

    return prefixes ?? [];
  }

  static screwYourEmoji(elements, titleSelector) {
    $(elements).each((index, element) => {
      let smartLabel = this.smartLabel(
        game.modules.get(element.dataset.moduleId),
      );
      const sortLabel =
        typeof smartLabel == "string"
          ? smartLabel
          : smartLabel.join("") +
            game.modules.get(element.dataset.moduleId).title;
      if (typeof smartLabel != "string") {
        const tooltips = smartLabel.join(" / ");
        smartLabel = `${smartLabel.length > 0 ? '<i class="fa-regular fa-arrow-turn-down-right" data-tooltip="' + tooltips + '"></i> ' : ""}${game.modules.get(element.dataset.moduleId).title}`;
      }
      $(Array.from(element.querySelectorAll(titleSelector)).pop())
        .contents()
        .filter(function () {
          return this.nodeType == 3;
        })
        .last()
        .replaceWith(smartLabel ?? "");

      $(element).attr(
        "data-sort-title",
        sortLabel.toUpperCase().replace(/[^\w]/gi, ""),
      );
    });

    // Sort Elements and Append To parent to Replace Order
    $(elements)
      .sort((firstEl, secondEl) => {
        return $(secondEl).attr("data-sort-title") <
          $(firstEl).attr("data-sort-title")
          ? 1
          : -1;
      })
      .appendTo($(elements).parent());
  }

  static async renderModuleManagement(app, elem) {
    // Supported Remote APIs
    const APIs = {
      github:
        /https?:\/\/github.com\/(?<user>[^/]+)\/(?<repo>[^/]+)\/blob\/[^/]+\/(?<path>.*)/,
      rawGithub:
        /https?:\/\/raw.githubusercontent.com\/(?<user>[^/]+)\/(?<repo>[^/]+)\/master\/(?<path>.*)/,
    };

    const expandButton = elem.querySelector(
      "search.flexrow button[data-action='toggleExpanded']",
    );
    expandButton.addEventListener("click", () => {
      elem.querySelectorAll(".package-description").forEach((desc) => {
        desc.classList.toggle("hidden");
      });
    });

    // Check for Big Picture Mode
    if (MODULE.setting("bigPictureMode"))
      elem.classList.add(`${MODULE.ID}-big-picture-mode`);

    /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
    // F### Your Emoji (Better Title Sorting)
    // ? Needs to be rewritten to use plain JS
    /* ─────────────── ⋆⋅☆⋅⋆ ─────────────── */
    MMP.screwYourEmoji(
      $(elem).find(".package-list .package"),
      ".package-title .title-group .title, .package-title",
    );

    // Focus on Filter
    elem.querySelector('search.flexrow input[type="search"]').focus();

    if (game.user.isGM) {
      // Add Presets Button
      elem.querySelector("search.flexrow").insertAdjacentHTML(
        "afterbegin",
        `<button type="button" class="" data-action="presets" data-tooltip="${MODULE.localize("dialog.moduleManagement.tooltips.managePresets")}">
				<i class="fa-solid fa-list-check"></i>
			</button>`,
      );
      elem
        .querySelector('search.flexrow button[data-action="presets"]')
        .addEventListener("click", () => {
          new PresetDialog().render(true);
        });

      // Add Export Button
      expandButton.insertAdjacentHTML(
        "beforebegin",
        `<button type="button" class="" data-action="export" data-tooltip="${MODULE.localize("dialog.moduleManagement.tooltips.exportModules")}">
				<i class="fa-solid fa-download"></i>
			</button>`,
      );
      elem
        .querySelector('search.flexrow button[data-action="export"]')
        .addEventListener("click", () => {
          new ExportDialog({
            packages: elem.querySelectorAll(".package-list li.package"),
          }).render(true);
        });

      // Add Import Button
      // ? Update import logic to be pure javascript
      expandButton.insertAdjacentHTML(
        "beforebegin",
        `<button type="button" class="" data-action="import" data-tooltip="${MODULE.localize("dialog.moduleManagement.tooltips.importModules")}">
				<i class="fa-solid fa-upload"></i>
			</button>`,
      );
      elem
        .querySelector('search.flexrow button[data-action="import"]')
        .addEventListener("click", () => {
          $('<input type="file">')
            .on("change", (event) => {
              const fileData = event.target.files[0];
              // Check if User Selected a File.
              if (!fileData) return false;
              // Check if User Selected JSON File
              if (fileData.type != "application/json") {
                ui.notifications.error(
                  `<strong>${MODULE.TITLE}</strong> Please select a JSON file.`,
                );
                return false;
              }

              // Read File Data
              foundry.utils
                .readTextFromFile(fileData)
                .then(async (response) => {
                  try {
                    // Convert Response into JSON
                    const responseJSON = JSON.parse(response);
                    let moduleData = {};
                    let importType = MODULE.ID;

                    // Check if Import is for TidyUI
                    if (Object.hasOwn(responseJSON, "activeModules") ?? false) {
                      importType = "tidy-ui_game-settings";
                      responseJSON.activeModules.forEach((module) => {
                        moduleData[module.id] = {
                          title: module.title,
                          version: module.version,
                          settings: {
                            client: undefined,
                            world: undefined,
                          },
                        };
                      });
                    } else if (
                      Object.hasOwn(
                        responseJSON?.[Object.keys(responseJSON)[0]],
                        "title",
                      ) ??
                      false
                    ) {
                      moduleData = responseJSON;
                    } else {
                      ui.notifications.error(
                        `<strong>${MODULE.TITLE}</strong> Unable to determine how to load file.`,
                      );
                      return false;
                    }

                    // Show Import Dialog
                    new ImportDialog({ moduleData, importType }).render(true);
                  } catch (error) {
                    MODULE.error("Failed to read selected file", error);
                    ui.notifications.error(
                      `<strong>${MODULE.TITLE}</strong> Failed to read selected file.`,
                    );
                    return false;
                  }
                });
            })
            .trigger("click");
          //new ImportDialog({}).render(true);
        });

      // Convert Filters To Dropdown
      if (elem.querySelectorAll(`search.flexrow a.filter`)?.length > 0) {
        const lastFilter = Array.from(
          elem.querySelectorAll("search.flexrow a.filter"),
        ).pop();
        const lockedCount = Object.keys(MODULE.setting("lockedModules")).length;
        lastFilter.insertAdjacentHTML(
          "afterend",
          `<a class="filter" data-filter="locked">${MODULE.localize("dialog.moduleManagement.lockedModules")} (${lockedCount})</a>`,
        );
        elem
          .querySelector('search.flexrow a.filter[data-filter="locked"]')
          .addEventListener("click", (event) => {
            elem
              .querySelector("search.flexrow a.filter.active")
              .classList.remove("active");
            event.target.classList.add("active");

            elem
              .querySelectorAll(`.package-list .package`)
              .forEach((elemPackage) => {
                elemPackage.classList.add("hidden");
              });

            for (const key of Object.keys(MODULE.setting("lockedModules"))) {
              elem
                .querySelector(
                  `.package-list .package[data-module-id="${key}"]`,
                )
                .classList.remove("hidden");
            }
          });

        elem
          .querySelector('search.flexrow input[type="search"]')
          .insertAdjacentHTML(
            "afterend",
            `<select data-action="filter"></select>`,
          );
        elem
          .querySelectorAll("search.flexrow a.filter")
          .forEach((filterOpt) => {
            elem
              .querySelector('search.flexrow select[data-action="filter"]')
              .insertAdjacentHTML(
                "beforeend",
                `<option value="${filterOpt.dataset.filter}">${filterOpt.innerHTML}</option>`,
              );
          });
        elem.querySelector(
          `search.flexrow select[data-action="filter"]`,
        ).value = elem.querySelector(
          "search.flexrow a.filter.active",
        ).dataset.filter;
        elem
          .querySelector(`search.flexrow select[data-action="filter"]`)
          .addEventListener("change", (event) => {
            if (event.target.value !== "locked") {
              elem
                .querySelectorAll(".package-list .package")
                .forEach((elemPackage) => {
                  elemPackage.classList.remove("hidden");
                });
            }
            elem
              .querySelector(
                `search.flexrow a.filter[data-filter="${event.target.value}"]`,
              )
              .click();
          });
      }
    }

    // Get Modules with Settings
    const hasSettings = {};
    const settings = game.settings.settings.values();
    for (let setting of settings) {
      if (
        setting.namespace != "core" &&
        setting.namespace != game.system.id &&
        setting.config
      )
        hasSettings[setting.namespace] = true;
    }

    // Loop Through Modules
    function isURL(url) {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    }
    function getContent(key, value) {
      if (isURL(value)) {
        const domain =
          value
            .match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n?]+)\./i)[1]
            ?.toLowerCase() ?? value;
        const tagType = Object.hasOwn(supportedAuthorTags, domain)
          ? domain
          : key;
        const urlDisplay =
          value.match(
            /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n?]+)\./i,
          )[1] ?? key;
        return `<li><a href="${value}" target="_blank">${supportedAuthorTags[tagType]?.icon ?? ""}${tagType == "url" ? urlDisplay : tagType}</a></li>`;
      } else if (
        ["twitter", "patreon", "github", "reddit", "ko-fi"].includes(key)
      ) {
        return `<li><a href="https://www.${key}.com/${value}" target="_blank">${supportedAuthorTags[key]?.icon ?? ""}${key}</a></li>`;
      } else {
        return `<li><div>${supportedAuthorTags[key]?.icon ?? ""}${value}</div></li>`;
      }
    }
    const supportedAuthorTags = {
      email: {
        icon: '<i class="fa-solid fa-envelope"></i>',
      },
      url: {
        icon: '<i class="fa-solid fa-link"></i>',
      },
      discord: {
        icon: '<i class="fa-brands fa-discord"></i>',
      },
      twitter: {
        icon: '<i class="fa-brands fa-twitter"></i>',
      },
      patreon: {
        icon: '<i class="fa-brands fa-patreon"></i>',
      },
      github: {
        icon: '<i class="fa-brands fa-github"></i>',
      },
      "ko-fi": {
        icon: '<i class="fa-solid fa-mug-hot"></i>',
      },
      reddit: {
        icon: '<i class="fa-brands fa-reddit"></i>',
      },
    };

    // Add Conflicts
    function conflictVersionCheck(conflict) {
      let conflictVersion = false;
      if ((conflict?.type ?? "").toLowerCase() == "core")
        conflictVersion = game.version;
      else if ((conflict?.type ?? "").toLowerCase() == "system")
        conflictVersion = game.system.version;
      else if ((conflict?.type ?? "").toLowerCase() == "module")
        conflictVersion = game.modules.get(conflict.id)?.version ?? "0.0.0";

      if (!conflictVersion) return false;

      if (
        (conflict?.type ?? "").toLowerCase() == "core" ||
        (conflict?.type ?? "").toLowerCase() == "system"
      ) {
        if (
          isNewerVersion(
            game.modules.get(conflict.id)?.version ?? "0.0.0",
            conflict.compatibility.version ?? "0.0.0",
          )
        )
          return false;
        return (
          (isNewerVersion(
            conflictVersion,
            conflict.compatibility.minimum ?? "0.0.0",
          ) ||
            conflictVersion == conflict.compatibility.minimum) &&
          (isNewerVersion(
            conflict.compatibility.maximum ?? conflictVersion,
            conflictVersion,
          ) ||
            (conflict.compatibility.maximum ?? conflictVersion) ==
              conflictVersion)
        );
      }

      return (
        (isNewerVersion(
          conflictVersion,
          conflict.compatibility.minimum ?? "0.0.0",
        ) ||
          conflictVersion == conflict.compatibility.minimum) &&
        (isNewerVersion(conflict.compatibility.maximum, conflictVersion) ||
          conflict.compatibility.maximum == conflictVersion)
      );
    }

    function addConflict(module, conflict) {
      const conflictElem =
        elem.querySelector(
          `.package-list > li.package[data-module-id="${conflict.id}"]`,
        ) ?? false;
      if (conflictElem) {
        let moduleTitle =
          game.modules.get(module?.id ?? conflict.id)?.title ?? "";
        //if ((conflict?.type ?? '').toLowerCase() == 'system') moduleTitle = game?.system?.title ?? '';
        if ((conflict?.type ?? "").toLowerCase() == "core")
          moduleTitle += ` - ${MODULE.localize("dialog.moduleManagement.conflicts.core")}`;
        if ((conflict?.type ?? "").toLowerCase() == "system")
          moduleTitle += ` - ${game.system.title}`;
        const content = new DOMParser().parseFromString(
          conflictElem.querySelector(".conflicts")?.dataset?.tooltip ??
            `<ul class='${MODULE.ID}-tooltip-list'></ul>`,
          "text/html",
        );
        content
          .querySelector("ul")
          .insertAdjacentHTML(
            "beforeend",
            `<li><strong>${moduleTitle}</strong><br/>${(conflict?.reason ?? MODULE.localize("dialog.moduleManagement.conflicts.undefinedReason")).replaceAll(`"`, `'`)}</li>`,
          );

        if (
          conflictElem.querySelectorAll(
            ".package-overview .package-title .title + span.conflicts",
          )?.length > 0
        ) {
          conflictElem.querySelector(
            ".package-overview .package-title .title + span.conflicts",
          ).dataset.tooltip = content
            .querySelector("ul")
            .outerHTML.replaceAll(`"`, `'`);
        } else {
          const conflictIcon = document.createElement("i");
          conflictIcon.classList.add(
            "conflicts",
            "fa-solid",
            "fa-triangle-exclamation",
          );
          conflictIcon.dataset.tooltip = content
            .querySelector("ul")
            .outerHTML.replaceAll(`"`, `'`);
          conflictIcon.setAttribute("aria-describedby", "tooltip");
          conflictIcon.style.marginRight = "0.25rem";
          conflictElem
            .querySelector(".package-overview .package-title .title")
            .prepend(conflictIcon);
        }
      }
    }

    for await (const elemPackage of elem.querySelectorAll(
      ".package-list > li.package",
    )) {
      //elem.querySelectorAll('.package-list > li.package').forEach((elemPackage) => {
      const moduleKey = elemPackage.dataset.moduleId;
      const moduleData = game.modules.get(moduleKey);

      // Get Files From Server
      const getFiles = await MMP.checkIfFilesExists(
        `./modules/${moduleData.id}/`,
        { extensions: [".md"] },
      );
      // Assign Files to Variables
      const readme = getFiles
        ? getFiles.filter((file) =>
            file.toLowerCase().endsWith("README.md".toLowerCase()),
          )[0]
        : false;
      const changelog = getFiles
        ? getFiles.filter((file) =>
            file.toLowerCase().endsWith("CHANGELOG.md".toLowerCase()),
          )[0]
        : false;
      const attributions = getFiles
        ? getFiles.filter((file) =>
            file.toLowerCase().endsWith("ATTRIBUTIONS.md".toLowerCase()),
          )[0]
        : false;

      // Add Ability to Rename Package Title for Better Sorting
      new ContextMenu(
        elemPackage,
        ".package-overview ",
        [
          {
            name: `${MODULE.localize("dialog.moduleManagement.contextMenu.renameModule")}`,
            icon: '<i class="fa-duotone fa-pen-to-square"></i>',
            condition: game.user.isGM,
            callback: (packageElem) => {
              return Dialog.confirm({
                id: `${MODULE.ID}-rename-module`,
                title: MODULE.TITLE,
                content: `<p style="margin-top: 0px;">${MODULE.localize("dialog.moduleManagement.contextMenu.renameModule")}</p>
							<input type="text" name="${MODULE.ID}-rename-module-title" value="${packageElem.querySelector("label.package-title").textContent.trim()}"/>`,
                yes: (elemDialog) => {
                  if (
                    elemDialog[0].querySelector(
                      `input[name="${MODULE.ID}-rename-module-title"]`,
                    ).value.length >= 0
                  ) {
                    MODULE.setting(
                      "renamedModules",
                      mergeObject(
                        MODULE.setting("renamedModules"),
                        {
                          [packageElem.closest("li.package").dataset.moduleId]:
                            elemDialog[0].querySelector(
                              `input[name="${MODULE.ID}-rename-module-title"]`,
                            ).value,
                        },
                        { inplace: false },
                      ),
                    ).then(() => {
                      new ModuleManagement().render(true);
                    });
                  }
                },
                no: () => {
                  return false;
                },
              }).then(() => {});
            },
          },
          {
            name: `${MODULE.localize("dialog.moduleManagement.contextMenu.restoreModuleName")}`,
            icon: '<i class="fa-duotone fa-rotate"></i>',
            condition:
              game.user.isGM &&
              (MODULE.setting("renamedModules")[moduleKey] ?? false),
            callback: () => {
              const renamedModules = MODULE.setting("renamedModules");
              delete renamedModules[moduleKey];
              MODULE.setting("renamedModules", renamedModules).then(() => {
                new ModuleManagement().render(true);
              });
            },
          },
          {
            name: MODULE.localize(
              "dialog.moduleManagement.contextMenu.lockModule",
            ),
            icon: '<i class="fa-duotone fa-lock"></i>',
            condition: () =>
              game.user.isGM &&
              !Object.hasOwn(MODULE.setting("lockedModules"), moduleKey),
            callback: (packageElem) => {
              const lockedModules = MODULE.setting("lockedModules");
              lockedModules[moduleKey] = true;
              MODULE.setting("lockedModules", lockedModules).then(() => {
                const lockIcon = document.createElement("i");
                lockIcon.classList.add("fa-duotone", "fa-lock");
                lockIcon.dataset.tooltip = MODULE.localize(
                  "dialog.moduleManagement.tooltips.moduleLocked",
                );
                lockIcon.style.marginRight = "0.25rem";
                packageElem
                  .querySelector(".package-title .title")
                  .prepend(lockIcon);

                if (MODULE.setting("disableLockedModules")) {
                  packageElem.querySelector(
                    '.package-title input[type="checkbox"]',
                  ).disabled = true;
                  elemPackage.classList.add("disabled");
                }
                packageElem.querySelector(
                  '.package-title input[type="checkbox"]',
                ).checked = true;
                packageElem
                  .querySelector('.package-title input[type="checkbox"]')
                  .dispatchEvent(new Event("change"));

                const lockedCount = Object.keys(
                  MODULE.setting("lockedModules"),
                ).length;
                elem.querySelector(
                  'search.flexrow a.filter[data-filter="locked"]',
                ).innerHTML =
                  `${MODULE.localize("dialog.moduleManagement.lockedModules")} (${lockedCount})`;
                elem.querySelector(
                  '#module-management search.flexrow select option[value="locked"]',
                ).innerHTML =
                  `${MODULE.localize("dialog.moduleManagement.lockedModules")} (${lockedCount})`;
              });
            },
          },
          {
            name: MODULE.localize(
              "dialog.moduleManagement.contextMenu.unlockModule",
            ),
            icon: '<i class="fa-duotone fa-lock-open"></i>',
            condition: () =>
              game.user.isGM &&
              Object.hasOwn(MODULE.setting("lockedModules"), moduleKey),
            callback: (packageElem) => {
              const lockedModules = MODULE.setting("lockedModules");
              delete lockedModules[moduleKey];
              MODULE.setting("lockedModules", lockedModules).then(() => {
                packageElem
                  .querySelector(".package-title i.fa-duotone.fa-lock")
                  .remove();

                if (MODULE.setting("disableLockedModules")) {
                  packageElem.querySelector(
                    '.package-title input[type="checkbox"]',
                  ).disabled = false;
                  elemPackage.classList.remove("disabled");
                }

                const lockedCount = Object.keys(
                  MODULE.setting("lockedModules"),
                ).length;
                elem.querySelector(
                  'search.flexrow a.filter[data-filter="locked"]',
                ).innerHTML =
                  `${MODULE.localize("dialog.moduleManagement.lockedModules")} (${lockedCount})`;
                elem.querySelector(
                  '#module-management search.flexrow select option[value="locked"]',
                ).innerHTML =
                  `${MODULE.localize("dialog.moduleManagement.lockedModules")} (${lockedCount})`;
              });
            },
          },
          {
            name: MODULE.localize(
              "dialog.moduleManagement.contextMenu.reportConflict",
            ),
            icon: '<i class="fa-solid fa-bug"></i>',
            condition: () =>
              game.user.isGM &&
              (game.modules.get("bug-reporter")?.active ?? false),
            callback: (packageElem) => {
              const moduleDetails = game.modules.get(
                packageElem.closest("li").dataset.moduleId,
              );
              Hooks.once("renderBugReportForm", (app, elem) => {
                elem = elem[0];

                // Add Confliction Package Dropdown
                elem
                  .querySelector(
                    'input[type="text"][name="formFields.bugTitle"]',
                  )
                  .closest(".form-group-stacked")
                  .insertAdjacentHTML(
                    "afterend",
                    `<div class="form-group-stacked">
							<div class="form-group-stacked">
								<label>${MODULE.localize("dialog.bugReporter.selectLabel")}</label>
								<select name="${MODULE.ID}.formFields.selectLabel">
									<optgroup label="${MODULE.localize("dialog.bugReporter.optGroup.core")}">
										<option value="core" data-type="core">${game.i18n.localize("Foundry Virtual Tabletop")}</option>
									</optgroup>
									<optgroup label="${MODULE.localize("dialog.bugReporter.optGroup.system")}">
										<option value="${game.system.id}" data-type="system">${game.system.title}</option>
									</optgroup>
									<optgroup label="${MODULE.localize("dialog.bugReporter.optGroup.modules")}"></optgroup>
								</select>
							</div>
						</div>`,
                  );

                // Add Modules to Dropdown
                const elemOptGroup = elem.querySelector(
                  `select[name="${MODULE.ID}.formFields.selectLabel"] optgroup[label="${MODULE.localize("dialog.bugReporter.optGroup.modules")}"]`,
                );
                for (const module of game.modules) {
                  elemOptGroup.insertAdjacentHTML(
                    "beforeend",
                    `<option value="${module.id}" data-type="module">${module.title}</option>`,
                  );
                }

                // Uncheck Checkboxes
                elem.querySelector(
                  'input[type="checkbox"][name="formFields.sendActiveModules"]',
                ).checked = false;
                elem.querySelector(
                  'input[type="checkbox"][name="formFields.sendModSettings"]',
                ).checked = false;

                // Hide Checkboxes
                elem
                  .querySelector(
                    'input[type="checkbox"][name="formFields.sendActiveModules"]',
                  )
                  .closest(".flexrow")
                  .classList.add("hidden");

                // Hide Discord and Label
                elem
                  .querySelector('input[type="text"][name="formFields.issuer"]')
                  .closest(".flexrow")
                  .classList.add("hidden");

                // Fill Description
                elem.querySelector(
                  'textarea[name="formFields.bugDescription"]',
                ).value = `- `;
                elem
                  .querySelector('textarea[name="formFields.bugDescription"]')
                  .insertAdjacentHTML(
                    "afterend",
                    `<div class="${MODULE.ID}-bug-reporter-preview hidden"></div>`,
                  );

                // Add Toggle Button
                const elemLabel = elem
                  .querySelector('textarea[name="formFields.bugDescription"]')
                  .closest("div.form-group-stacked")
                  .querySelector("label");
                elemLabel.insertAdjacentHTML(
                  "beforeend",
                  `<button type="button" data-action="toggle">${MODULE.localize("dialog.bugReporter.toggle.preview")}</button>`,
                );
                elemLabel
                  .querySelector('button[data-action="toggle"]')
                  .addEventListener("click", (event) => {
                    const elemTextarea = elem.querySelector(
                      'textarea[name="formFields.bugDescription"]',
                    );
                    const elemPreview = elem.querySelector(
                      `div.${MODULE.ID}-bug-reporter-preview`,
                    );
                    const isPreview = elemTextarea.classList.contains("hidden");

                    // Set Preview Height to Textarea Height
                    elemPreview.style.minHeight = `${elemTextarea.offsetHeight}px`;

                    // Toggle View State
                    elemTextarea.classList.toggle("hidden", !isPreview);
                    elemPreview.classList.toggle("hidden", isPreview);

                    // Convert Textarea into HTML
                    const selectedPackage = elem.querySelector(
                      `select[name="${MODULE.ID}.formFields.selectLabel"] option:checked`,
                    );
                    let packageDetails = {
                      id: "",
                      name: "",
                      version: "0.0.0 ",
                    };
                    if (selectedPackage.dataset.type == "core")
                      packageDetails = {
                        id: "",
                        name: game.i18n.localize("Foundry Virtual Tabletop"),
                        version: game.version,
                      };
                    else if (selectedPackage.dataset.type == "system")
                      packageDetails = {
                        id: game.system.id,
                        name: game.system.title,
                        version: game.system.version,
                      };
                    else if (selectedPackage.dataset.type == "module")
                      packageDetails = {
                        id: game.modules.get(selectedPackage.value).id,
                        name: game.modules.get(selectedPackage.value).title,
                        version: game.modules.get(selectedPackage.value)
                          .version,
                      };

                    const markdown = [elemTextarea.value];
                    markdown.push(`\n\n`);
                    markdown.push(`### Conflicts With`);
                    if (packageDetails.id != "")
                      markdown.push(`**Package ID:** ${packageDetails.id}`);
                    markdown.push(`**Package Name:** ${packageDetails.name}`);
                    markdown.push(
                      `**Package Version:** ${packageDetails.version}`,
                    );
                    markdown.push(
                      `**Package Type:** ${selectedPackage.dataset.type}`,
                    );

                    elemPreview.innerHTML = new showdown.Converter().makeHtml(
                      markdown.join("\n\n"),
                    );

                    // Toggle Text
                    event.target.innerHTML = MODULE.localize(
                      `dialog.bugReporter.toggle.${isPreview ? "preview" : "write"}`,
                    );

                    app.setPosition();
                  });

                // Hide Submit Button
                elem
                  .querySelector('button[type="submit"]')
                  .classList.add("hidden");
                elem
                  .querySelector('button[type="submit"]')
                  .insertAdjacentHTML(
                    "beforebegin",
                    `<button type="button" data-type="submit">${elem.querySelector('button[type="submit"]').innerHTML}</button>`,
                  );

                elem
                  .querySelector('button[data-type="submit"]')
                  .addEventListener("click", () => {
                    const elemTextarea = elem.querySelector(
                      'textarea[name="formFields.bugDescription"]',
                    );

                    // Get Conflict Package Details
                    const selectedPackage = elem.querySelector(
                      `select[name="${MODULE.ID}.formFields.selectLabel"] option:checked`,
                    );
                    let packageDetails = {
                      id: "",
                      name: "",
                      version: "0.0.0 ",
                    };
                    if (selectedPackage.dataset.type == "core")
                      packageDetails = {
                        id: "",
                        name: game.i18n.localize("Foundry Virtual Tabletop"),
                        version: game.version,
                      };
                    else if (selectedPackage.dataset.type == "system")
                      packageDetails = {
                        id: game.system.id,
                        name: game.system.title,
                        version: game.system.version,
                      };
                    else if (selectedPackage.dataset.type == "module")
                      packageDetails = {
                        id: game.modules.get(selectedPackage.value).id,
                        name: game.modules.get(selectedPackage.value).title,
                        version: game.modules.get(selectedPackage.value)
                          .version,
                      };

                    const markdown = [elemTextarea.value];
                    markdown.push(`\n`);
                    markdown.push(`### Conflicts With`);
                    if (packageDetails.id != "")
                      markdown.push(`**Package ID:** ${packageDetails.id}`);
                    markdown.push(`**Package Name:** ${packageDetails.name}`);
                    markdown.push(
                      `**Package Version:** ${packageDetails.version}`,
                    );
                    markdown.push(
                      `**Package Type:** ${selectedPackage.dataset.type}`,
                    );

                    elemTextarea.value = markdown.join("\n");
                    elem.querySelector('button[type="submit"]').click();
                  });

                app.setPosition();
              });
              game.modules
                .get("bug-reporter")
                .api.bugWorkflow(
                  MODULE.ID,
                  `Module Conflict - ${moduleDetails.title} v${moduleDetails.version}`,
                  ``,
                );
            },
          },
        ],
        { jQuery: false },
      );

      // Put existing tags in container
      const overviewContainer = elemPackage.querySelector(".package-overview");
      const tags = overviewContainer.querySelectorAll(".tag");
      const tagContainer = document.createElement("div");
      tagContainer.classList.add("tag-container", "flexrow");
      tags.forEach((tag) => {
        tagContainer.appendChild(tag);
      });
      overviewContainer.appendChild(tagContainer);

      // Add Setting Tag if Module has Editable Tags
      if (hasSettings?.[moduleKey] ?? false) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<span class="tag settings flexrow" data-tooltip="${game.i18n.localize("SETTINGS.TabModule")}" aria-describedby="tooltip">
					<i class="fa-solid fa-gear"></i>
				</span>`,
        );
      }
      // Add Authors Tag
      if (moduleData?.authors.size >= 1) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<span class="tag authors flexrow" data-tooltip="${MODULE.localize("dialog.moduleManagement.tags.authors")}" aria-describedby="tooltip">
					<i class="fa-solid ${moduleData?.authors.size == 1 ? "fa-user" : "fa-users"}"></i>
				</span>`,
        );
        let outputList = "";
        moduleData?.authors.forEach((author) => {
          outputList += `<li class="author">${author?.name ?? "UNKNOWN"}</li>`;
          Object.keys(author).forEach((key) => {
            if (
              key != "name" &&
              key != "flags" &&
              typeof author[key] != "undefined"
            ) {
              outputList += getContent(key, author[key]);
            } else if (key == "flags") {
              Object.keys(author[key]).forEach((flagKey) => {
                outputList += getContent(flagKey, author[key][flagKey]);
              });
            }
          });
        });
        tippy(elemPackage.querySelector(".package-overview span.tag.authors"), {
          content: `<ul class="${MODULE.ID}-tippy-authors">${outputList}</ul>`,
          allowHTML: true,
          interactive: true,
          trigger: "click",
        });

        // Remove Foundrys Author Tag cause I dislike it.
        if (overviewContainer.querySelector(".tag i.fa-solid.fa-user") ?? false)
          overviewContainer
            .querySelector(".tag i.fa-solid.fa-user")
            .closest("span.tag")
            .remove();
      }

      // Add Version Tag if one Does not exist
      if (!overviewContainer.querySelector(".tag.badge")) {
        // Add Version Tag
        overviewContainer.insertAdjacentHTML(
          "beforeend",
          `<span class="tag badge flexrow"><i class="fas fa-code-branch"></i> ${moduleData?.version}</span>`,
        );
      }

      // Remove Foundrys Info Tag cause I dislike it and because I use the same icon from the Readme Tag
      // Also my Website Tag already does this.
      if (
        overviewContainer.querySelector(".tag i.fa-solid.fa-circle-info") ??
        false
      )
        overviewContainer
          .querySelector(".tag i.fa-solid.fa-circle-info")
          .closest("span.tag")
          .remove();

      // Add ReadMe Tag
      if (
        readme ||
        ((MMP.getModuleProperty(moduleData.id, "readme") || "").match(
          APIs.github,
        ) ??
          false) ||
        ((MMP.getModuleProperty(moduleData.id, "readme") || "").match(
          APIs.rawGithub,
        ) ??
          false)
      ) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<span class="tag readme flexrow" data-tooltip="${MODULE.localize("dialog.moduleManagement.tags.readme")}" aria-describedby="tooltip">
					<i class="fa-solid fa-circle-info"></i>
				</span>`,
        );
        overviewContainer
          .querySelector(".tag.readme")
          .addEventListener("click", () => {
            new PreviewDialog({
              [moduleKey]: {
                hasSeen: false,
                title: moduleData.title ?? "",
                version: moduleData.version ?? "0.0.0",
                type: "README",
              },
            }).render(true);
          });
      }
      // Add Changelog Tag
      if (
        changelog ||
        ((MMP.getModuleProperty(moduleData.id, "changelog") || "").match(
          APIs.github,
        ) ??
          false) ||
        ((MMP.getModuleProperty(moduleData.id, "changelog") || "").match(
          APIs.rawGithub,
        ) ??
          false)
      ) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<span class="tag changelog flexrow" data-tooltip="${MODULE.localize("dialog.moduleManagement.tags.changelog")}" aria-describedby="tooltip">
					<i class="fa-solid fa-list"></i>
				</span>`,
        );
        overviewContainer
          .querySelector(".tag.changelog")
          .addEventListener("click", () => {
            new PreviewDialog({
              [moduleKey]: {
                hasSeen: false,
                title: moduleData.title ?? "",
                version: moduleData.version ?? "0.0.0",
                type: "CHANGELOG",
              },
            }).render(true);
          });
      }
      // Add Attributions Tag
      if (
        attributions ||
        ((MMP.getModuleProperty(moduleData.id, "attributions") || "").match(
          APIs.github,
        ) ??
          false) ||
        ((MMP.getModuleProperty(moduleData.id, "attributions") || "").match(
          APIs.rawGithub,
        ) ??
          false)
      ) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<span class="tag attributions flexrow" data-tooltip="${MODULE.localize("dialog.moduleManagement.tags.attributions")}" aria-describedby="tooltip">
					<i class="fa-brands fa-creative-commons-by"></i>
				</span>`,
        );
        overviewContainer
          .querySelector(".tag.attributions")
          .addEventListener("click", () => {
            new PreviewDialog({
              [moduleKey]: {
                hasSeen: false,
                title: moduleData.title ?? "",
                version: moduleData.version ?? "0.0.0",
                type: "ATTRIBUTIONS",
              },
            }).render(true);
          });
      }
      // Add Website Tag
      if (MMP.getModuleProperty(moduleData.id, "url") ?? false) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<a href="${MMP.getModuleProperty(moduleData.id, "url")}" class="tag website flexrow" data-tooltip="${MODULE.localize("dialog.moduleManagement.tags.url")}" aria-describedby="tooltip" target="_blank">
					<i class="fa-solid fa-link"></i>
				</a>`,
        );
      }
      // Add Issues Link | Support for 🐛 Bug Reporter Support
      if (MMP.bugReporterSupport(moduleData)) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<span class="tag issues bug-reporter flexrow" data-tooltip="${MODULE.localize("dialog.moduleManagement.tags.bugReporter")}" aria-describedby="tooltip" target="_blank">
					<i class="fa-solid fa-bug"></i>
				</span>`,
        );
      } else if (MMP.getModuleProperty(moduleData.id, "bugs") ?? false) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<a href="${MMP.getModuleProperty(moduleData.id, "bugs")}" class="tag issues flexrow" data-tooltip="${MODULE.localize("dialog.moduleManagement.tags.issues")}" aria-describedby="tooltip" target="_blank">
					<i class="fa-brands fa-github"></i>
				</a>`,
        );
      }
      // Add Socket Tag
      if (moduleData?.socket ?? false) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<span class="tag socket flexrow" data-tooltip="${MODULE.localize("dialog.moduleManagement.tags.socket")}" aria-describedby="tooltip" >
					<i class="fa-solid fa-plug"></i>
				</span>`,
        );
      }
      // Add Library Tag
      if (moduleData?.library ?? false) {
        tagContainer.insertAdjacentHTML(
          "beforeend",
          `<span class="tag library flexrow" data-tooltip="${MODULE.localize("dialog.moduleManagement.tags.library")}" aria-describedby="tooltip">
					<i class="fa-solid fa-book"></i>
				</span>`,
        );
      }

      // Add Expand Module Button
      overviewContainer.insertAdjacentHTML(
        "beforeend",
        `<button class="tag expand flexrow" data-tooltip="${game.i18n.localize("Expand")}" aria-describedby="tooltip">
				<i class="fa-solid fa-circle-caret-up"></i>
			</button>`,
      );
      elemPackage.querySelector(".package-description").classList.add("hidden");
      overviewContainer
        .querySelector("button.tag.expand")
        .addEventListener("click", (event) => {
          // Prevent Submitting Form - Saving Changes
          event.preventDefault();

          const currentElem = event.target.closest("button.tag.expand");
          const parentElem = event.target.closest(".package");
          const iElem = currentElem.querySelector("i");

          // Toggle Expand Icon
          iElem.classList.toggle("fa-circle-caret-up");
          iElem.classList.toggle("fa-circle-caret-down");

          // Toggle Package Description
          parentElem
            .querySelector(".package-description")
            .classList.toggle("hidden");

          // Update Expand Button Tooltip
          currentElem.dataset.tooltip = parentElem
            .querySelector(".package-description")
            .classList.contains("hidden")
            ? game.i18n.localize("Expand")
            : game.i18n.localize("Collapse");
          game.tooltip.deactivate();

          // Update Expand Button If All Modules Are Expanded
          const isExpanded =
            elem.querySelectorAll(".package-description:not(.hidden)")
              .length === elem.querySelectorAll(".package-description").length;
          // Update Expand Button Tooltip
          expandButton.dataset.tooltip = isExpanded
            ? game.i18n.localize("Collapse")
            : game.i18n.localize("Expand");
          // Toggle Expand Button Icon
          expandButton.classList.toggle("fa-angle-double-up", !isExpanded);
          expandButton.classList.toggle("fa-angle-double-down", isExpanded);
        });

      // Add Locked Status
      if (Object.hasOwn(MODULE.setting("lockedModules"), moduleKey) ?? false) {
        const lockIcon = document.createElement("i");
        lockIcon.classList.add("fa-duotone", "fa-lock");
        lockIcon.dataset.tooltip = MODULE.localize(
          "dialog.moduleManagement.tooltips.moduleLocked",
        );
        lockIcon.style.marginRight = "0.25rem";
        overviewContainer
          .querySelector(".package-title .title")
          .prepend(lockIcon);
        if (MODULE.setting("disableLockedModules")) {
          overviewContainer.querySelector(
            '.package-title input[type="checkbox"]',
          ).disabled = true;
          elemPackage.classList.add("disabled");
        }
      }

      // Handle Conflicts Registered in Manifest.json
      if (moduleData?.relationships?.conflicts?.size > 0) {
        moduleData?.relationships?.conflicts.forEach((conflict) => {
          // Version Checking
          if (conflictVersionCheck(conflict)) {
            if (conflict.id != moduleData.id) {
              addConflict(
                game.modules.get(conflict.id),
                mergeObject(
                  conflict,
                  { id: moduleData.id },
                  { inplace: false },
                ),
              );
            }
            addConflict(moduleData, conflict);
          }
        });
      }

      // Add Checked Class
      if (moduleData?.active ?? false) {
        elemPackage.classList.add("checked");
      }
      elemPackage
        .querySelector('input[type="checkbox"]')
        .addEventListener("change", (event) => {
          elemPackage.classList.toggle("checked", event.target.checked);
        });
    }

    // Handle Global Conflicts
    if (MODULE.setting("enableGlobalConflicts") && game.user.isGM) {
      MMP.globalConflicts().then((response) => {
        response.forEach((conflict) => {
          // Version Checking
          if (conflictVersionCheck(conflict)) {
            if (
              conflict.id != (conflict?.packageId ?? "") &&
              (conflict?.packageId ?? false)
            ) {
              addConflict(
                game.modules.get(conflict.id),
                mergeObject(
                  conflict,
                  { id: conflict.packageId },
                  { inplace: false },
                ),
              );
            }
            addConflict(
              game.modules.get(conflict?.packageId ?? conflict?.id),
              conflict,
            );
          }
        });
      });
      if (
        (elem.querySelector('footer button[data-action="deactivateAll"]') ??
          false) &&
        MODULE.setting("addGoogleSheetButton")
      ) {
        elem
          .querySelector('footer button[data-action="deactivateAll"]')
          .insertAdjacentHTML(
            "afterend",
            `<button type="button" name="global-conflicts-spreadsheet">
					<i class="fa-regular fa-table"></i> ${MODULE.localize("dialog.moduleManagement.buttons.spreadsheet")}
				</button>`,
          );
        elem
          .querySelector('footer button[name="global-conflicts-spreadsheet"]')
          .addEventListener("click", () => {
            window.open(
              "https://docs.google.com/spreadsheets/d/1eRcaqt8VtgDRC-iWP3SfOnXh-7kIw2k7po9-3dcftAk/",
              "_blank",
            );
          });
      }
    }

    // Handle if Settings Tag is Clicked
    elem
      .querySelectorAll(
        ".package-list > li.package .package-overview .tag.settings",
      )
      .forEach((elemPackage) => {
        elemPackage.addEventListener("click", async () => {
          const settingsConfig = await game.settings.sheet.render(true);
          const settingSheet = settingsConfig.element;
          const moduleId = elemPackage.closest("li.package").dataset.moduleId;
          const filters = settingSheet.querySelector(
            `aside[data-application-part="sidebar"] nav.tabs button[data-tab="${moduleId}"]`,
          );

          settingSheet.classList.add(`${MODULE.ID}-hide-filter-options`);
          filters.click();
        });
      });
    // Handle if 🐛 Bug Reporter Tags is Clicked
    elem
      .querySelectorAll(
        ".package-list > li.package .package-overview .tag.issues.bug-reporter",
      )
      .forEach((elemPackage) => {
        elemPackage.addEventListener("click", async () => {
          const moduleId = elemPackage.closest("li.package").dataset.moduleId;
          game.modules.get("bug-reporter").api.bugWorkflow(moduleId);
        });
      });

    // Update Deactivate Modules
    if (
      elem.querySelector('footer button[data-action="deactivateAll"]') ??
      false
    ) {
      elem.querySelector(
        'footer button[data-action="deactivateAll"]',
      ).innerHTML = `<span class="fa-stack">
				<i class="fa-regular fa-square-check fa-stack-1x"></i>
				<i class="fa-sharp fa-solid fa-slash fa-stack-1x"></i>
			</span>${MODULE.localize("dialog.moduleManagement.buttons.deactivateModules")}`;
      elem.querySelector(
        'footer button[data-action="deactivateAll"]',
      ).dataset.tooltip = MODULE.localize(
        "dialog.moduleManagement.buttons.deactivateModulesAlt",
      );

      elem
        .querySelector('footer button[data-action="deactivateAll"]')
        .addEventListener("click", (event) => {
          if (event.ctrlKey) {
            MODULE.log("USER WAS HOLDING DOWN CONTROL KEY");
          } else {
            event.stopPropagation();
            Array.from(
              elem.querySelectorAll(".package-list .package.checked"),
            ).forEach((elemPackage) => {
              elemPackage.classList.remove("checked");
              elemPackage.querySelector("input[type='checkbox']").checked =
                false;
            });
            for (const key of Object.keys(MODULE.setting("lockedModules"))) {
              elem.querySelector(
                `.package-list .package[data-module-id="${key}"] input[type="checkbox"]`,
              ).checked = true;
              elem
                .querySelector(
                  `.package-list .package[data-module-id="${key}"]`,
                )
                .classList.add("checked");
            }
          }
        });
    }

    // Add Rollback || ONLY FOR GM
    if (game.user.isGM) {
      MODULE.setting(
        "storedRollback",
        game.settings.get(`core`, `${ModuleManagement.SETTING}`),
      );
      if (MODULE.setting("presetsRollbacks").length > 0) {
        elem.querySelector('footer button[type="submit"]').insertAdjacentHTML(
          "beforebegin",
          `<button type="button" name="rollback" data-tooltip="${MODULE.localize("dialog.moduleManagement.rollback")}">
					<i class="fa-regular fa-rotate-left"></i>
				</button>`,
        );

        elem
          .querySelector('footer button[name="rollback"]')
          .addEventListener("click", () => {
            const rollBackModules = [
              ...MODULE.setting("presetsRollbacks"),
            ].pop();
            Dialog.confirm({
              id: `${MODULE.ID}-rollback-modules`,
              title: MODULE.TITLE,
              content: `<p style="margin-top: 0px;">${MODULE.localize("dialog.moduleManagement.rollback")}</p>
						<textarea readonly rows="15" style="margin-bottom: 0.5rem;">### ${MODULE.localize("dialog.generic.activeModules")}\n${Object.entries(
              rollBackModules,
            )
              .filter(([key, value]) => {
                return (
                  (game.modules.get(key)?.title ?? "") != "" && value != false
                );
              })
              .map((module) => {
                return game.modules.get(module[0])?.title;
              })
              .join("\n")}</textarea>`,
              yes: () => {
                // Update Modules and Reload Game
                MODULE.setting("storedRollback", {}).then(() => {
                  game.settings
                    .set(`core`, `${ModuleManagement.SETTING}`, rollBackModules)
                    .then(() => {
                      MODULE.setting(
                        "presetsRollbacks",
                        MODULE.setting("presetsRollbacks").slice(0, -1) ?? [],
                      ).then(() => {
                        SettingsConfig.reloadConfirm({ world: true });
                      });
                    });
                });
              },
              no: () => {
                return false;
              },
            });
          });
      }
    }

    // HIDE TOOLTIPS WHEN USER SCROLLS IN MODULE LIST
    $("#module-management .package-list").on("scroll", hideAll);

    //new ModuleManagement().render(true);
    app.setPosition();
  }

  static renderSettingsConfig(app, elem) {
    // Check for Big Picture Mode
    if (MODULE.setting("bigPictureMode"))
      elem.classList.add(`${MODULE.ID}-big-picture-mode`);

    elem
      .querySelectorAll(".categories .tab .form-group")
      .forEach((settingElem) => {
        let settingDetails = null;
        let settingValue = "UNKNOWN";
        if (
          settingElem.querySelectorAll(
            "input[name],select[name],range-picker[name]",
          ).length > 0
        ) {
          settingValue = settingElem
            .querySelectorAll("input[name],select[name],range-picker[name]")[0]
            .getAttribute("name");
        } else if (
          settingElem.querySelectorAll("button[data-key]").length > 0
        ) {
          const button = settingElem.querySelectorAll("button[data-key]")[0];
          settingValue = button.dataset.key;
          settingDetails = game.settings.settings.get(settingValue);
          if (button.dataset.action === "openSubmenu" && !settingDetails) {
            settingDetails = { scope: "menu" };
          }
        }
        settingDetails ||= game.settings.settings.get(settingValue);

        if (settingDetails ?? false) {
          const settingLabel = settingElem.querySelector("label");
          const settingID = settingValue ?? false;
          // Lock Settings
          function isLocked(settingID) {
            return (
              Object.hasOwn(
                MODULE.setting("lockedSettings"),
                `${settingID ?? "MMP-INVALID"}`,
              ) ?? false
            );
          }

          if (
            ["client", "user"].includes(settingDetails.scope) &&
            game.user.isGM &&
            settingID
          ) {
            if (this.socket) {
              settingLabel.insertAdjacentHTML(
                "afterbegin",
                `<i class="fa-solid fa-arrows-rotate" data-tooltip="${MODULE.localize("dialog.clientSettings.tooltips.syncSetting")}" data-tooltip-direction="UP" data-action="sync"></i>`,
              );

              settingLabel
                .querySelector('[data-action="sync"]')
                .addEventListener("click", (event) => {
                  event.preventDefault();
                  Dialog.confirm({
                    title: MODULE.TITLE,
                    content: `<p style="margin-top:0px;">${MODULE.localize("dialog.clientSettings.syncSetting.sendToAll")}</p>`,
                    yes: () => {
                      this.socket.executeForOthers("setUserSetting", {
                        moduleId: settingDetails.namespace,
                        settingName: settingDetails.key,
                        settingValue: game.settings.get(
                          settingDetails.namespace,
                          settingDetails.key,
                        ),
                      });
                    },
                    no: () => {
                      return "Player Rejected Setting";
                    },
                  });
                });

              function getActiveUser() {
                const syncUsers = [];
                game.users.forEach((user) => {
                  if (user.active && user.name != game.users.current.name) {
                    syncUsers.push({
                      name: user.name,
                      icon: "",
                      condition: game.user.isGM,
                      callback: () => {
                        MODULE.log(
                          "Setting Client Setting",
                          this.socket.executeForUsers(
                            "setUserSetting",
                            [user.id],
                            {
                              moduleId: settingDetails.namespace,
                              settingName: settingDetails.key,
                              settingValue: game.settings.get(
                                settingDetails.namespace,
                                settingDetails.key,
                              ),
                            },
                          ),
                        );
                      },
                    });
                  }
                });

                return syncUsers;
              }

              new ContextMenu(
                settingLabel,
                '[data-action="sync"]',
                getActiveUser(),
                { jQuery: false },
              );
            }

            if (!(game.modules.get("force-client-settings")?.active ?? false)) {
              const lock = document.createElement("i");
              lock.classList.add(
                "fa-solid",
                "fa-" + (isLocked(settingID) ? "lock" : "unlock"),
              );
              lock.dataset.tooltip = isLocked(settingID)
                ? MODULE.localize(
                    "dialog.clientSettings.tooltips.unlockSetting",
                  )
                : MODULE.localize("dialog.clientSettings.tooltips.lockSetting");
              lock.dataset.tooltipDirection = "UP";
              lock.dataset.action = "lock";
              settingLabel.prepend(lock);
              lock.addEventListener("click", (event) => {
                event.preventDefault();
                if (isLocked(settingID)) {
                  delete MMP.#LockedSettings[`${settingID}`];
                  MODULE.setting("lockedSettings", MMP.#LockedSettings).then(
                    () => {
                      lock.classList.remove("fa-lock");
                      lock.classList.add("fa-unlock");
                      lock.dataset.tooltip = MODULE.localize(
                        "dialog.clientSettings.tooltips.lockSetting",
                      );
                    },
                  );
                } else {
                  MMP.#LockedSettings[`${settingID}`] = game.settings.get(
                    settingDetails.namespace,
                    settingDetails.key,
                  );

                  MODULE.setting("lockedSettings", MMP.#LockedSettings).then(
                    () => {
                      lock.classList.remove("fa-unlock");
                      lock.classList.add("fa-lock");
                      lock.dataset.tooltip = MODULE.localize(
                        "dialog.clientSettings.tooltips.unlockSetting",
                      );
                    },
                  );
                }
              });
            }
          } else if (
            ["client", "user"].includes(settingDetails.scope) &&
            !game.user.isGM &&
            !(game.modules.get("force-client-settings")?.active ?? false)
          ) {
            if (isLocked(settingID)) {
              settingLabel
                .closest(".form-group")
                .querySelectorAll("input, select, button")
                .forEach((input) => {
                  input.disabled = true;
                });
              settingLabel.insertAdjacentHTML(
                "afterbegin",
                `<i class="fa-solid fa-lock" data-tooltip="${MODULE.localize("dialog.clientSettings.tooltips.lockedSetting")}" data-tooltip-direction="UP" data-action="lock"></i>`,
              );
              if (MODULE.setting("hideLockedSettings")) {
                settingLabel.closest(".form-group").classList.add("hidden");
              }
            }
          }

          if (settingDetails.scope == "world") {
            settingLabel.insertAdjacentHTML(
              "afterbegin",
              `<i class="fa-regular fa-earth-americas" data-tooltip="${MODULE.localize("dialog.clientSettings.tooltips.worldSetting")}" data-tooltip-direction="UP"></i>`,
            );
          }

          if (settingDetails.scope == "menu") {
            settingLabel.insertAdjacentHTML(
              "afterbegin",
              `<i class="fa-solid fa-square-list" data-tooltip="${MODULE.localize("dialog.clientSettings.tooltips.menuSetting")}" data-tooltip-direction="UP"></i>`,
            );
          }

          if (["client", "user"].includes(settingDetails.scope)) {
            const tooltipString = `dialog.clientSettings.tooltips.${settingDetails.scope}Setting`;
            settingLabel.insertAdjacentHTML(
              "afterbegin",
              `<i class="fa-solid fa-user" data-tooltip="${MODULE.localize(tooltipString)}" data-tooltip-direction="UP"></i>`,
            );
          }
        }
      });
  }

  static async renderSidebarTab(app, elem) {
    if (app.options.id !== "settings") return;

    // Supported Remote APIs
    const APIs = {
      github:
        /https?:\/\/github.com\/(?<user>[^/]+)\/(?<repo>[^/]+)\/blob\/[^/]+\/(?<path>.*)/,
      rawGithub:
        /https?:\/\/raw.githubusercontent.com\/(?<user>[^/]+)\/(?<repo>[^/]+)\/master\/(?<path>.*)/,
    };

    if (MMP.hasPermission && MMP.isGMOnline) {
      elem.querySelector(".documentation a:last-child").insertAdjacentHTML(
        "afterend",
        `<button data-action="changelogs">
					<i class="fa-solid fa-list"></i> Changelogs
				</button>`,
      );

      elem
        .querySelector('.documentation button[data-action="changelogs"]')
        .addEventListener("click", async () => {
          const changelogs = await (!game.user.isGM
            ? MMP.socket.executeAsGM("getGMSetting", {
                moduleId: MODULE.ID,
                settingName: "trackedChangelogs",
              })
            : MODULE.setting("trackedChangelogs"));
          new PreviewDialog(changelogs).render(true);
        });
    }

    // Get Files From Server
    const getFiles = await MMP.checkIfFilesExists(
      `./systems/${game.system.id}/`,
      { extensions: [".md"] },
    );
    // Assign Files to Variables
    const readme = getFiles
      ? getFiles.filter((file) =>
          file.toLowerCase().endsWith("README.md".toLowerCase()),
        )[0]
      : false;
    const changelog = getFiles
      ? getFiles.filter((file) =>
          file.toLowerCase().endsWith("CHANGELOG.md".toLowerCase()),
        )[0]
      : false;
    const attributions = getFiles
      ? getFiles.filter((file) =>
          file.toLowerCase().endsWith("ATTRIBUTIONS.md".toLowerCase()),
        )[0]
      : false;
    // Get License File
    const license = await foundry.utils.srcExists(
      `./systems/${game.system.id}/LICENSE`,
    ); // Foundry File Picker Does not Display this File
    if (license) getFiles.push(`systems/${game.system.id}/LICENSE`);

    // Cleanup General Information
    elem.querySelector(".info p.version").classList.add("hidden");
    elem.querySelector(".info div.build span.value").innerHTML = `${
      game.data.coreUpdate.hasUpdate
        ? `<i class="notification-pip update active fas fa-exclamation-circle" data-action="core-update" data-tooltip="${game.i18n.format(
            "SETUP.UpdateAvailable",
            {
              type: game.i18n.localize("Software"),
              channel: game.data.coreUpdate.channel,
              version: game.data.coreUpdate.version,
            },
          )}"></i> `
        : ""
    }v${game.version}`;
    ("");
    elem.querySelector(".info div.system span.value").innerHTML = `${
      game.data.systemUpdate.hasUpdate
        ? `<i class="notification-pip update active fas fa-exclamation-circle" data-action="system-update" data-tooltip="${game.i18n.format(
            "SETUP.UpdateAvailable",
            {
              type: game.i18n.localize("System"),
              channel: game.data.system.title,
              version: game.data.systemUpdate.version,
            },
          )}"></i> `
        : ""
    }v${game.system.version}`;

    const systemLinksContainer = elem.querySelector(".info div.system-links");
    let systemLinks = Array.from(systemLinksContainer.querySelectorAll("a"));
    const systemLinksText = systemLinks.map((link) =>
      link.textContent.toLowerCase(),
    );
    const done = systemLinksContainer.querySelectorAll(`.${MODULE.ID}`).length > 0;

    if (!done && (readme || changelog || attributions || license)) {
      if (
        readme ||
        ((game.system.readme || "").match(APIs.github) ?? false) ||
        ((game.system.readme || "").match(APIs.rawGithub) ?? false)
      ) {
        if (systemLinksText.some((text) => text.includes("readme"))) {
          const link = systemLinks.find((link) =>
            link.textContent.toLowerCase().includes("readme"),
          );
          link.remove();
          systemLinks = systemLinks.filter((l) => l !== link);
        }
        const readmeButton = document.createElement("button");
        readmeButton.classList.add(MODULE.ID);
        readmeButton.dataset.action = "readme";
        readmeButton.dataset.tooltip = MODULE.localize(
          "dialog.moduleManagement.tags.readme",
        );
        readmeButton.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${MODULE.localize("dialog.moduleManagement.tags.readme")}`;
        systemLinksContainer.append(readmeButton);

        readmeButton.addEventListener("click", () => {
          new PreviewDialog({
            [game.system.id]: {
              hasSeen: false,
              title: game.system.title ?? "System",
              version: game.system.version ?? "0.0.0",
              type: "README",
              isSystem: true,
            },
          }).render(true);
        });
      }

      if (
        changelog ||
        ((game.system.changelog || "").match(APIs.github) ?? false) ||
        ((game.system.changelog || "").match(APIs.rawGithub) ?? false)
      ) {
        if (systemLinksText.some((text) => text.includes("changelog"))) {
          const link = systemLinks.find((link) =>
            link.textContent.toLowerCase().includes("changelog"),
          );
          link.remove();
          systemLinks = systemLinks.filter((l) => l !== link);
        }
        const changelogButton = document.createElement("button");
        changelogButton.classList.add(MODULE.ID);
        changelogButton.dataset.action = "changelog";
        changelogButton.dataset.tooltip = MODULE.localize(
          "dialog.moduleManagement.tags.changelog",
        );
        changelogButton.innerHTML = `<i class="fa-solid fa-list"></i> ${MODULE.localize("dialog.moduleManagement.tags.changelog")}`;
        systemLinksContainer.append(changelogButton);

        changelogButton.addEventListener("click", () => {
          new PreviewDialog({
            [game.system.id]: {
              hasSeen: false,
              title: game.system.title ?? "System",
              version: game.system.version ?? "0.0.0",
              type: "CHANGELOG",
              isSystem: true,
            },
          }).render(true);
        });
      }

      if (
        attributions ||
        ((game.system.flags.attributions || "").match(APIs.github) ?? false) ||
        ((game.system.flags.attributions || "").match(APIs.rawGithub) ?? false)
      ) {
        if (systemLinksText.some((text) => text.includes("attributions"))) {
          const link = systemLinks.find((link) =>
            link.textContent.toLowerCase().includes("attributions"),
          );
          link.remove();
          systemLinks = systemLinks.filter((l) => l !== link);
        }
        const attributionsButton = document.createElement("button");
        attributionsButton.classList.add(MODULE.ID);
        attributionsButton.dataset.action = "attributions";
        attributionsButton.dataset.tooltip = MODULE.localize(
          "dialog.moduleManagement.tags.attributions",
        );
        attributionsButton.innerHTML = `<i class="fa-brands fa-creative-commons-by"></i> ${MODULE.localize("dialog.moduleManagement.tags.attributions")}`;
        systemLinksContainer.append(attributionsButton);

        attributionsButton.addEventListener("click", () => {
          new PreviewDialog({
            [game.system.id]: {
              hasSeen: false,
              title: game.system.title ?? "System",
              version: game.system.version ?? "0.0.0",
              type: "ATTRIBUTIONS",
              isSystem: true,
            },
          }).render(true);
        });
      }

      if (
        license ||
        ((game.system.flags.license || "").match(APIs.github) ?? false) ||
        ((game.system.flags.license || "").match(APIs.rawGithub) ?? false)
      ) {
        if (systemLinksText.some((text) => text.includes("license"))) {
          const link = systemLinks.find((link) =>
            link.textContent.toLowerCase().includes("license"),
          );
          link.remove();
          systemLinks = systemLinks.filter((l) => l !== link);
        }
        const licenseButton = document.createElement("button");
        licenseButton.classList.add(MODULE.ID);
        licenseButton.dataset.action = "license";
        licenseButton.dataset.tooltip = MODULE.localize(
          "dialog.moduleManagement.tags.license",
        );
        licenseButton.innerHTML = `<i class="fa-brands fa-creative-commons-by"></i> ${MODULE.localize("dialog.moduleManagement.tags.license")}`;
        systemLinksContainer.append(licenseButton);

        licenseButton.addEventListener("click", () => {
          new PreviewDialog({
            [game.system.id]: {
              hasSeen: false,
              title: game.system.title ?? "System",
              version: game.system.version ?? "0.0.0",
              type: "LICENSE",
              isSystem: true,
            },
          }).render(true);
        });
      }
      systemLinks.forEach((link) => {
        const button = document.createElement("button");
        button.classList.add(MODULE.ID);
        button.append(link);
        button.addEventListener("click", () => link.click());
        systemLinksContainer.append(button);
      });
    }

    // Hide Active Modules
    MODULE.log("Show Active Modules", MODULE.setting("showActiveModules"));

    // If Hidden or Button, hide default Active Modules
    if (["hidden", "button"].includes(MODULE.setting("showActiveModules")))
      elem.querySelector(".info div.modules").classList.add("hidden");

    // If Button, add active modules / total modules text to button
    if (MODULE.setting("showActiveModules") === "button") {
      const modulesCountButton = elem.querySelector(
        'section.settings button[data-app="modules"]:not(:has(small))',
      );
      if (modulesCountButton) {
        modulesCountButton.insertAdjacentHTML(
          "beforeend",
          ` <small><span class="modules-count-active">${game.modules.filter((module) => module.active).length}</span><span class="modules-count-total">${game.modules.size}</span></small>`,
        );
      }
    }
  }
}
