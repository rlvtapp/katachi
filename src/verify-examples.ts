import { buildProject } from "./core/build.js";
import { verifyAskamaFixtures } from "./core/verify.js";
import { basicExampleRoot, exampleFixtures } from "./core/example-fixtures.js";

/**
 * Verifies a small public Askama fixture set that ships with the repository.
 * This is intended for OSS consumers and repo contributors as the public
 * end-to-end smoke test project.
 */
buildProject({
  projectRoot: basicExampleRoot,
});

verifyAskamaFixtures({
  fixtures: exampleFixtures,
});
