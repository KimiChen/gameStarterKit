/**
 * FGUI 产物往返自检：把 `.bin` 真解析回来，核对它与源 `package.xml` 是否讲同一件事。
 *
 * 与 `fgui-manifest.mjs` 的哈希锁**并列而不替代**，两者回答的不是同一个问题：
 *   - 哈希锁：「这个文件还是我记下的那个吗」——只要产物没被改动就绿。
 *   - 往返自检：「这个产物解析回来还是我以为的那份内容吗」。
 * 于是「导出过程静默丢内容、而哈希如实记录了这个残缺结果」这一失败形态，哈希锁**永远看不见**
 * （它记的就是残缺结果本身），只能由这里拦。
 *
 * ⛔ 明确不做的事：不拿「`package.xml` 声明数 == `.bin` 条目数」当不变量。FairyGUI 发布会剥离
 * 「未导出且无人引用」的资源，这是正确行为——本仓 12 个包里 7 个存在合法差额（差额绝对值合计 15），
 * 粗比数量会立刻产生 15 处假阳。判据必须落在**具名的、应当存在的**那一部分上。
 *
 * 失败语义：`.bin` 由 FairyGUI 编辑器写出，本仓拦不住它落盘；本仓能做到的等价语义是**阻止残缺
 * 产物进入下游**，所以检查内联在 `fgui-manifest --write` 重记哈希之前。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UI = path.join(ROOT, "apps/Cocos/assets/resources/ui");

/** `.bin` 条目类型；取值来自 fairygui 运行时的 PackageItemType，⛔ 不要改数值。 */
const ITEM_TYPE = {
  0: "Image", 1: "MovieClip", 2: "Sound", 3: "Component", 4: "Atlas",
  5: "Font", 6: "Swf", 7: "Misc", 8: "Unknown", 9: "Spine", 10: "DragonBones",
};
/** 会引用外部落盘文件的条目类型（不变量 D）。Image 的像素在图集里，故不在此列。 */
const FILE_BEARING_TYPES = new Set([2, 4, 7, 9, 10]);

/**
 * `.bin` 的只读游标。字段顺序、`readS` 的 65534/65533 哨兵与分段索引表的 seek 语义都照抄
 * `apps/client/extensions/fairygui-cc/runtime/fairygui.mjs` 的 `loadPackage`——那是运行时真正
 * 用来读这些文件的实现，⛔ 偏离它就等于在验一份没人会那样读的格式。
 */
class BinCursor {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
    this.stringTable = [];
  }

  byte() { return this.view.getUint8(this.pos++); }
  bool() { return this.byte() === 1; }
  short() { const value = this.view.getInt16(this.pos); this.pos += 2; return value; }
  ushort() { const value = this.view.getUint16(this.pos); this.pos += 2; return value; }
  int() { const value = this.view.getInt32(this.pos); this.pos += 4; return value; }
  uint() { const value = this.view.getUint32(this.pos); this.pos += 4; return value; }

  str(len) {
    if (len === undefined) len = this.ushort();
    if (this.pos + len > this.bytes.byteLength) throw new Error("字符串越界，产物已截断");
    const value = Buffer.from(this.bytes.buffer, this.bytes.byteOffset + this.pos, len).toString("utf8");
    this.pos += len;
    return value;
  }

  /** 字符串表引用；65534 = null、65533 = 空串，其余是下标。 */
  s() {
    const index = this.ushort();
    if (index === 65534) return null;
    if (index === 65533) return "";
    if (index >= this.stringTable.length) throw new Error(`字符串表下标越界 ${index}`);
    return this.stringTable[index];
  }

  seek(base, block) {
    const saved = this.pos;
    this.pos = base;
    const segCount = this.byte();
    if (block >= segCount) { this.pos = saved; return false; }
    const useShort = this.byte() === 1;
    let next;
    if (useShort) { this.pos += 2 * block; next = this.ushort(); }
    else { this.pos += 4 * block; next = this.uint(); }
    if (next > 0) { this.pos = base + next; return true; }
    this.pos = saved;
    return false;
  }
}

/** 解析一个 `.bin`，返回 id/name/依赖/条目/sprite。⛔ 只读，绝不写回产物。 */
export function parsePackageBin(bytes) {
  const cursor = new BinCursor(bytes);
  if (cursor.uint() !== 0x46475549) throw new Error("不是 FGUI 产物（magic 不是 'FGUI'）");
  const version = cursor.int();
  const compressed = cursor.bool();
  if (compressed) {
    // 本仓的发布配置产出未压缩 v7；压缩产物需要先解流才能解析，这里 fail-fast 而不是静默跳过
    // ——静默跳过会让整个往返自检对压缩包变成空跑。
    throw new Error("产物被标记为压缩，往返自检只支持未压缩 FGUI 包");
  }
  const id = cursor.str();
  const name = cursor.str();
  cursor.pos += 20;
  const base = cursor.pos;
  const ver2 = version >= 2;

  // 段 4/5：字符串表必须最先读，后面所有 readS 都依赖它。
  if (!cursor.seek(base, 4)) throw new Error("产物缺少字符串表（段 4）");
  let count = cursor.int();
  cursor.stringTable = new Array(count);
  for (let i = 0; i < count; i += 1) cursor.stringTable[i] = cursor.str();
  if (cursor.seek(base, 5)) {
    count = cursor.int();
    for (let i = 0; i < count; i += 1) {
      const index = cursor.ushort();
      const len = cursor.int();
      cursor.stringTable[index] = cursor.str(len);
    }
  }

  // 段 0：依赖包。
  const dependencies = [];
  if (cursor.seek(base, 0)) {
    count = cursor.short();
    for (let i = 0; i < count; i += 1) dependencies.push({ id: cursor.s(), name: cursor.s() });
  }

  // 段 1：条目表。每条自带 nextPos，跳过类型专属尾部即可，⛔ 不要顺序读到底。
  const items = [];
  if (!cursor.seek(base, 1)) throw new Error("产物缺少条目表（段 1）");
  count = cursor.short();
  for (let i = 0; i < count; i += 1) {
    const next = cursor.int() + cursor.pos;
    const type = cursor.byte();
    const itemId = cursor.s();
    const itemName = cursor.s();
    cursor.s(); // path：编辑器内的分组路径，产物侧不作判据
    const file = cursor.s();
    const exported = cursor.bool();
    const width = cursor.int();
    const height = cursor.int();
    items.push({ type, typeName: ITEM_TYPE[type] ?? `Unknown(${type})`, id: itemId, name: itemName, file, exported, width, height });
    cursor.pos = next;
  }

  // 段 2：sprite 表（图集内的矩形）。
  const sprites = [];
  if (cursor.seek(base, 2)) {
    count = cursor.short();
    for (let i = 0; i < count; i += 1) {
      const next = cursor.short() + cursor.pos;
      const itemId = cursor.s();
      const atlasId = cursor.s();
      const x = cursor.int();
      const y = cursor.int();
      const w = cursor.int();
      const h = cursor.int();
      const rotated = cursor.bool();
      if (ver2 && cursor.bool()) { cursor.int(); cursor.int(); cursor.int(); cursor.int(); }
      sprites.push({ itemId, atlasId, x, y, w, h, rotated });
      cursor.pos = next;
    }
  }

  return { id, name, version, dependencies, items, sprites };
}

export function readPackageBin(file) {
  return parsePackageBin(new Uint8Array(fs.readFileSync(file)));
}

/**
 * 图集/骨骼等外部文件在 Cocos 侧的落盘名：图集是包名前缀（`Pkg_atlas0.png`），独立资源保留
 * 原基名（Spine 的 `.skel`）。两种形态都接受，任一命中即算落盘。
 */
function resolveExternalFile(uiDir, packageName, file) {
  const candidates = [`${packageName}_${file}`, file];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(uiDir, candidate))) return candidate;
  }
  return null;
}

/**
 * 四条不变量（纯函数，便于用构造输入验判别力）：
 *   A. `package.xml` 中每个 `exported="true"` 资源的 id 必须出现在同名 `.bin` 条目表；
 *   B. 源 XML 的每个资源引用——`ui://<pkgId><resId>` **与** `<image src pkg>` 两种拼写——
 *      目标 resId 必须在**目标包 `.bin`** 里；
 *   C. `.bin` 段 0 声明的每个依赖包都要有已导出的 `.bin` 且 id 对得上；
 *   D. `.bin` 中 Atlas/Spine/Sound/Misc 条目引用的外部文件，以及 `package.xml` 用 `require=`
 *      声明的伴生文件，都必须落盘。
 *
 * @param packages 每项 { name, id, resources, uiReferences }，来自 fgui-manifest 的源 XML 解析。
 */
export function roundtripProblems(packages, { uiDir = UI, read = readPackageBin } = {}) {
  const problems = [];
  const parsed = new Map();
  for (const info of packages) {
    const file = path.join(uiDir, `${info.name}.bin`);
    if (!fs.existsSync(file)) { problems.push(`${info.name}: 缺少导出 ${info.name}.bin`); continue; }
    try {
      parsed.set(info.name, read(file));
    } catch (error) {
      problems.push(`${info.name}.bin 解析失败：${error.message}`);
    }
  }

  const byPackageId = new Map();
  for (const [name, bin] of parsed) byPackageId.set(bin.id, { name, bin });

  for (const info of packages) {
    const bin = parsed.get(info.name);
    if (!bin) continue;

    if (bin.id !== info.id) {
      problems.push(`${info.name}: package.xml 的 id ${info.id} 与产物里的 ${bin.id} 不一致`);
    }
    const itemIds = new Set(bin.items.map((item) => item.id));

    // A：已导出资源必须真的出现在产物里。⛔ 判据是「声明为 exported 的那些」，不是总数。
    for (const resource of info.resources) {
      if (!resource.exported) continue;
      if (!itemIds.has(resource.id)) {
        problems.push(
          `${info.name}: package.xml 声明 exported 的 ${resource.kind} ${resource.name}（id=${resource.id}）`
          + " 不在产物条目表里——导出过程丢了它，而哈希锁只会如实记下这个残缺结果",
        );
      }
    }

    // C：依赖包必须真的存在且 id 对得上。
    for (const dependency of bin.dependencies) {
      const target = byPackageId.get(dependency.id);
      if (!target) {
        problems.push(
          `${info.name}: 产物依赖包 ${dependency.name ?? "?"}（id=${dependency.id}）没有对应的已导出 .bin`,
        );
        continue;
      }
      if (dependency.name !== null && target.name !== dependency.name) {
        problems.push(
          `${info.name}: 产物依赖 id=${dependency.id} 记的名字是 ${dependency.name}，`
          + `实际该 id 属于 ${target.name}`,
        );
      }
    }

    // D：外部文件必须落盘。
    for (const item of bin.items) {
      if (!FILE_BEARING_TYPES.has(item.type)) continue;
      if (item.file === null || item.file === "") continue;
      if (!resolveExternalFile(uiDir, info.name, item.file)) {
        problems.push(
          `${info.name}: 产物 ${item.typeName} 条目引用的外部文件 ${item.file} 未落盘`
          + `（找过 ${info.name}_${item.file} 与 ${item.file}）`,
        );
      }
    }

    // D'：package.xml 的 require= 伴生文件同样必须落盘。
    // ⚠ 它们不在 .bin 条目的 file 字段里（Spine 的 .bin 只记 .skel），也通常没有 exported，
    // 所以 A 与上面的 D 都看不见——漏导的后果是骨骼加载不出图集与贴图，且哈希锁会把这个
    // 残缺状态如实记成新基线。
    for (const companion of info.requiredCompanions ?? []) {
      if (!companion.name) continue;
      if (!resolveExternalFile(uiDir, info.name, companion.name)) {
        problems.push(
          `${info.name}: ${companion.ownerName} 用 require= 声明的伴生文件 ${companion.name} 未落盘`
          + `（找过 ${info.name}_${companion.name} 与 ${companion.name}）`,
        );
      }
    }
  }

  // B：源 XML 里被引用的资源必须在目标包产物里。现有 manifest 检查只查到 package.xml 为止，
  // 「源里声明了、目标包却把它漏导了」这一层此前无人守。
  //
  // ⚠ 引用有两种拼写，**必须都查**：`ui://<pkgId><resId>` 与 `<image src="<resId>" pkg="<pkgId>">`
  // （pkg 缺省即同包）。后者是 FairyGUI 主要的拼写——本仓 53 处 src= 对 38 处 ui://。只查 ui://
  // 时，一个「被引用但未导出」的资源会同时逃过 A（因 exported !== true 被跳过）和 B，
  // 于是漏导它的残缺产物四条不变量全绿，`--write` 再把它钉成新基线。
  for (const info of packages) {
    for (const reference of info.uiReferences ?? []) {
      const target = byPackageId.get(reference.packageId);
      if (!target) continue; // 未知包由 fgui-manifest 的 ui:// 闭包检查负责报，这里不重复报
      if (!target.bin.items.some((item) => item.id === reference.resourceId)) {
        problems.push(
          `${reference.from}: ${reference.form ?? `ui://${reference.packageId}${reference.resourceId}`}`
          + ` 的目标资源 ${reference.resourceId} 不在 ${target.name}.bin 里——目标包漏导了它`,
        );
      }
    }
  }

  return problems;
}
