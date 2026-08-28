"use client";

import {
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

const repositoryUrl = "https://github.com/KimiChen/gameStarterKit";
const cloneCommand = "git clone https://github.com/KimiChen/gameStarterKit.git";

const architecture = [
  {
    id: "client",
    eyebrow: "CLIENT",
    label: "客户端",
    title: "引擎壳与游戏代码分离",
    description:
      "Cocos 负责承载运行时，纯 TS 游戏代码保留为唯一真源。核心逻辑子集可无头验证，视图层专注 FairyGUI 与引擎交互。",
    tree: [
      ["apps/client/src/logic", "玩法与页面行为"],
      ["apps/client/src/view", "FairyGUI 视图"],
      ["apps/client/src/net", "HTTP / Colyseus"],
      ["apps/Cocos", "Creator 3.8.8 工程壳"],
    ],
    chips: ["Cocos Creator 3.8.8", "FairyGUI", "bitECS 0.4"],
  },
  {
    id: "shared",
    eyebrow: "SHARED",
    label: "共享层",
    title: "协议、公式、错误码只写一次",
    description:
      "零依赖纯 TypeScript 同时服务客户端与服务端。消息名、RPC 类型、状态镜像和玩法公式从同一份契约出发。",
    tree: [
      ["protocol/lobbyRpc", "类型安全 ws-RPC"],
      ["protocol/state", "Schema 纯接口镜像"],
      ["logic", "双端同源玩法公式"],
      ["constants", "版本与错误码"],
    ],
    chips: ["零 npm 依赖", "ES2017", "单一真源"],
  },
  {
    id: "server",
    eyebrow: "SERVER",
    label: "服务端",
    title: "从 Demo 起步，沿开发期边界迭代",
    description:
      "Colyseus 0.17 游戏服配合双 Redis、MySQL 8、outbox、结算示例与可测试的代码边界。重计算与网关线程边界明确。",
    tree: [
      ["websocket", "类型安全 RPC 端点"],
      ["rooms", "实时状态同步"],
      ["core/compute", "worker 计算池"],
      ["core/economy", "outbox 与结算"],
    ],
    chips: ["Colyseus 0.17", "Node ≥ 22", "Redis × 2 + MySQL 8"],
  },
  {
    id: "platform",
    eyebrow: "BOUNDARY",
    label: "平台边界",
    title: "账号与游戏域，物理拆分",
    description:
      "账号门户独立为 gono-webplatform。本仓只消费精确锁定的 HTTP 开发契约，客户端与游戏服通过明确边界协作。",
    tree: [
      ["Public HTTP", "登录与选服"],
      ["Internal HTTP", "游戏服验票"],
      ["contract package", "精确版本锁定"],
    ],
    chips: ["HTTP-only", "独立账号库", "契约包同步"],
  },
] as const;

const principles = [
  {
    index: "01",
    tag: "ONE SOURCE",
    title: "双端契约，单一真源",
    body: "协议类型、消息名、公式与错误码都在 shared 定义。服务端权威计算，客户端预表现使用同一套逻辑。",
  },
  {
    index: "02",
    tag: "ENGINE READY",
    title: "逻辑与引擎接缝分层",
    body: "纯 TS 真源与 Cocos 工程壳解耦，核心 logic/shared 可在 TypeScript 环境验证。apps/Unity 仍是研究占位，不提供可用 Unity 工程或跨语言生成链。",
  },
  {
    index: "03",
    tag: "GUARDRAILS",
    title: "约定交给机器守",
    body: "已纳入范围的类型检查、协议指纹、目录纯度、镜像新鲜度和依赖字节锁，让隐蔽漂移尽量在提交前被抓住。",
  },
  {
    index: "04",
    tag: "DEVELOPMENT PATH",
    title: "为持续开发留出清晰边界",
    body: "认证、选服、实时房间、档案、经济与结算职责清晰；Demo 可替换，开发期演进路线不需要推倒重来。",
  },
];

const workflow = [
  ["契约先行", "在 shared 定义消息、类型、公式与错误码。"],
  ["同步镜像", "一条命令同步 shared → client → Cocos。"],
  ["双端实现", "按固定目录新增服务端端点与客户端逻辑。"],
  ["规则登记", "Key、配置、错误码进入明确的契约表。"],
  ["分层验证", "typecheck、单测与同步校验按各自覆盖范围共同守门。"],
];

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeArchitecture, setActiveArchitecture] = useState("shared");
  const [copyState, setCopyState] = useState("复制");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const current =
      document.documentElement.dataset.theme === "light" ? "light" : "dark";
    // The layout script selects the theme before hydration; mirror that value once for the toggle UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("gono-theme", next);
    setTheme(next);
  };

  const copyCloneCommand = async () => {
    try {
      await navigator.clipboard.writeText(cloneCommand);
      setCopyState("已复制");
    } catch {
      setCopyState("请手动复制");
    }
    window.setTimeout(() => setCopyState("复制"), 1800);
  };

  const scrollToSection = (
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = document.getElementById(sectionId);
    if (!target) return;

    event.preventDefault();
    setMenuOpen(false);

    const root = document.documentElement;
    root.classList.add("wsk-scroll-instant");
    target.scrollIntoView({ block: "start" });
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    window.requestAnimationFrame(() => {
      root.classList.remove("wsk-scroll-instant");
    });
  };

  const handleTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % architecture.length;
    if (event.key === "ArrowLeft") {
      next = (index - 1 + architecture.length) % architecture.length;
    }
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = architecture.length - 1;
    setActiveArchitecture(architecture[next].id);
    tabRefs.current[next]?.focus();
  };

  const active =
    architecture.find((item) => item.id === activeArchitecture) ??
    architecture[1];

  return (
    <>
      <a className="wsk-skip-link" href="#main-content">
        跳到主要内容
      </a>

      <header className="wsk-topbar">
        <a
          className="wsk-brand"
          href="#top"
          aria-label="gameStarterKit 首页"
          onClick={(event) => scrollToSection(event, "top")}
        >
          <span className="wsk-brand-mark" aria-hidden="true">
            G
          </span>
          <span className="wsk-brand-copy">
            <strong>gameStarterKit</strong>
            <small>GAME DEVELOPMENT MONOREPO</small>
          </span>
        </a>

        <nav
          id="main-navigation"
          className={`wsk-nav ${menuOpen ? "wsk-is-open" : ""}`}
          aria-label="主导航"
        >
          <a
            href="#architecture"
            onClick={(event) => scrollToSection(event, "architecture")}
          >
            架构
          </a>
          <a
            href="#guardrails"
            onClick={(event) => scrollToSection(event, "guardrails")}
          >
            工程约束
          </a>
          <a
            href="#workflow"
            onClick={(event) => scrollToSection(event, "workflow")}
          >
            开发动线
          </a>
          <a
            href="#demo"
            onClick={(event) => scrollToSection(event, "demo")}
          >
            实现 Demo
          </a>
        </nav>

        <div className="wsk-top-actions">
          <button
            className="wsk-icon-button"
            type="button"
            data-theme-toggle
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          >
            <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
          </button>
          <a
            className="wsk-button wsk-button-small wsk-top-cta"
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          <button
            className="wsk-menu-button"
            type="button"
            data-menu-toggle
            aria-label={menuOpen ? "关闭导航" : "打开导航"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="wsk-hero" id="top">
          <div className="wsk-grid-lines" aria-hidden="true" />
          <div className="wsk-hero-copy">
            <p className="wsk-kicker">
              <span className="wsk-status-dot" />
              SOURCE AVAILABLE · DEVELOPMENT BASELINE
            </p>
            <h1>
              把第一天的工程纪律，
              <br />
              留给每一次玩法迭代。
            </h1>
            <p className="wsk-hero-lead">
              一个代码公开可审阅的游戏开发期脚手架：
              Cocos Creator、Colyseus 与零依赖共享层，从协议到本地验证站在同一条开发链上。
            </p>
            <div className="wsk-hero-actions">
              <a
                className="wsk-button"
                href={repositoryUrl}
                target="_blank"
                rel="noreferrer"
              >
                查看仓库 <span aria-hidden="true">↗</span>
              </a>
              <a
                className="wsk-button wsk-secondary"
                href="#architecture"
                onClick={(event) => scrollToSection(event, "architecture")}
              >
                查看架构 <span aria-hidden="true">↓</span>
              </a>
            </div>

            <dl className="wsk-hero-metrics" aria-label="项目工程指标">
              <div>
                <dt>03</dt>
                <dd>客户端 / 共享层 / 服务端</dd>
              </div>
              <div>
                <dt>12</dt>
                <dd>工程铁律</dd>
              </div>
              <div>
                <dt>09·</dt>
                <dd>服务端规则可追溯</dd>
              </div>
            </dl>
          </div>

          <aside className="wsk-hero-console" aria-label="工程架构示意">
            <div className="wsk-console-bar">
              <span className="wsk-console-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>shared/protocol/lobbyRpc/user.ts</span>
              <b>TS</b>
            </div>
            <div className="wsk-console-code" aria-hidden="true">
              <span>
                <em>export const</em> userRpc = {"{"}
              </span>
              <span className="wsk-code-indent">
                getProfile: <strong>&quot;user/getProfile&quot;</strong>,
              </span>
              <span className="wsk-code-indent">
                updateProfile: <strong>&quot;user/updateProfile&quot;</strong>,
              </span>
              <span>{"}"} as const;</span>
            </div>

            <div className="wsk-contract-flow">
              <div className="wsk-flow-node">
                <span>01</span>
                <strong>CLIENT</strong>
                <small>Cocos · FairyGUI · bitECS</small>
              </div>
              <div className="wsk-flow-link" aria-hidden="true">
                <i />
                <b>SAME CONTRACT</b>
              </div>
              <div className="wsk-flow-node wsk-is-core">
                <span>02</span>
                <strong>SHARED</strong>
                <small>Protocol · Logic · Errors</small>
              </div>
              <div className="wsk-flow-link" aria-hidden="true">
                <i />
                <b>TYPE SAFE</b>
              </div>
              <div className="wsk-flow-node">
                <span>03</span>
                <strong>SERVER</strong>
                <small>Colyseus · Redis · MySQL</small>
              </div>
            </div>

            <div className="wsk-terminal-line">
              <span aria-hidden="true">$</span>
              <code>npm run typecheck</code>
              <b>CORE SCOPE</b>
            </div>
          </aside>
        </section>

        <section className="wsk-stack-strip" aria-label="核心技术栈">
          <p>LOCKED TOOLCHAIN</p>
          <ul>
            <li>Cocos Creator <b>3.8.8</b></li>
            <li>Colyseus <b>0.17</b></li>
            <li>FairyGUI <b>1.2.2</b></li>
            <li>bitECS <b>0.4</b></li>
            <li>Node <b>≥ 22</b></li>
          </ul>
        </section>

        <section className="wsk-section wsk-principles" id="guardrails">
          <div className="wsk-section-head">
            <div>
              <p className="wsk-kicker">WHY THIS STARTER</p>
              <h2>不是一堆依赖，<br />是一套能被验证的边界。</h2>
            </div>
            <p>
              把最容易在项目后期变成成本的事情——协议漂移、引擎耦合、写路径失控——提前做成目录、类型与机检。
            </p>
          </div>

          <div className="wsk-principle-grid">
            {principles.map((item) => (
              <article className="wsk-principle-card" key={item.index}>
                <div className="wsk-card-top">
                  <span>{item.index}</span>
                  <small>{item.tag}</small>
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="wsk-section wsk-architecture" id="architecture">
          <div className="wsk-section-head">
            <div>
              <p className="wsk-kicker">MONOREPO ARCHITECTURE</p>
              <h2>每一层，只负责一件事。</h2>
            </div>
            <p>
              根层文件是入口与全局真源，子目录按层与业务域展开。日常开发路径稳定，少动区与禁改区也清晰可见。
            </p>
          </div>

          <div className="wsk-architecture-shell">
            <div
              className="wsk-tab-list"
              role="tablist"
              aria-label="架构分层"
            >
              {architecture.map((item, index) => (
                <button
                  key={item.id}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${item.id}`}
                  aria-selected={active.id === item.id}
                  aria-controls={`panel-${item.id}`}
                  tabIndex={active.id === item.id ? 0 : -1}
                  onClick={() => setActiveArchitecture(item.id)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                >
                  <span>0{index + 1}</span>
                  {item.label}
                </button>
              ))}
            </div>

            {architecture.map((item) => (
              <div
                className="wsk-architecture-panel"
                role="tabpanel"
                id={`panel-${item.id}`}
                aria-labelledby={`tab-${item.id}`}
                hidden={active.id !== item.id}
                key={item.id}
              >
                <div className="wsk-architecture-copy">
                  <p className="wsk-panel-eyebrow">{item.eyebrow}</p>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="wsk-chip-row">
                    {item.chips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                </div>
                <div
                  className="wsk-file-tree"
                  aria-label={`${item.label}目录示意`}
                >
                  <div className="wsk-tree-head">
                    <span>game/</span>
                    <small>RESPONSIBILITY MAP</small>
                  </div>
                  {item.tree.map(([path, description], index) => (
                    <div className="wsk-tree-row" key={path}>
                      <span aria-hidden="true">
                        {index === item.tree.length - 1 ? "└" : "├"}─
                      </span>
                      <code>{path}</code>
                      <small>{description}</small>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="wsk-section wsk-guardrail-section">
          <div className="wsk-guardrail-copy">
            <p className="wsk-kicker">MACHINE-CHECKED</p>
            <h2>把“记得这样做”，变成“不这样做就过不了”。</h2>
            <p>
              loader、类型系统、单测与同步校验分别守住已经纳入覆盖的工程契约。当前根 typecheck 不覆盖
              Main.ts、部分 FairyGUI View 和客户端测试源码，其余边界以对应本地检查为准。
            </p>
            <a
              className="wsk-text-link"
              href="#workflow"
              onClick={(event) => scrollToSection(event, "workflow")}
            >
              查看标准开发动线 <span aria-hidden="true">→</span>
            </a>
          </div>

          <div className="wsk-check-list" aria-label="自动化守门清单">
            {[
              ["protocol fingerprint", "协议变更必须显式重钉"],
              ["logic purity", "逻辑层禁止引擎依赖"],
              ["verify:sync", "两级镜像漂移即报错"],
              ["vendor byte lock", "核心库版本与字节锁定"],
              ["RPC loader", "端点集合与契约自动对齐"],
              ["rpc budget", "网关同步计算预算探针"],
            ].map(([name, description]) => (
              <div className="wsk-check-row" key={name}>
                <span aria-hidden="true">✓</span>
                <code>{name}</code>
                <p>{description}</p>
                <small>ENFORCED</small>
              </div>
            ))}
          </div>
        </section>

        <section className="wsk-section wsk-workflow" id="workflow">
          <div className="wsk-section-head">
            <div>
              <p className="wsk-kicker">STANDARD FLOW</p>
              <h2>新功能有固定动线，<br />但不限制你的玩法。</h2>
            </div>
            <p>
              从契约到端点、从逻辑到视图，开发顺序本身就是对双端一致性的保护。
            </p>
          </div>

          <ol className="wsk-workflow-list">
            {workflow.map(([title, description], index) => (
              <li key={title}>
                <span>0{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <b aria-hidden="true">→</b>
              </li>
            ))}
          </ol>

          <div className="wsk-command-card">
            <div>
              <span aria-hidden="true">$</span>
              <code>{cloneCommand}</code>
            </div>
            <button
              type="button"
              data-copy-command={cloneCommand}
              onClick={copyCloneCommand}
            >
              {copyState}
            </button>
          </div>
          <p className="wsk-copy-status" data-copy-status aria-live="polite">
            {copyState === "已复制" ? "克隆命令已复制到剪贴板。" : ""}
          </p>
        </section>

        <section className="wsk-section wsk-demo-section" id="demo">
          <div className="wsk-demo-visual" aria-label="当前 ballMove 实现 Demo 示意">
            <div className="wsk-demo-window">
              <div className="wsk-demo-toolbar">
                <span>IMPLEMENTATION DEMO</span>
                <b>LOCAL PREVIEW</b>
              </div>
              <div className="wsk-demo-stage">
                <div className="wsk-demo-grid-floor" aria-hidden="true" />
                <span className="wsk-demo-label wsk-label-a">PLAYER_01</span>
                <span className="wsk-demo-label wsk-label-b">ROOM / GAME</span>
                <i className="wsk-player-dot" />
                <i className="wsk-target-dot" />
                <i className="wsk-move-line" />
                <div className="wsk-demo-hud">
                  <span>60 FPS</span>
                  <span>STATE SYNC</span>
                  <span>TOUCH MOVE</span>
                </div>
              </div>
            </div>
          </div>

          <div className="wsk-demo-copy">
            <p className="wsk-kicker">REPLACEABLE DEMO</p>
            <h2>它自带 Demo，<br />但不替你决定游戏。</h2>
            <p>
              当前仓库只用小球移动与技能结算跑通真实链路：登录、选服、进大厅、加入房间、状态同步。它是实现样例，不是框架品牌，也不是玩法边界。
            </p>
            <ul>
              <li>
                <span>01</span>
                <div>
                  <strong>真实链最小闭环</strong>
                  <small>Public 登录 → Internal 验票 → Colyseus 房间</small>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>替换 Demo，不动底座</strong>
                  <small>按标准目录新增你的玩法、视图与端点</small>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>当前以 Cocos 为准</strong>
                  <small>shared 保持纯 TypeScript；Unity 仍是研究占位，不是可用接入</small>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section className="wsk-section wsk-faq">
          <div>
            <p className="wsk-kicker">CLEAR BOUNDARIES</p>
            <h2>你拿到的，<br />究竟是什么？</h2>
          </div>
          <div className="wsk-faq-list">
            <details>
              <summary>这是完整游戏模板吗？</summary>
              <p>
                不是。它是面向开发期的工程脚手架，内置最小 Demo 用于验证登录、选服、房间与状态同步链路；真实玩法由你替换。
              </p>
            </details>
            <details>
              <summary>为什么 shared 使用复制同步？</summary>
              <p>
                为了兼容 Cocos 资源刷新与本地预览。服务端直接消费 workspace 源码，客户端通过可校验的两级同步获得普通项目脚本。
              </p>
            </details>
            <details>
              <summary>账号系统也在这个仓库里吗？</summary>
              <p>
                不在。账号门户独立为 gono-webplatform，拥有独立仓库与账号库；游戏仓只消费精确锁定的 HTTP 契约。
              </p>
            </details>
            <details>
              <summary>本地验证覆盖所有源码吗？</summary>
              <p>
                不覆盖。根 typecheck 当前覆盖 shared、server 与客户端核心纯 TS 子集，并检查生成镜像；Main.ts、部分 FairyGUI View、客户端测试和独立 website 需各自验证。
              </p>
            </details>
            <details>
              <summary>它提供生产部署、支付或渠道发行吗？</summary>
              <p>
                不提供。核心只覆盖开发期框架和本地验证；仓库里的托管适配、支付、GM 和渠道接缝只是额外参考，不构成部署、商业化、微信或抖音 SDK 接入、发行或生产运行承诺。
              </p>
            </details>
            <details>
              <summary>这是开源项目吗？</summary>
              <p>
                是。仓库根目录提供 MIT LICENSE；第三方运行时的许可证和来源请查看 THIRD_PARTY_NOTICES.md。
              </p>
            </details>
          </div>
        </section>

        <section className="wsk-final-cta">
          <div className="wsk-final-grid" aria-hidden="true" />
          <p className="wsk-kicker">BUILD ON A SOLID BASE</p>
          <h2>先把底座搭稳，<br />再把时间花在游戏上。</h2>
          <p>
            从本地 Demo 开始，沿已验证的本地开发动线长成你的项目。
          </p>
          <div className="wsk-hero-actions">
            <a
              className="wsk-button"
              href={repositoryUrl}
              target="_blank"
              rel="noreferrer"
            >
              查看 gameStarterKit <span aria-hidden="true">↗</span>
            </a>
            <a
              className="wsk-button wsk-secondary"
              href="#top"
              onClick={(event) => scrollToSection(event, "top")}
            >
              返回顶部 <span aria-hidden="true">↑</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="wsk-footer">
        <div>
          <span className="wsk-brand-mark" aria-hidden="true">
            G
          </span>
          <p>
            <strong>gameStarterKit</strong>
            <small>游戏开发期基础框架</small>
          </p>
        </div>
        <p>Source available · Cocos Creator + Colyseus + TypeScript</p>
        <a href={repositoryUrl} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </footer>
    </>
  );
}
