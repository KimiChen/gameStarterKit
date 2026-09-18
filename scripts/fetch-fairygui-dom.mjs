#!/usr/bin/env node
import { FAIRYGUI_DOM, verifyFairyguiDomTarball } from "./lib/uniflex-fgui/vendor.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
verifyFairyguiDomTarball(root);
console.log(`ok ${FAIRYGUI_DOM.tarball} ${FAIRYGUI_DOM.sha256}`);
