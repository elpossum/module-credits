import { MODULE } from "./_module.mjs";

export async function addBetterDependencies(app, elem) {
  const dependencies = elem.querySelectorAll(".form-group.slim");
  const dependencyIds = Array.from(dependencies).map(
    (dep) => dep.querySelector("input").name,
  );
  const relationships = app.root.relationships;

  const recommendedElem = Array.from(elem.querySelectorAll("legend")).filter(
    (legend) => {
      return (
        legend.textContent ===
        game.i18n.localize("MODMANAGE.OptionalDependencies")
      );
    },
  )[0];
  if (recommendedElem)
    recommendedElem.textContent = game.i18n.localize(
      "MODMANAGE.RecommendedDependencies",
    );

  // Add tooltips
  dependencies.forEach((dep) => {
    const moduleId = dep.querySelector("input").name;
    let relationship;
    let found = false;
    for (const value of Object.values(relationships).concat(
      Object.values(relationships.flags),
    )) {
      for (const rel of value) {
        if (rel.id === moduleId) {
          relationship = rel;
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
    }

    if (relationship.reason) {
      dep.dataset.tooltip = relationship.reason;
      dep["aria-describedby"] = "tooltip";
    }
  });

  // Add optional dependencies
  const moduleJson = await foundry.utils
    .fetchWithTimeout(`modules/${app.root.id}/module.json`)
    .then((res) => res.json());
  const optionalDependencies = [];
  moduleJson.relationships.optional.forEach((dep) => {
    if (!dependencyIds.includes(dep.id)) optionalDependencies.push(dep);
  });
  relationships.flags?.optional?.forEach((dep) => {
    if (
      !dependencyIds.includes(dep.id) &&
      !optionalDependencies.some((d) => d.id === dep.id)
    ) {
      optionalDependencies.push(dep);
    }
  });
  if (!optionalDependencies || optionalDependencies.length === 0) return;
  app.optionalDependencies = new Map();
  const data = foundry.utils.deepClone(Array.from(optionalDependencies));
  data.forEach((dep) => {
    const module = game.modules.get(dep.id);
    if (module) {
      dep.title = module.title;
      app.optionalDependencies.set(dep.id, { dep, checked: true });
    }
  });

  if (app.optionalDependencies.size > 0) {
    const optionalDependenciesElement =
      await foundry.applications.handlebars.renderTemplate(
        `modules/${MODULE.ID}/templates/dependencies.hbs`,
        { data, enabling: app.options.enabling },
      );
    elem
      .querySelector("[data-application-part='resolution']")
      .insertAdjacentHTML("beforeend", optionalDependenciesElement);
    elem
      .querySelectorAll("fieldset[data-relationship='optional'] input")
      .forEach((input) => {
        input.addEventListener("change", (event) => {
          event.stopImmediatePropagation();
          const checked = event.target.checked;
          app.optionalDependencies.get(input.name).checked = checked;
          input.toggleAttribute("checked", checked);
        });
      });
  }
}
