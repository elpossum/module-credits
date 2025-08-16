/** Not an actual hook listener but rather things to run on initial load */
export const Load = {
  listen() {
    function rerenderApps(path) {
      [
        ...Object.values(ui.windows),
        ...foundry.applications.instances.values(),
      ].forEach((app) => app.render());
    }

    // HMR for localization and template files
    if (import.meta.hot) {
      import.meta.hot.on("lang-update", async ({ path }) => {
        const lang = await foundry.utils.fetchJsonWithTimeout(path);
        const apply = () => {
          foundry.utils.mergeObject(game.i18n.translations, lang);
          rerenderApps(path);
        };
        if (game.ready) {
          apply();
        } else {
          Hooks.once("ready", apply);
        }
      });

      import.meta.hot.on("template-update", async ({ path }) => {
        const apply = async () => {
          delete Handlebars.partials[path];
          await foundry.applications.handlebars.getTemplate(path);
          rerenderApps(path);
        };
        if (game.ready) {
          apply();
        } else {
          Hooks.once("ready", apply);
        }
      });
    }
  },
};
