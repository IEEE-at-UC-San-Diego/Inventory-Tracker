import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) {
						return;
					}

					if (id.includes("konva") || id.includes("react-konva")) {
						return "vendor-blueprint";
					}

					if (
						id.includes("@logto/") ||
						id.includes("/convex/") ||
						id.includes("@convex-dev/react-query")
					) {
						return "vendor-auth-data";
					}

					if (
						id.includes("@tanstack/react-router") ||
						id.includes("@tanstack/react-query") ||
						id.includes("@tanstack/router")
					) {
						return "vendor-tanstack";
					}
				},
			},
		},
	},
	resolve: {
		alias: [
			{
				find: /^@\/convex\/(.*)$/,
				replacement: fileURLToPath(new URL("./convex/$1", import.meta.url)),
			},
			{
				find: "@",
				replacement: fileURLToPath(new URL("./src", import.meta.url)),
			},
		],
	},
	plugins: [
		nitro(),
		// this is the plugin that enables path aliases
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
