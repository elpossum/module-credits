import { viteStaticCopy } from "vite-plugin-static-copy";
import { defineConfig, transformWithEsbuild } from "vite";

const config = defineConfig(({ command }) => {
  const plugins = [];
  switch (command) {
    case "build":
      plugins.push([
        {
          name: "minify",
          renderChunk: {
            order: "post",
            handler: async (code, chunk) => {
              return chunk.fileName.endsWith(".mjs")
                ? transformWithEsbuild(code, chunk.fileName, {
                    minify: true,
                    sourcemap: true,
                  })
                : code;
            },
          },
        },
        viteStaticCopy({
          targets: [
            {
              src: "CHANGELOG.md",
              dest: ".",
            },
            {
              src: "README.md",
              dest: ".",
            },
            {
              src: "LICENSE",
              dest: ".",
            },
            {
              src: "languages",
              dest: "."
            },
            {
              src: "styles",
              dest: "."
            },
            {
              src: "templates",
              dest: "."
            },
          ],
        }),
      ]);
      break;
    case "serve":
      plugins.push([
        {
          name: "handlebars-json-hmr",
          apply: "serve",
          handleHotUpdate({file, server}) {
            if (file.startsWith("dist")) return;

            if (file.includes("lang/") && file.endsWith(".json")) {
              const basePath = file.slice(
                file.indexOf("lang/"),
              );
              server.hot.send({
                type: "custom",
                event: "lang-update",
                data: { path: `modules/module-credits/${basePath}` },
              });
            }

            if (file.includes("templates/") && file.endsWith(".hbs")) {
              const basePath = file.slice(
                file.indexOf("templates/"),
              );
              server.hot.send({
                type: "custom",
                event: "template-update",
                data: { path: `modules/module-credits/${basePath}` },
              });
            }
          },
        },
      ]);
      break;
  }

  return {
    base: command === "serve" ? "/modules/module-credits/" : "./",
    server: {
      port: 30001,
      open: "/",
      proxy: {
        "^(?!/modules/module-credits)": "http://localhost:30000/",
        "/socket.io": {
          target: "ws://localhost:30000",
          ws: true,
        },
      },
    },
    build: {
      sourcemap: true,
      minify: false,
      lib: {
        entry: "scripts/init.mjs",
        formats: ["es"],
        fileName: "init",
      },
      rollupOptions: {
        output: {
          entryFileNames: "scripts/bundle.min.mjs",
          sourcemapExcludeSources: true,
        },
      },
      target: "es2022",
    },
    plugins,
  };
});

export default config;
