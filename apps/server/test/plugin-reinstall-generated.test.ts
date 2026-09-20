/**
 * `install --reinstall-from-tree` 的推导集冲突闸（tools/plugin/install.ts ownershipConflicts）对 writer 生成物的豁免（MMO MK4-B2：kit 声明贡献点后
 * `apps/{server,client}/src/kits/<id>/contributions.generated.ts` 与 Cocos 镜像 + .meta 落在 kit 推导集内，但硬排除形态永不随包 ⇒ ⛔ 当「混入」）。
 * 临时根：kit 目录里放 contributions.generated.ts（+ .meta）与一个手写的 stray.ts；前者豁免、后者点名。
 * 变异验证：ownershipConflicts 删硬排除豁免 → 「生成物豁免」红。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { ownershipConflicts } from "../tools/plugin/install";
import type { OwnershipRule } from "../tools/plugin/ownership";

const roots: string[] = [];
after(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

test("ownershipConflicts：推导集内的 *.generated.ts 及其 .meta 豁免，手写陌生文件仍点名", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-reinstall-generated-"));
    roots.push(root);
    const write = (relative: string): void => { fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true }); fs.writeFileSync(path.join(root, relative), "x"); };
    write("apps/server/src/kits/kfix/contributions.generated.ts");
    write("apps/client/src/kits/kfix/contributions.generated.ts");
    write("apps/Cocos/assets/src/kits/kfix/contributions.generated.ts");
    write("apps/Cocos/assets/src/kits/kfix/contributions.generated.ts.meta");
    write("apps/server/src/kits/kfix/stray.ts");
    const rules: readonly OwnershipRule[] = [
        { kind: "dir", path: "apps/server/src/kits/kfix", reason: "kit 服务端目录" },
        { kind: "dir", path: "apps/client/src/kits/kfix", reason: "kit 客户端目录" },
    ] as OwnershipRule[];
    assert.deepEqual(ownershipConflicts(root, rules, new Set()), ["apps/server/src/kits/kfix/stray.ts"], "生成物豁免、陌生文件点名");
});
