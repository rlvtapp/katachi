import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(resolve(scriptDir, "../package.json"), "utf8"),
);
const releaseTag = process.argv[2];

if (!releaseTag) {
  console.error("Usage: node scripts/verify-release-version.mjs <release-tag>");
  process.exit(1);
}

const taggedVersion = releaseTag.startsWith("v")
  ? releaseTag.slice(1)
  : releaseTag;

if (taggedVersion !== packageJson.version) {
  console.error(
    `Release tag ${releaseTag} does not match package version ${packageJson.version}.`,
  );
  process.exit(1);
}

if (packageJson.version.includes("-")) {
  console.error(
    `Refusing to publish prerelease version ${packageJson.version} from the stable workflow.`,
  );
  process.exit(1);
}

console.log(`Release version verified: ${packageJson.version}`);
