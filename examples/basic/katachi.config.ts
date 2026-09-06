import { defineConfig } from "@relevate/katachi";

export default defineConfig({
  inputs: [
    {
      directory: "src/templates",
      include: ["**/*.template.tsx"],
    },
  ],
  targets: [
    "react",
    "jsx-static",
    "askama",
    "askama-includes",
    "liquid",
    "liquid-snippets",
  ],
  classNames: {
    mode: "dynamic-only",
    askama: {
      filter: "merge_classes",
      filtersModule: "crate::theme::class_names",
    },
  },
});
