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
  // FairyGUI 发布会剥离「未导出且无人引用」的资源，这是正确行为。判据若写成数量相等，
  // **本仓当前的真实产物**就会立刻产生一批假阳——下面直接用真实差额把这件事钉住，
  // ⛔ 不再构造一个「只剩已导出条目」的假产物：把 src=/pkg= 引用也纳入不变量 B 之后，
  // 几乎每个条目都是「已导出或被引用」，那种构造已经剥不掉任何东西，前提断言会失败。
  const deltas = inputs
    .map((info) => ({
      name: info.name,
      declared: info.resources.length,
      items: realBins.get(info.name).items.length,
    }))
    .filter((row) => row.declared !== row.items);
  assert.ok(
    deltas.length > 0,
    "构造前提：真产物里必须确实存在合法差额，否则本用例说明不了任何问题",
  );
  assert.deepEqual(
    roundtripProblems(inputs),
    [],
    "存在合法差额的真实产物必须全绿——若判据是「声明数 == 条目数」，这里会报 "
    + `${deltas.length} 个包共 ${deltas.reduce((n, r) => n + Math.abs(r.declared - r.items), 0)} 处假阳：`
    + deltas.map((r) => `${r.name}(${r.declared}≠${r.items})`).join("、"),
  );
});

test("A'：条目存在但 exported/type/name 与 package.xml 对不上必须被命中", () => {
  // ⛔ 只比 id 集合会放过「资源还在、但导出成了另一个东西」这一类。
  const pick = (predicate) => {
    for (const info of inputs) {
      const bin = realBins.get(info.name);
      const resource = info.resources.find((r) => bin.items.some((i) => i.id === r.id && predicate(r, i)));
      if (resource) return { info, resource };
    }
    return null;
  };

  // ① 丢掉 exported 标志：资源仍在产物里，却再也无法被 ui:// 寻址
  const exported = pick((r) => r.exported);
  assert.ok(exported, "构造前提：必须存在已导出资源");
  {
    const bins = clone();
    const item = bins.get(exported.info.name).items.find((i) => i.id === exported.resource.id);
    item.exported = false;
    assert.match(
      withBins(bins).join("\n"),
      /的 exported 标志不一致——package\.xml=true 产物=false：产物里的它无法被 ui:\/\/ 寻址/u,
    );
  }

  // ② 类型变了：运行时会按错误的 PackageItemType 解读同一段字节
  {
    const bins = clone();
    const item = bins.get(exported.info.name).items.find((i) => i.id === exported.resource.id);
    item.typeName = "Sound";
    assert.match(withBins(bins).join("\n"), /的类型不一致——package\.xml 声明 .+，产物是 Sound/u);
  }

  // ③ 名字变了
  {
    const bins = clone();
    const item = bins.get(exported.info.name).items.find((i) => i.id === exported.resource.id);
    item.name = "renamed_by_a_broken_export";
    assert.match(withBins(bins).join("\n"), /的名字不一致——package\.xml=".+" 产物="renamed_by_a_broken_export"/u);
  }

  // ④ ⛔ 不得误伤：带目录的声明（RGBA/img_toggle.png）在产物里是基名，必须仍算一致；
  //    未知 kind 也必须跳过而不是报错——resourceDeclarations 是前向兼容的。
  {
    const bins = clone();
    const patched = inputs.map((info) => info.name !== exported.info.name ? info : {
      ...info,
      resources: info.resources.map((r) => r.id !== exported.resource.id ? r : { ...r, kind: "brand-new-kind" }),
    });
    assert.deepEqual(
      roundtripProblems(patched, { read: (file) => bins.get(path.basename(file, ".bin")) }),
      [],
      "没见过的 kind 必须跳过类型对账，⛔ 不得让整条产线红掉",
    );
  }
});

test("B：目标包漏导了被引用的资源必须被命中——ui:// 与 src=/pkg= 两种拼写都要", () => {
  const all = inputs.flatMap((info) => info.uiReferences);
  const uiForm = all.find((reference) => String(reference.form ?? "").startsWith("ui://"));
  const srcForm = all.find((reference) => String(reference.form ?? "").startsWith("<"));
  assert.ok(uiForm && srcForm, "构造前提：源里两种拼写都必须真实存在");
  // src= 是 FairyGUI 主要的拼写：本仓 53 处 src= 对 38 处 ui://。⛔ 只查 ui:// 会让一批
  // 「被引用但未导出」的资源同时逃过 A 与 B。
  assert.ok(
    all.filter((r) => String(r.form ?? "").startsWith("<")).length
      > all.filter((r) => String(r.form ?? "").startsWith("ui://")).length,
    "src= 引用数必须多于 ui://，否则本用例的前提描述已经过时",
  );

  for (const reference of [uiForm, srcForm]) {
    const bins = clone();
    const target = [...bins.values()].find((bin) => bin.id === reference.packageId);
    target.items = target.items.filter((item) => item.id !== reference.resourceId);
    assert.match(
      withBins(bins).join("\n"),
      new RegExp(`的目标资源 ${reference.resourceId} 不在 ${target.name}\\.bin 里`, "u"),
      `${reference.form} 这种拼写的引用被漏导时必须被命中`,
    );
  }
});

/**
 * 「被引用但未导出」的资源：A 因 `exported !== true` 跳过，只有 B 能守住它。
 * 这正是审计发现的那个洞——18 个这样的资源此前完全无人守。
 */
test("B：被引用但未导出的资源被漏导时必须被命中（A 对它无能为力）", () => {
  const declared = new Map(inputs.map((info) => [info.id, info]));
  const victim = inputs.flatMap((info) => info.uiReferences).find((reference) => {
    const target = declared.get(reference.packageId);
    return target?.resources.some((r) => r.id === reference.resourceId && !r.exported);
  });
  assert.ok(victim, "构造前提：仓里必须真的存在「被引用但未导出」的资源");
  const bins = clone();
  const target = [...bins.values()].find((bin) => bin.id === victim.packageId);
  target.items = target.items.filter((item) => item.id !== victim.resourceId);
  const problems = withBins(bins);
  // 同一个资源可能被多份 XML 引用（e6t9d 就被 AreaItem.xml 与 AreaMyItem.xml 各引一次），
  // 所以条数是引用处数而不是 1；关键是**每一条**都指向该资源，⛔ 不得混进 A 的报错
  // ——A 对未导出资源无能为力，正是本用例要证明的那一点。
  assert.ok(problems.length >= 1, "未导出资源被漏导必须被命中");
  for (const problem of problems) {
    assert.match(problem, new RegExp(`的目标资源 ${victim.resourceId} 不在`, "u"));
  }
});

test("D'：package.xml 用 require= 声明的伴生文件未落盘必须被命中", () => {
  // Spine 的 .bin 只记 .skel，伴生的 .atlas.txt / .png 既不在条目 file 里也没有 exported，
  // 所以 A 和 D 都看不见它们——漏导的后果是骨骼加载不出图集与贴图。
  const companions = inputs.flatMap((info) => info.requiredCompanions ?? []);
  assert.ok(companions.length > 0, "构造前提：仓里必须真的有 require= 声明");
  const holder = inputs.find((info) => (info.requiredCompanions ?? []).length > 0);
  const missing = { ...holder, requiredCompanions: [
    ...holder.requiredCompanions,
    { ownerId: "x", ownerName: "ghost.skel", id: "gone", name: "ghost.atlas.txt" },
  ] };
  const problems = roundtripProblems(
    inputs.map((info) => info.name === holder.name ? missing : info),
    { uiDir: UI },
  );
  assert.equal(problems.length, 1, `应且只应报缺失的那一个：${problems.join(" | ")}`);
  assert.match(problems[0], /ghost\.skel 用 require= 声明的伴生文件 ghost\.atlas\.txt 未落盘/u);
  // 真实的两个伴生文件必须仍算落盘，⛔ 否则上面的命中可能只是因为闸恒报
  assert.deepEqual(roundtripProblems(inputs, { uiDir: UI }), []);
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
