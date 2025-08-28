// GET MODULE CORE
import { MODULE } from "../_module.mjs";
import { mergeObject } from "../init.mjs";

const JournalEntrySheet = foundry.applications.sheets.journal.JournalEntrySheet;

export let PreviewDialog;

export function cacheFiles() {
  const modules = MODULE.setting("trackedChangelogs");
  ["README", "CHANGELOG", "ATTRIBUTIONS", "LICENSE"].forEach((type) => {
    const data = {
      ...modules,
      [game.system.id]: {
        hasSeen: false,
        title: game.system.title ?? "System",
        version: game.system.version ?? "0.0.0",
        type,
        isSystem: true,
      },
    };
    Object.keys(modules).forEach((key) => (data[key].type = type));
    for (const [key, value] of Object.entries(data))
      game.modules
        .get(MODULE.ID)
        .API.getContent(
          (value.isSystem ?? false) ? game.system : game.modules.get(key),
          value.type,
          {
            dir: (value.isSystem ?? false) ? "systems" : "modules",
          },
        )
        .catch((error) => MODULE.error(error));
  });
}

Hooks.once(
  "i18nInit",
  () =>
    (PreviewDialog = class PreviewDialog extends JournalEntrySheet {
      constructor(data) {
        let pages = [];
        for (const [key, value] of Object.entries(data)) {
          pages.push({
            name: value.title,
            type: "text",
            text: {
              format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
              content: game.modules.get(MODULE.ID).content[key][value.type],
            },
            flags: {
              [MODULE.ID]: {
                id: key,
              },
            },
          });
        }

        const document = new foundry.documents.JournalEntry({
          name: MODULE.TITLE,
          pages,
        });

        super({
          document,
        });

        this.items = data;
        this.IsSystem = Object.values(data)[0]?.isSystem ?? false;
      }

      #search;
      #filteredPages = new Set();
      #categorizedPages;

      static DEFAULT_OPTIONS = {
        id: `${MODULE.ID}-dialog`,
        window: {
          popOut: true,
          title: MODULE.TITLE,
        },
        position: {
          width: window.innerWidth > 960 ? 960 : window.innerWidth - 100,
          height: window.innerHeight > 800 ? 800 : window.innerHeight - 100,
        },
        actions: {
          markAsSeen: this.#markAsSeen,
        },
      };

      static PARTS = {
        sidebar: {
          template: `modules/${MODULE.ID}/templates/preview.hbs`,
          templates: ["templates/journal/toc.hbs"],
          scrollable: [".toc"],
        },
        pages: {
          template: "templates/journal/pages.hbs",
          scrollable: [".journal-entry-pages"],
        },
      };

      async _prepareContext() {
        const context = await super._prepareContext();
        // Send data to the template
        context.DIALOG = {
          ID: MODULE.ID,
          TITLE: MODULE.TITLE,
        };
        context.IsMultipleItems = Object.keys(this.items).length > 1;
        context.IsGM = game.user.isGM;
        return context;
      }

      _preparePageData() {
        const hasFilterQuery = this.#search?.query;
        const levels = Object.entries(CONST.DOCUMENT_OWNERSHIP_LEVELS);
        const categoryMap = {};

        // Prepare pages.
        const uncategorized = this.entry.pages.contents
          .reduce((arr, page) => {
            if (!this.isPageVisible(page)) return arr;
            const { category, id, name, sort, title, type } = page;
            const hasSeen = this.IsSystem
              ? true
              : MODULE.setting("trackedChangelogs")[
                  page.getFlag(MODULE.ID, "id")
                ].hasSeen;
            const hidden = hasFilterQuery && !this.#filteredPages.has(page.id);
            const sheet = this.getPageSheet(page);
            const cssClasses = [type, `level${title.level}`, "page"];
            const [ownership] = levels.find(
              ([, level]) => level === page.ownership.default,
            );
            const editable = false;
            const descriptor = {
              category,
              id,
              editable,
              hidden,
              name,
              sort,
              tocClass: cssClasses.join(" "),
              viewClass: cssClasses
                .concat(sheet.options.viewClasses || [])
                .join(" "),
              icon: hasSeen ? "fa-solid fa-eye" : "fa-solid fa-eye-slash",
              ownershipClass: ownership.toLowerCase(),
            };
            if (category && this.entry.categories.has(category)) {
              categoryMap[category] ??= [];
              categoryMap[category].push(descriptor);
            } else {
              descriptor.uncategorized = true;
              arr.push(descriptor);
            }
            return arr;
          }, [])
          .sort((a, b) => a.sort - b.sort);

        // Order pages by category
        this.#categorizedPages = {};
        const categories = this.entry.categories.contents.sort(
          foundry.documents.JournalEntry.sortCategories,
        );
        const categorized = categories.flatMap(({ id: categoryId }) => {
          const pages = (categoryMap[categoryId] ?? []).sort(
            (a, b) => a.sort - b.sort,
          );
          this.#categorizedPages[categoryId] = pages.map((p) => p.id);
          return pages;
        });

        return Object.fromEntries(
          categorized.concat(uncategorized).map((page, i) => {
            page.number = i;
            return [page.id, page];
          }),
        );
      }

      static #markAsSeen() {
        const trackedChangelogs = MODULE.setting("trackedChangelogs");
        for (let key in trackedChangelogs) {
          trackedChangelogs[key].hasSeen = true;

          if (
            this.element.querySelector(
              `aside.sidebar nav ol.directory-list li[data-module-id="${key}"]`,
            ) ??
            false
          ) {
            this.element
              .querySelector(
                `aside.sidebar nav ol.directory-list li[data-module-id="${key}"] span.page-ownership`,
              )
              .classList.add("observer");
            this.element
              .querySelector(
                `aside.sidebar nav ol.directory-list li[data-module-id="${key}"] span.page-ownership i`,
              )
              .classList.remove("fa-eye-slash");
            this.element
              .querySelector(
                `aside.sidebar nav ol.directory-list li[data-module-id="${key}"] span.page-ownership i`,
              )
              .classList.add("fa-eye");
          }
        }

        MODULE.setting("trackedChangelogs", trackedChangelogs);
        this.render();
      }

      async _renderHeadings() {
        // Prevent headings being added
      }

      _createContextMenu() {
        // Prevent context menu on changelogs
      }

      goToPage(pageId, { anchor } = {}) {
        const moduleId = this.document.pages
          .get(pageId)
          .getFlag(MODULE.ID, "id");
        if (
          game.user.isGM &&
          (MODULE.setting("trackedChangelogs")[moduleId] ?? false)
        ) {
          MODULE.setting(
            "trackedChangelogs",
            mergeObject(MODULE.setting("trackedChangelogs"), {
              [moduleId]: { hasSeen: true },
            }),
          );
        }
        const heading = this.element.querySelector(
          `li[data-page-id="${pageId}"]`,
        );
        heading
          .querySelector(".page-ownership.fa-solid")
          .classList.remove("fa-eye-slash");
        heading
          .querySelector(".page-ownership.fa-solid")
          .classList.add("fa-eye");
        if (!this.isMultiple && pageId !== this.pageId) {
          return this.render({ pageId, anchor });
        }
        const page = this.element.querySelector(
          `.journal-entry-page[data-page-id="${pageId}"]`,
        );
        if (anchor) {
          const { element } = this.getPageSheet(pageId)?.toc[anchor] ?? {};
          if (element) {
            element.scrollIntoView();
            return;
          }
        }
        page?.scrollIntoView();
      }

      async _onRender(context, options) {
        this.element
          .querySelector("header.journal-header")
          ?.setAttribute("hidden", "");
        this.element
          .querySelector(".header-control[data-action='toggleControls']")
          ?.setAttribute("hidden", "");
        await super._onRender(context, options);
        this.goToPage(this.pageId);
      }

      // Prevent drag/drop
      _canDragStart() {
        return false;
      }

      _canDragDrop() {
        return false;
      }

      async _renderPageView(element, sheet) {
        await super._renderPageView(element, sheet);
      }
    }),
);
