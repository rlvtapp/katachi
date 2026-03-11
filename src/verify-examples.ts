import { buildProject } from "./core/build";
import { verifyAskamaFixtures } from "./core/verify";
import { basicExampleRoot, exampleFixtures } from "./core/example-fixtures";

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
