/** Register pure tool regression suites in the existing verify:all server-test discovery. */
// @ts-expect-error Pure ESM test-registration module has no TypeScript declaration.
import * as rgba8Tests from "../../../tools/creator-preview/probe-stage3d-rgba8.test.mjs";
// @ts-expect-error Pure ESM test-registration module has no TypeScript declaration.
import * as diagnosticTests from "../../../tools/creator-preview/stage3d-diagnostics.test.mjs";

void rgba8Tests;
void diagnosticTests;
