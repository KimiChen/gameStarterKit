import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function compress5(uuid: string): string {
    const hex = uuid.replaceAll("-", "");
    const rest = hex.slice(5);
    let bits = "";
    for (const ch of rest) bits += Number.parseInt(ch, 16).toString(2).padStart(4, "0");
    const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < bits.length; i += 6) {
        out += table[Number.parseInt(bits.slice(i, i + 6).padEnd(6, "0"), 2)];
    }
    return hex.slice(0, 5) + out.replaceAll("+", "-").replaceAll("/", "-");
}

test("UniFlex preview uses a dedicated scene and does not hijack Main", () => {
    const main = readFileSync(resolve(root, "apps/client/src/Main.ts"), "utf8");
    assert.equal(main.includes("uniflexConfirmPreview"), false);
    assert.equal(main.includes("ui-uniflex/preview"), false);
    assert.match(main, /createAppRuntime\(\{/);

    const scenePath = resolve(root, "apps/Cocos/assets/uniflex.scene");
    const sceneMetaPath = resolve(root, "apps/Cocos/assets/uniflex.scene.meta");
    const scriptMetaPath = resolve(root, "apps/Cocos/assets/src/ui-uniflex/UniFlexPreview.ts.meta");
    assert.equal(existsSync(resolve(root, "apps/client/src/ui-uniflex/UniFlexPreview.ts")), true);
    assert.equal(existsSync(scenePath), true);
    const sceneMeta = JSON.parse(readFileSync(sceneMetaPath, "utf8")) as { uuid: string };
    const scriptMeta = JSON.parse(readFileSync(scriptMetaPath, "utf8")) as { uuid: string };
    const scene = JSON.parse(readFileSync(scenePath, "utf8")) as Array<Record<string, unknown>>;
    assert.equal(scene[0]?._name, "uniflex");
    assert.equal(scene[1]?._id, sceneMeta.uuid);
    assert.ok(scene.some((entry) => entry.__type__ === compress5(scriptMeta.uuid)));

    const preview = JSON.parse(readFileSync(resolve(root, "apps/Cocos/settings/v2/packages/preview.json"), "utf8")) as {
        general: { start_scene: string };
    };
    const defaultScene = JSON.parse(readFileSync(resolve(root, "apps/Cocos/assets/scene.scene.meta"), "utf8")) as { uuid: string };
    assert.equal(preview.general.start_scene, defaultScene.uuid);
    assert.notEqual(sceneMeta.uuid, defaultScene.uuid);
});
