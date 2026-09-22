/**
 * 协议声明语言 v1（BF1）的合法/非法夹具测试。
 *
 * 判据形态照本仓纪律：每个「必须拒绝」都配一条「必须接受」的同形夹具——只有拒绝测试时，
 * 一个永远抛错的解析器也能全绿。
 *
 * 两条语言闸的证明是**改语言文件本身**（深拷贝 `schema-v1.json` 后改一处再解析），
 * ⛔ 不是去断言解析器里某个常量——那样只能证明解析器自洽，证明不了语言文件承重。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ProtocolSchemaError,
  parseProtocolLanguage,
  parseProtocolSchema,
  type ProtocolDomainDeclaration,
  type ProtocolLanguage,
  type ProtocolTypesDeclaration,
} from "@game/shared/schema/index";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCHEMA_ROOT = path.join(REPOSITORY_ROOT, "apps/shared/schema/protocols");
const LANGUAGE_PATH = path.join(SCHEMA_ROOT, "schema-v1.json");

const rawLanguage: unknown = JSON.parse(readFileSync(LANGUAGE_PATH, "utf8"));
const language = parseProtocolLanguage(rawLanguage);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 语言文件的深拷贝副本；`mutate` 直接改它，用来证明「语言文件真的在决定合法/非法」。 */
function mutatedLanguage(mutate: (raw: any) => void): ProtocolLanguage {
  const raw = clone(rawLanguage) as any;
  mutate(raw);
  return parseProtocolLanguage(raw);
}

/** 最小 income 声明（BF1 退出条件的「最小 income schema 可解析」）。 */
const INCOME_DECLARATION = {
  domain: "income",
  contractVersion: 2,
  errorCodes: [],
  apis: [
    {
      name: "IncomeGetPending",
      route: "income.getPending",
      serviceType: "Base",
      mode: "query",
      ownerModule: "income",
      request: { kind: "object", fields: [] },
      response: {
        kind: "object",
        fields: [
          { name: "level", kind: "integer", min: 0 },
          { name: "intervalSeconds", kind: "integer", min: 1 },
          { name: "perInterval", kind: "integer", min: 0 },
          { name: "offlineSeconds", kind: "integer", min: 0 },
          { name: "offlineCopper", kind: "integer", min: 0 },
          { name: "copper", kind: "integer", min: 0 },
        ],
      },
    },
    {
      name: "IncomeSettleOnline",
      route: "income.settleOnline",
      serviceType: "Base",
      mode: "natural-write",
      ownerModule: "income",
      request: { kind: "object", fields: [] },
      response: {
        kind: "object",
        fields: [
          { name: "copper", kind: "integer", min: 0 },
          { name: "balance", kind: "integer", min: 0 },
        ],
      },
    },
    {
      name: "IncomeClaimOffline",
      route: "income.claimOffline",
      serviceType: "Base",
      mode: "idempotent-write",
      ownerModule: "income",
      request: {
        kind: "object",
        fields: [{ name: "clientReqId", kind: "string", minLength: 1, maxLength: 64 }],
      },
      response: {
        kind: "object",
        fields: [
          { name: "copper", kind: "integer", min: 0 },
          { name: "offlineSeconds", kind: "integer", min: 0 },
          { name: "balance", kind: "integer", min: 0 },
        ],
      },
    },
  ],
};

function parse(input: unknown, commonTypes?: ProtocolTypesDeclaration): ProtocolDomainDeclaration {
  const document = parseProtocolSchema(input, {
    language,
    source: "fixture.json",
    ...(commonTypes === undefined ? {} : { commonTypes }),
  });
  assert.equal(document.kind, "domain");
  return document as ProtocolDomainDeclaration;
}

function expectReject(input: unknown, pattern: RegExp, commonTypes?: ProtocolTypesDeclaration): void {
  assert.throws(
    () =>
      parseProtocolSchema(input, {
        language,
        source: "fixture.json",
        ...(commonTypes === undefined ? {} : { commonTypes }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProtocolSchemaError, `应抛 ProtocolSchemaError，实际：${String(error)}`);
      assert.match(error.message, pattern);
      return true;
    },
  );
}

/** 按索引改一条 API 再解析，便于只动一处。 */
function withApi(index: number, mutate: (api: any) => void): unknown {
  const declaration = clone(INCOME_DECLARATION) as any;
  mutate(declaration.apis[index]);
  return declaration;
}

/** 第 0 条 = query（`income.getPending`）。 */
function withFirstApi(mutate: (api: any) => void): unknown {
  return withApi(0, mutate);
}

/** 第 2 条 = idempotent-write（`income.claimOffline`，请求带 clientReqId）。 */
function withClaimApi(mutate: (api: any) => void): unknown {
  return withApi(2, mutate);
}

test("BF1 语言文件：本身可解析，且字段种类/模式/serviceType 集合齐备", () => {
  assert.equal(language.schemaVersion, 1);
  assert.deepEqual(Object.keys(language.fieldKinds).sort(), [
    "array",
    "boolean",
    "enum",
    "external",
    "integer",
    "json",
    "number",
    "object",
    "record",
    "ref",
    "string",
  ]);
  assert.deepEqual(language.modes, ["query", "natural-write", "idempotent-write"]);
  assert.ok(language.serviceTypes.length > 0);
  assert.ok(language.fieldKinds.object.constraints.includes("fields"));
  assert.deepEqual(language.fieldKinds.array.requires, ["items"]);
  // external 的形状由具名校验器独占产出（见下一条用例），故 from 必填、check 由解析器另行强制。
  assert.deepEqual(language.fieldKinds.external.requires, ["from"]);
  assert.ok(language.fieldKinds.external.constraints.includes("check"));
});

test("BF1 合法：最小 income 声明可解析，缺省值补齐、声明序保留", () => {
  const document = parse(clone(INCOME_DECLARATION));

  assert.equal(document.domain, "income");
  assert.equal(document.contractVersion, 2);
  // 缺省：errorCodes / pushes / ownsOperationGroups / exposesOperationGroupTo
  assert.deepEqual(document.errorCodes, []);
  assert.deepEqual(document.pushes, []);
  assert.deepEqual(document.ownsOperationGroups, []);
  assert.deepEqual(document.exposesOperationGroupTo, {});
  assert.equal(document.types.size, 0);

  assert.deepEqual(
    document.apis.map((api) => api.route),
    ["income.getPending", "income.settleOnline", "income.claimOffline"],
  );
  const claim = document.apis[2];
  assert.equal(claim.name, "IncomeClaimOffline");
  assert.equal(claim.mode, "idempotent-write");
  assert.equal(claim.ownerModule, "income");
  assert.equal(claim.serviceType, "Base");

  // API 级 contractVersion 缺省为语言 defaults.contractVersion
  assert.equal(document.apis[0].contractVersion, language.defaults.contractVersion);
  // 空 object = emptyPayload 的等价形态
  assert.deepEqual(document.apis[0].request.fields, []);
  // 声明序即字段序（生成物稳定性依赖它）
  assert.deepEqual(
    document.apis[0].response.fields?.map((field) => field.name),
    ["level", "intervalSeconds", "perInterval", "offlineSeconds", "offlineCopper", "copper"],
  );
  // required 缺省为 true
  assert.equal(document.apis[0].response.fields?.[0].required, true);
  assert.equal(document.apis[0].response.fields?.[0].type.min, 0);
});

test("BF1 非法：删掉 apiRequired 里的字段 ⇒ 拒绝", () => {
  expectReject(withFirstApi((api) => delete api.response), /缺少必填键 `response`/);
  expectReject(withFirstApi((api) => delete api.name), /缺少必填键 `name`/);
});

test("BF1 非法：错类型（未知字段种类 / 非整数的范围值）⇒ 拒绝", () => {
  expectReject(
    withFirstApi((api) => {
      api.response.fields[0].kind = "int";
    }),
    /未知字段种类 `int`/,
  );
  expectReject(
    withFirstApi((api) => {
      api.response.fields[0].min = 0.5;
    }),
    /必须是安全整数/,
  );
  expectReject(
    withFirstApi((api) => {
      api.response.fields[0].min = "0";
    }),
    /必须是安全整数/,
  );
});

test("BF1 非法：重复路由 / 重复 API 名 / 重复字段名 ⇒ 拒绝", () => {
  const duplicatedRoute = clone(INCOME_DECLARATION) as any;
  duplicatedRoute.apis[1].route = duplicatedRoute.apis[0].route;
  expectReject(duplicatedRoute, /路由 `income\.getPending` 重复/);

  const duplicatedName = clone(INCOME_DECLARATION) as any;
  duplicatedName.apis[1].name = duplicatedName.apis[0].name;
  expectReject(duplicatedName, /API 名 `IncomeGetPending` 重复/);

  expectReject(
    withFirstApi((api) => {
      api.response.fields[1].name = api.response.fields[0].name;
    }),
    /字段名 `level` 重复/,
  );
});

test("BF1 非法：未知引用 / 环引用 ⇒ 拒绝", () => {
  expectReject(
    withFirstApi((api) => {
      api.response.fields[0] = { name: "extra", kind: "ref", ref: "NotDeclared" };
    }),
    /引用不存在的类型 `NotDeclared`/,
  );

  const cyclic = clone(INCOME_DECLARATION) as any;
  cyclic.types = {
    A: { kind: "object", fields: [{ name: "b", kind: "ref", ref: "B" }] },
    B: { kind: "object", fields: [{ name: "a", kind: "ref", ref: "A" }] },
  };
  expectReject(cyclic, /形成环引用/);
});

test("BF1 非法：未知键（含 typo）⇒ 拒绝，且点名允许的键", () => {
  expectReject(withFirstApi((api) => { api.respones = api.response; }), /未知键 `respones`/);
  expectReject(
    withFirstApi((api) => {
      api.response.fields[0].lenght = 4;
    }),
    /未知键 `lenght`/,
  );
});

test("BF1 非法：某种类不接受的约束键（boolean+min / object+maxItems）⇒ 拒绝", () => {
  expectReject(
    withFirstApi((api) => {
      api.response.fields[0] = { name: "flag", kind: "boolean", min: 0 };
    }),
    /未知键 `min`/,
  );
  expectReject(
    withFirstApi((api) => {
      api.response.fields[0] = { name: "nested", kind: "object", fields: [], maxItems: 2 };
    }),
    /未知键 `maxItems`/,
  );
});

test("BF1 非法：范围自相矛盾（min>max / maxLength 超上限）⇒ 拒绝", () => {
  expectReject(
    withFirstApi((api) => {
      api.response.fields[0].min = 10;
      api.response.fields[0].max = 1;
    }),
    /min 10 大于 max 1/,
  );
  expectReject(
    withClaimApi((api) => {
      api.request.fields[0].maxLength = language.limits.maxStringLength + 1;
    }),
    /超过上限/,
  );
});

test("BF1 非法：idempotent-write 的 clientReqId 缺失/可选/类型不对 ⇒ 拒绝", () => {
  expectReject(
    withClaimApi((api) => {
      api.request = { kind: "object", fields: [] };
    }),
    /必须声明 `clientReqId` 字段/,
  );
  expectReject(
    withClaimApi((api) => {
      api.request.fields[0].required = false;
    }),
    /`clientReqId` 必须是必选字段/,
  );
  expectReject(
    withClaimApi((api) => {
      api.request.fields[0] = { name: "clientReqId", kind: "integer", min: 1 };
    }),
    /`clientReqId` 必须是 string/,
  );
});

test("BF1 非法：request/response/push.data 必须是 object（wire 载荷恒为普通记录）⇒ 拒绝", () => {
  expectReject(
    withFirstApi((api) => {
      api.request = { kind: "json" };
    }),
    /必须是 `object`/,
  );
  expectReject(
    withFirstApi((api) => {
      api.response = { kind: "array", items: { kind: "integer" } };
    }),
    /必须是 `object`/,
  );
});

test("BF1 非法：模式与元数据不自洽（operationGroup/inspectable/inspectsOperationGroup）⇒ 拒绝", () => {
  expectReject(
    withFirstApi((api) => {
      api.operationGroup = "incomeClaim";
    }),
    /`operationGroup` 只能出现在 idempotent-write/,
  );
  expectReject(
    withFirstApi((api) => {
      api.inspectable = true;
    }),
    /`inspectable` 只能出现在 idempotent-write/,
  );
  expectReject(
    withClaimApi((api) => {
      api.inspectsOperationGroup = "shopPurchase";
    }),
    /`inspectsOperationGroup` 只能出现在 query/,
  );
  expectReject(
    withClaimApi((api) => {
      api.inspectable = true;
    }),
    /`inspectable` 必须同时声明 `operationGroup`/,
  );
  // 同形合法夹具：idempotent-write 同时声明 group + inspectable 必须被接受
  const document = parse(
    withClaimApi((api) => {
      api.operationGroup = "incomeClaim";
      api.inspectable = true;
    }),
  );
  assert.equal(document.apis[2].operationGroup, "incomeClaim");
  assert.equal(document.apis[2].inspectable, true);
});

test("BF1 非法：未知 serviceType / 未知执行模式 / 非法路由与标识符形态 ⇒ 拒绝", () => {
  expectReject(withFirstApi((api) => { api.serviceType = "Lobby"; }), /未知 serviceType `Lobby`/);
  expectReject(withFirstApi((api) => { api.mode = "write"; }), /未知执行模式 `write`/);
  expectReject(withFirstApi((api) => { api.route = "Income.GetPending"; }), /路由 `Income\.GetPending` 不匹配/);
  expectReject(withFirstApi((api) => { api.ownerModule = "income-module"; }), /ownerModule `income-module` 不匹配/);
  expectReject(withFirstApi((api) => { api.name = "Income.GetPending"; }), /API 名 `Income\.GetPending` 不匹配/);
});

test("BF1 合法：数组 / 记录 / 枚举 / 嵌套对象 / 引用 / json 全部可解析", () => {
  const declaration = clone(INCOME_DECLARATION) as any;
  declaration.types = {
    RewardEntry: {
      kind: "object",
      fields: [
        { name: "itemId", kind: "string", minLength: 1, maxLength: 64 },
        { name: "count", kind: "integer", min: 1, max: 9999 },
      ],
    },
  };
  declaration.pushes = [
    {
      key: "IncomePending",
      type: "income.pending",
      data: { kind: "object", fields: [{ name: "copper", kind: "integer", min: 0 }] },
    },
  ];
  declaration.apis[0].response = {
    kind: "object",
    fields: [
      { name: "rewards", kind: "array", items: { kind: "ref", ref: "RewardEntry" }, maxItems: 64 },
      { name: "fragmentBalances", kind: "record", values: { kind: "integer", min: 0 } },
      { name: "reason", kind: "enum", members: ["banned", "replaced", "revoked"], enumCode: "INCOME_REASON" },
      { name: "meta", kind: "object", fields: [{ name: "at", kind: "integer", min: 0 }] },
      { name: "raw", kind: "json", required: false },
      { name: "rate", kind: "number", min: 0, max: 1 },
    ],
  };

  const document = parse(declaration);
  const fields = document.apis[0].response.fields ?? [];
  assert.deepEqual(
    fields.map((field) => field.type.kind),
    ["array", "record", "enum", "object", "json", "number"],
  );
  assert.equal(fields[0].type.items?.kind, "ref");
  assert.equal(fields[0].type.items?.ref, "RewardEntry");
  assert.equal(fields[1].type.values?.kind, "integer");
  assert.deepEqual(fields[2].type.members, ["banned", "replaced", "revoked"]);
  assert.equal(fields[3].type.fields?.[0].name, "at");
  assert.equal(fields[4].required, false);
  assert.equal(document.types.get("RewardEntry")?.fields?.length, 2);
  assert.equal(document.pushes[0].type, "income.pending");
});

test("BF1 非法：枚举成员重复 / 空数组 / 非法成员类型 ⇒ 拒绝", () => {
  const base = () => {
    const declaration = clone(INCOME_DECLARATION) as any;
    declaration.apis[0].response.fields[0] = {
      name: "reason",
      kind: "enum",
      members: ["a", "b"],
      enumCode: "INCOME_REASON",
    };
    return declaration;
  };
  const duplicated = base();
  duplicated.apis[0].response.fields[0].members = ["a", "a"];
  expectReject(duplicated, /enum 成员 `a` 重复/);

  const empty = base();
  empty.apis[0].response.fields[0].members = [];
  expectReject(empty, /enum 成员必须是非空数组/);

  const badMember = base();
  badMember.apis[0].response.fields[0].members = [{ a: 1 }];
  expectReject(badMember, /enum 成员只能是字符串 \/ 数字 \/ 布尔/);
});

test("BF1 非法：越限（数组长度 / 字段数 / API 数）⇒ 拒绝", () => {
  expectReject(
    withFirstApi((api) => {
      api.response.fields[0] = {
        name: "items",
        kind: "array",
        items: { kind: "integer" },
        maxItems: language.limits.maxArrayItems + 1,
      };
    }),
    /超过上限/,
  );

  const tooManyApis = clone(INCOME_DECLARATION) as any;
  tooManyApis.apis = new Array(language.limits.maxApisPerDomain + 1).fill(INCOME_DECLARATION.apis[0]);
  expectReject(tooManyApis, /API 数 .* 超过上限/);
});

test("BF1 合法/非法：common/types.json 的类型可被域声明引用，同名冲突被拒", () => {
  const common = parseProtocolSchema(
    {
      types: {
        SharedReward: {
          kind: "object",
          fields: [{ name: "copper", kind: "integer", min: 0 }],
        },
      },
    },
    { language, source: "common/types.json" },
  ) as ProtocolTypesDeclaration;
  assert.equal(common.kind, "types");
  assert.equal(common.types.get("SharedReward")?.fields?.length, 1);

  const declaration = clone(INCOME_DECLARATION) as any;
  declaration.apis[0].response.fields[0] = { name: "reward", kind: "ref", ref: "SharedReward" };
  const document = parse(declaration, common);
  assert.equal(document.apis[0].response.fields?.[0].type.ref, "SharedReward");

  const conflicting = clone(declaration) as any;
  conflicting.types = { SharedReward: { kind: "object", fields: [] } };
  expectReject(conflicting, /与本文件外的同名类型冲突/, common);

  const unknown = clone(declaration) as any;
  unknown.apis[0].response.fields[0] = { name: "reward", kind: "ref", ref: "NotInCommon" };
  expectReject(unknown, /引用不存在的类型 `NotInCommon`/, common);
});

test("BF1 语言闸：从 fieldKinds 删掉一种种类 ⇒ 用到它的声明被拒（语言文件承重）", () => {
  const narrowed = mutatedLanguage((raw) => {
    delete raw.fieldKinds.json;
  });
  const declaration = clone(INCOME_DECLARATION) as any;
  declaration.apis[0].response.fields[0] = { name: "raw", kind: "json" };
  assert.throws(
    () => parseProtocolSchema(declaration, { language: narrowed, source: "fixture.json" }),
    /未知字段种类 `json`/,
  );
  // 同形夹具必须仍可解析：证明拒绝来自被删的种类，而不是解析器整体坏了
  assert.equal(parse(clone(INCOME_DECLARATION)).apis.length, 3);
});

test("BF1 语言闸：从某种类的 constraints 删掉一个键 ⇒ 用到它的声明被拒（语言文件承重）", () => {
  const narrowed = mutatedLanguage((raw) => {
    raw.fieldKinds.string.constraints = ["minLength"];
  });
  const declaration = clone(INCOME_DECLARATION) as any;
  assert.throws(
    () => parseProtocolSchema(declaration, { language: narrowed, source: "fixture.json" }),
    /未知键 `maxLength`/,
  );
});

test("BF1 实现闸：语言里给某种类加上解析器未实现的约束键 ⇒ 该键仍被拒（⛔ 不静默忽略）", () => {
  const widened = mutatedLanguage((raw) => {
    raw.fieldKinds.string.constraints = ["minLength", "maxLength", "maxItems"];
  });
  const declaration = clone(INCOME_DECLARATION) as any;
  declaration.apis[0].response.fields[0] = {
    name: "tag",
    kind: "string",
    minLength: 1,
    maxItems: 4,
  };
  assert.throws(
    () => parseProtocolSchema(declaration, { language: widened, source: "fixture.json" }),
    /未知键 `maxItems`/,
  );
  // 没用到该键的声明照旧可解析（闸是「按用到的键」判的，不是整份语言作废）
  assert.equal(parse(clone(INCOME_DECLARATION)).apis.length, 3);
});

test("BF1 非法：声明形态判定（缺判定键 / 漏写 domain / 形态外的键）⇒ 拒绝", () => {
  expectReject({}, /无法判定声明形态/);
  expectReject({ hello: 1 }, /无法判定声明形态/);
  // 漏写 domain：`apis` 是 domain 形态的必填键 ⇒ 仍判成 domain，报「缺少必填键 domain」
  // 并提示另一候选形态（⛔ 不该退化成 types 形态后报「未知键 apis」）
  expectReject({ types: {}, apis: [] }, /缺少必填键 `domain`.*也可能是 types 形态/);

  // 带 types 的域声明（两种形态的判定键同时命中）里出现形态外的键 ⇒ 报错要点名另一候选形态
  const extraKey = clone(INCOME_DECLARATION) as any;
  extraKey.types = {};
  extraKey.routes = [];
  expectReject(extraKey, /未知键 `routes`.*也可能是 types 形态/);

  // 纯类型表声明：只允许 types 键（域专有的键出现在这里就是错）
  expectReject({ types: {}, pushes: [] }, /未知键 `pushes`/);
});

test("BF1 合法：纯类型表声明可解析（common/types.json 的形态）", () => {
  const document = parseProtocolSchema(
    {
      types: {
        Copper: { kind: "integer", min: 0 },
        Bundle: { kind: "object", fields: [{ name: "copper", kind: "ref", ref: "Copper" }] },
      },
    },
    { language, source: "common/types.json" },
  );
  assert.equal(document.kind, "types");
  if (document.kind !== "types") return;
  assert.deepEqual(Array.from(document.types.keys()), ["Copper", "Bundle"]);
  assert.equal(document.types.get("Bundle")?.fields?.[0].type.ref, "Copper");
});

test("BF1 非法：语言文件自身写错也必须硬失败（版本 / 未知键 / requires 越界）", () => {
  assert.throws(
    () => parseProtocolLanguage({ ...(rawLanguage as any), schemaVersion: 2 }),
    /不支持的协议声明语言版本 2/,
  );
  assert.throws(
    () => parseProtocolLanguage({ ...(rawLanguage as any), fieldKindz: {} }),
    /未知键 `fieldKindz`/,
  );
  assert.throws(
    () =>
      parseProtocolLanguage(
        clone({
          ...(rawLanguage as any),
          fieldKinds: { ...(rawLanguage as any).fieldKinds, string: { constraints: [], requires: ["min"] } },
        }),
      ),
    /`requires` 里的 `min` 不在 `constraints` 中/,
  );
});
