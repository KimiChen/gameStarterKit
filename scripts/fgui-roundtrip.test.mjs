/**
 * 往返自检的定向反例。
 *
 * 判别力必须靠**构造**来证明：HEAD 全绿这件事本身不能说明检查有判别力——一个 `return []`
 * 也是全绿。所以每条不变量都配一个「本该红」的构造输入，并先确认基线是绿的，否则构造用例
 * 会因为基线本来就红而变成空跑。
 *
 * `roundtripProblems` 收 `read` 注入正是为此：直接改真 `.bin` 字节既脆又会污染工作区，
 * 而不变量判的是**解析结果**，所以在解析结果这一层构造反例是等价且稳定的。
 * 与此同时，`parsePackageBin` 必须对**真产物**跑通——否则「解析结果」这一层就悬空了，
 * 下面第一个用例钉的就是这件事。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { packageInfos, roundtripInputs } from "./fgui-manifest.mjs";
import { parsePackageBin, readPackageBin, roundtripProblems } from "./fgui-roundtrip.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UI = path.join(ROOT, "apps/Cocos/assets/resources/ui");

const inputs = roundtripInputs(packageInfos());
/** 真产物的解析结果，作为构造反例的基底。 */
const realBins = new Map(
  inputs.map((info) => [info.name, readPackageBin(path.join(UI, `${info.name}.bin`))]),
);
/** 用给定的（可被篡改的）解析结果跑不变量。 */
const withBins = (bins) => roundtripProblems(inputs, {
  read: (file) => {
    const name = path.basename(file, ".bin");
    const bin = bins.get(name);
    if (!bin) throw new Error(`构造输入缺少 ${name}`);
    return bin;
  },
});
/** 深拷贝真解析结果，避免用例之间互相污染。 */
const clone = () => new Map([...realBins].map(([name, bin]) => [name, structuredClone(bin)]));

test("parsePackageBin 必须能解析仓内全部真产物，且与 package.xml 的 exported 数一致", () => {
  const files = fs.readdirSync(UI).filter((file) => file.endsWith(".bin")).sort();
  assert.ok(files.length >= 12, `产物数量异常：${files.length}`);
  let items = 0;
  let exported = 0;
  for (const file of files) {
    const bin = readPackageBin(path.join(UI, file));
    assert.equal(bin.name, path.basename(file, ".bin"), `${file} 内记的包名必须与文件名一致`);
    assert.match(bin.id, /^[0-9a-z]+$/, `${file} 的 package id 形制异常：${bin.id}`);
    assert.ok(bin.items.length > 0, `${file} 条目表为空`);
    items += bin.items.length;
    exported += bin.items.filter((item) => item.exported).length;
  }
  // 源侧地面真相：package.xml 里 exported="true" 的声明数。两侧独立数出来必须相等——
  // 这同时钉住「解析器没有把条目读串行」。
  const declaredExported = inputs.reduce(
    (total, info) => total + info.resources.filter((resource) => resource.exported).length,
    0,
  );
  assert.equal(exported, declaredExported, "产物里 exported 条目数必须等于 package.xml 的声明数");
  assert.ok(items >= exported, "条目总数不可能少于其中已导出的部分");
});

test("HEAD 基线必须无问题，否则下面的构造用例失去意义", () => {
  assert.deepEqual(roundtripProblems(inputs), []);
  assert.deepEqual(withBins(clone()), [], "注入路径与真实路径必须给出同一结论");
});

test("A：产物漏掉一个 package.xml 声明为 exported 的资源必须被命中", () => {
  const bins = clone();
  const victim = inputs.find((info) => info.resources.some((resource) => resource.exported));
  const dropped = victim.resources.find((resource) => resource.exported);
  const bin = bins.get(victim.name);
  bin.items = bin.items.filter((item) => item.id !== dropped.id);
  const problems = withBins(bins);
  assert.equal(problems.length >= 1, true);
  assert.match(
    problems.join("\n"),
    new RegExp(`${victim.name}: package\\.xml 声明 exported 的 .* 不在产物条目表里`, "u"),
  );
});

test("A：⛔ 不得拿「声明数 == 条目数」当判据——剥离未导出且无人引用的资源是正确行为", () => {
  // FairyGUI 发布确实会剥离这类资源，本仓 12 个包里就存在合法差额。若判据是数量相等，
  // 下面这个「只剩已导出条目」的产物会被误报，而它其实完全合法。
  const bins = clone();
  let strippedSomething = false;
  for (const info of inputs) {
    const bin = bins.get(info.name);
    const before = bin.items.length;
    const exportedIds = new Set(info.resources.filter((r) => r.exported).map((r) => r.id));
    const referenced = new Set(inputs.flatMap((other) =>
      other.uiReferences.filter((ref) => ref.packageId === bin.id).map((ref) => ref.resourceId)));
    bin.items = bin.items.filter((item) =>
      exportedIds.has(item.id) || referenced.has(item.id)
      // 图集/骨骼等外部文件载体本身不是 ui:// 可寻址资源，剥离它们会让不变量 D 失去对象
      || item.file !== null && item.file !== "");
    if (bin.items.length < before) strippedSomething = true;
    bin.sprites = bin.sprites.filter((sprite) => bin.items.some((item) => item.id === sprite.itemId));
  }
  assert.ok(strippedSomething, "构造前提：真产物里确实存在可被合法剥离的条目");
  assert.deepEqual(withBins(bins), [], "合法剥离不得产生任何问题");
});

test("B：目标包漏导了被引用的资源必须被命中", () => {
  const bins = clone();
  const reference = inputs.flatMap((info) => info.uiReferences)[0];
  assert.ok(reference, "构造前提：源 XML 里至少有一条 ui:// 引用");
  const target = [...bins.values()].find((bin) => bin.id === reference.packageId);
  target.items = target.items.filter((item) => item.id !== reference.resourceId);
  const problems = withBins(bins);
  assert.match(
    problems.join("\n"),
    new RegExp(`ui://${reference.packageId}${reference.resourceId} 的目标资源 不在 ${target.name}\\.bin 里`, "u"),
  );
});

test("C：产物声明的依赖包不存在、或 id 与名字对不上，必须分别被命中", () => {
  const depender = inputs.find((info) => realBins.get(info.name).dependencies.length > 0);
  assert.ok(depender, "构造前提：至少有一个包声明了依赖");

  const missing = clone();
  missing.get(depender.name).dependencies = [{ id: "zzzzzzzz", name: "GhostPackage" }];
  assert.match(
    withBins(missing).join("\n"),
    new RegExp(`${depender.name}: 产物依赖包 GhostPackage（id=zzzzzzzz）没有对应的已导出 \\.bin`, "u"),
  );

  const renamed = clone();
  const real = renamed.get(depender.name).dependencies[0];
  renamed.get(depender.name).dependencies = [{ id: real.id, name: "WrongName" }];
  assert.match(
    withBins(renamed).join("\n"),
    new RegExp(`${depender.name}: 产物依赖 id=${real.id} 记的名字是 WrongName`, "u"),
  );
});

test("D：产物引用的外部文件未落盘必须被命中，且两种命名形态都算落盘", () => {
  const bins = clone();
  const [name, bin] = [...bins].find(([, value]) =>
    value.items.some((item) => item.type === 4 && item.file));
  const atlas = bin.items.find((item) => item.type === 4 && item.file);
  const original = atlas.file;
  atlas.file = "atlas_does_not_exist.png";
  assert.match(
    withBins(bins).join("\n"),
    new RegExp(`${name}: 产物 Atlas 条目引用的外部文件 atlas_does_not_exist\\.png 未落盘`, "u"),
  );

  // 图集是包名前缀（Pkg_atlas0.png），Spine 等独立资源保留原基名——两种都必须算落盘。
  atlas.file = original;
  assert.deepEqual(withBins(bins), []);
  const spineHolder = [...bins.values()].find((value) =>
    value.items.some((item) => item.type === 9 && item.file));
  assert.ok(spineHolder, "构造前提：仓内有 Spine 条目，用来钉住「不带包名前缀」这一形态");
  assert.ok(
    fs.existsSync(path.join(UI, spineHolder.items.find((item) => item.type === 9).file)),
    "Spine 文件按原基名落盘，⛔ 若只认包名前缀这一形态，它会被误报",
  );
});

test("解析器对损坏产物必须抛错而不是静默给出空结果", () => {
  assert.throws(() => parsePackageBin(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /不是 FGUI 产物/u);
  const real = new Uint8Array(fs.readFileSync(path.join(UI, `${inputs[0].name}.bin`)));
  const truncated = real.slice(0, 64);
  assert.throws(() => parsePackageBin(truncated), /./u, "截断产物必须抛错");
  const compressed = real.slice();
  compressed[8] = 1; // compressed 标志位
  assert.throws(() => parsePackageBin(compressed), /往返自检只支持未压缩/u);
});
