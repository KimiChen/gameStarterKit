import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BUILTIN_PRESENTATION } from "../src/kits/mmo/api/content/index";
import { presentation } from "../src/plugins/mmohold/mmoPresentation";

test("holdRidge 表现覆盖内容身份，不覆盖内置映射", () => {
    const pack = JSON.parse(readFileSync(new URL("../../plugins/mmohold/content/pack.json", import.meta.url), "utf8"));
    for (const item of [...pack.classes, ...pack.creatures, ...pack.items, ...pack.npcs]) {
        const entry = presentation[item.presentationId];
        assert.ok(entry, item.presentationId);
        assert.ok(entry.label && entry.size > 0);
        assert.equal(entry.color.length, 4);
        assert.ok(entry.color.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255));
        assert.equal(BUILTIN_PRESENTATION[item.presentationId], undefined);
    }
});
