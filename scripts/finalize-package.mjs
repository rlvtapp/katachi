import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const sourceJsxTypes = resolve(packageRoot, "src/api/jsx.d.ts");
const distJsxTypes = resolve(packageRoot, "dist/api/jsx.d.ts");

mkdirSync(dirname(distJsxTypes), { recursive: true });
copyFileSync(sourceJsxTypes, distJsxTypes);
