import { buildCatalog, type CatalogLeaf, type CatalogSection } from "./catalog";
import { componentUsage } from "./component-usage";
import type { ScreenEntry } from "./screens";

/** 目录卡片的预览挂载。卡片画在当前页，不再各开一个 iframe。 */
export interface CatalogPreviewHost {
    show(slot: HTMLElement, item: CatalogLeaf, skin: string, priority?: number): void;
    prioritize(slot: HTMLElement, priority: number): void;
    hide(slot: HTMLElement): void;
}

const PREF_KEY = "uniflex-preview:catalog";
const SHELL_CSS = `
:host{
  --ds-bg:#f5f5f6; --ds-panel:#ffffff; --ds-sunken:#ededf0;
  --ds-border:#e2e2e6; --ds-border-strong:#cdced5;
  --ds-text:#1c1d21; --ds-dim:#666a74; --ds-faint:#a0a3ac;
  --ds-accent:#4654c0; --ds-accent-soft:#eceefb; --ds-danger:#c4353b;
  --ds-shadow:0 10px 32px rgba(15,17,25,.14);
  --ds-sans:system-ui,-apple-system,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;
  --ds-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --ds-top:44px; --ds-side:204px; --canvas:#14161b;
  display:block; min-height:100vh;
  color:var(--ds-text); font:13px/1.45 var(--ds-sans); -webkit-font-smoothing:antialiased;
}
:host([data-theme=dark]){
  --ds-bg:#131416; --ds-panel:#1a1c1f; --ds-sunken:#0f1012;
  --ds-border:#2a2c31; --ds-border-strong:#3c3f47;
  --ds-text:#e6e7ea; --ds-dim:#9397a1; --ds-faint:#5f636d;
  --ds-accent:#909cf2; --ds-accent-soft:#23263c;
  --ds-shadow:0 10px 32px rgba(0,0,0,.5);
}
:host([data-canvas=light]){--canvas:#eef0f3}
:host([data-canvas=dark]){--canvas:#14161b}
:host([data-canvas=checker]){--canvas:repeating-conic-gradient(#d4d6dc 0 25%,#f3f4f6 0 50%) 0 0/16px 16px}
:host([data-canvas=custom]){--canvas:var(--canvas-custom,#2b3a55)}
*{box-sizing:border-box}
[hidden]{display:none!important}
button,input{font:inherit;color:inherit}
button{cursor:pointer}
h1,h2,h3,h4,p{margin:0}
:focus-visible{outline:2px solid var(--ds-accent);outline-offset:1px}
.ic{flex:none;display:block}
.top{position:fixed;top:0;left:0;right:0;z-index:30;height:var(--ds-top);display:flex;align-items:center;gap:4px;padding:0 12px;background:var(--ds-panel);border-bottom:1px solid var(--ds-border)}
.top__brand{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1}
.top__name{font-weight:650;font-size:14px;white-space:nowrap}
.top__ver{font:11px var(--ds-mono);color:var(--ds-faint);white-space:nowrap}
.top__status{font-size:11px;color:var(--ds-faint);white-space:nowrap;margin-right:4px}
.top .top__menu{display:none}
.ib{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;min-width:28px;padding:0 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--ds-dim)}
.ib:hover{background:var(--ds-sunken);color:var(--ds-text)}
.popwrap{position:relative}
.pop{position:absolute;right:0;top:calc(100% + 6px);z-index:40;min-width:200px;padding:5px;background:var(--ds-panel);border:1px solid var(--ds-border);border-radius:8px;box-shadow:var(--ds-shadow)}
.pop__item{display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 9px;border:0;border-radius:5px;background:transparent;text-align:left;font-size:12.5px}
.pop__item:hover{background:var(--ds-sunken)}
.pop__item[aria-checked=true]{color:var(--ds-accent);font-weight:600}
.pop__sep{height:1px;margin:5px 4px;background:var(--ds-border)}
.pop__label{padding:5px 9px 2px;font-size:11px;color:var(--ds-faint)}
.pop__color{margin-left:auto;width:26px;height:18px;padding:0;border:1px solid var(--ds-border-strong);border-radius:4px;background:none}
.chip{width:13px;height:13px;border-radius:3px;border:1px solid var(--ds-border-strong);flex:none}
.side{position:fixed;top:var(--ds-top);bottom:0;left:0;z-index:20;width:var(--ds-side);display:flex;flex-direction:column;background:var(--ds-panel);border-right:1px solid var(--ds-border)}
.side__search{position:relative;padding:8px 8px 4px}
.side__search .ic{position:absolute;left:15px;top:14px;width:13px;height:13px;color:var(--ds-faint);pointer-events:none}
.side__search input{width:100%;height:25px;padding:0 8px 0 25px;border:1px solid var(--ds-border);border-radius:5px;background:var(--ds-bg);font-size:12px}
.side__tree{flex:1;overflow-y:auto;padding:2px 6px 20px;scrollbar-width:thin}
.tree,.tree ul{list-style:none;margin:0;padding:0}
.tree>li{margin-bottom:6px}
.trow{display:flex;align-items:center;border-radius:4px;color:var(--ds-dim)}
.trow:hover{background:var(--ds-sunken);color:var(--ds-text)}
.trow a{flex:1;min-width:0;padding:2px 4px 2px 0;color:inherit;text-decoration:none;font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trow__caret{flex:none;width:16px;height:22px;display:grid;place-items:center;padding:0;border:0;background:none;color:var(--ds-faint)}
.trow__caret .ic{width:8px;height:8px;transition:transform .12s}
.trow__caret[aria-expanded=true] .ic{transform:rotate(90deg)}
.trow__pad{flex:none;width:16px}
.trow__count{flex:none;padding:0 6px;font:10px var(--ds-mono);color:var(--ds-faint)}
.trow.l0 a{font-weight:650;font-size:11px;letter-spacing:.05em;color:var(--ds-text)}
.trow.is-parent{color:var(--ds-text)}
.trow.is-active{background:var(--ds-accent-soft);color:var(--ds-accent)}
.trow.is-active a{font-weight:600;color:inherit}
.tree__empty{padding:12px 8px;color:var(--ds-faint);font-size:12px}
.backdrop{display:none}
@media (min-width:861px){
  .side{background:transparent;border-right-color:transparent;transition:background .15s,border-color .15s}
  .side .side__search,.side .trow__caret,.side .trow__count{opacity:0;transition:opacity .15s}
  .side .trow,.side .trow.l0 a{color:var(--ds-faint);transition:color .15s}
  .side .trow.is-parent{color:var(--ds-dim)}
  .side .trow.is-active{background:var(--ds-sunken);color:var(--ds-text)}
  .side .trow.is-active a{color:inherit}
  .side:hover,.side:focus-within{background:var(--ds-panel);border-right-color:var(--ds-border)}
  .side:is(:hover,:focus-within) :is(.side__search,.trow__caret,.trow__count){opacity:1}
  .side:is(:hover,:focus-within) .trow{color:var(--ds-dim)}
  .side:is(:hover,:focus-within) :is(.trow.is-parent,.trow.l0 a,.trow:hover){color:var(--ds-text)}
  .side:is(:hover,:focus-within) .trow.is-active{background:var(--ds-accent-soft);color:var(--ds-accent)}
}
.main{margin-left:var(--ds-side);padding:calc(var(--ds-top) + 16px) 24px 50vh;min-width:0}
.main__in{max-width:1240px;margin:0 auto}
.view,.group,.card{scroll-margin-top:calc(var(--ds-top) + 12px)}
.view{margin-bottom:36px}
.view>h1{font-size:18px;font-weight:650;padding-bottom:8px;margin-bottom:14px;border-bottom:1px solid var(--ds-border)}
.group{margin-bottom:22px}
.ghead{display:flex;align-items:baseline;gap:8px;min-height:28px;margin-bottom:6px}
.ghead h2{font-size:14px;font-weight:650}
.ghead h3{font-size:12px;font-weight:650;color:var(--ds-dim)}
.ghead__n{font:11px var(--ds-mono);color:var(--ds-faint);font-weight:400}
.sub{margin:0 0 14px;padding-left:10px;border-left:2px solid var(--ds-border)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr));gap:10px}
.cards--components{grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))}
.card{display:flex;flex-direction:column;min-width:0;background:var(--ds-panel);border:1px solid var(--ds-border);border-radius:6px;overflow:hidden}
.card--wide{grid-column:1/-1}
.card__h{display:flex;align-items:center;gap:0 6px;min-height:32px;padding:1px 3px 1px 10px;border-bottom:1px solid var(--ds-border)}
.card__h h4{flex:1;min-width:0;font-size:12.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card__m{font:10.5px var(--ds-mono);color:var(--ds-faint);white-space:nowrap}
.card__h .ib{height:26px;min-width:26px;padding:0 5px}
.codebox{width:min(760px,calc(100vw - 32px));max-height:min(80vh,720px);padding:0;border:1px solid var(--ds-border);border-radius:10px;background:var(--ds-panel);color:var(--ds-text);box-shadow:var(--ds-shadow)}
.codebox[open]{display:flex;flex-direction:column}
.codebox::backdrop{background:rgba(10,12,18,.4)}
.codebox__h{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 14px;border-bottom:1px solid var(--ds-border)}
.codebox__h h2{flex:1;min-width:0;font-size:13px;font-weight:650}
.codebox__note{padding:8px 14px;font-size:12px;color:var(--ds-dim);border-bottom:1px solid var(--ds-border)}
.codebox__b{min-height:0;overflow:auto;background:var(--ds-sunken)}
.code__h{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:2px 8px 2px 14px;background:var(--ds-sunken);border-bottom:1px solid var(--ds-border);font:11px var(--ds-mono);color:var(--ds-faint)}
.codebox pre{margin:0;padding:10px 14px 14px;font:12px/1.55 var(--ds-mono);white-space:pre;tab-size:2}
.stage{position:relative;flex:1;background:var(--canvas)}
.frame{position:relative;width:100%;margin:0 auto;overflow:hidden;background:transparent}
.frame .live{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:auto;font:16px/1.2 sans-serif;color:#000}
.frame iframe{position:absolute;left:0;top:0;width:100%;height:100%;border:0;pointer-events:none;background:transparent}
.ds-canvas{position:relative;flex:1;display:flex;align-items:center;justify-content:center;min-height:120px;padding:18px 14px;background:var(--canvas)}
.ds-canvas .frame{width:min(100%,var(--native,280px));flex:none;background:transparent}
.btn{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border:1px solid var(--ds-border-strong);border-radius:6px;background:var(--ds-panel);font-size:12.5px;white-space:nowrap}
.btn:hover{background:var(--ds-sunken)}
#btnSkin .ic{width:10px;height:10px;transform:rotate(90deg);color:var(--ds-faint)}
.lightbox{position:fixed;inset:0;z-index:70;display:grid;grid-template-rows:auto 1fr;background:rgba(8,9,12,.92);color:#e8e9ec}
.lightbox__h{display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:12.5px}
.lightbox__h b{font-weight:650}
.lightbox__h span{font:11px var(--ds-mono);opacity:.6;flex:1}
.lightbox__h .ib{color:#e8e9ec}
.lightbox__h .ib:hover{background:rgba(255,255,255,.12)}
.lightbox__b{display:grid;place-items:center;min-height:0;overflow:hidden;padding:0 16px 16px}
.lightbox .frame{width:auto;background:transparent}
.lightbox .frame iframe{pointer-events:auto}
@media (max-width:860px){
  .top .top__menu{display:inline-flex}
  .top__status{display:none}
  .side{transform:translateX(-100%);transition:transform .18s;width:min(260px,86vw);box-shadow:var(--ds-shadow);background:var(--ds-panel);border-right-color:var(--ds-border)}
  :host(.side-open) .side{transform:none}
  :host(.side-open) .backdrop{display:block;position:fixed;inset:var(--ds-top) 0 0 0;z-index:19;background:rgba(10,12,18,.4)}
  .main{margin-left:0;padding:calc(var(--ds-top) + 14px) 16px 50vh}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

type CanvasMode = "light" | "dark" | "checker" | "custom";

/** 预览主题。新增皮肤时在这里加一项，并在 themes 里登记同名主题。 */
const PREVIEW_SKINS = [
    { id: "classic", label: "经典" },
    { id: "midnight", label: "午夜" },
    { id: "restored", label: "还原" },
] as const;
type PreviewSkin = (typeof PREVIEW_SKINS)[number]["id"];

function previewSkin(id: string | undefined): PreviewSkin {
    for (const skin of PREVIEW_SKINS) if (skin.id === id) return skin.id;
    return "classic";
}
interface Prefs {
    theme: "light" | "dark" | null;
    canvas: CanvasMode;
    custom: string;
    skin: PreviewSkin;
    collapsed: string[];
}

interface TreeNode {
    readonly id: string;
    readonly label: string;
    readonly count?: number;
    readonly keys?: string;
    readonly children?: readonly TreeNode[];
}

const ICONS: Record<string, string> = {
    menu: '<path d="M2 4h12M2 8h12M2 12h12"/>',
    chevron: '<path d="M6 3l5 5-5 5"/>',
    expand: '<path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9"/>',
    sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
    moon: '<path d="M13 9.5A5.5 5.5 0 016.5 3 5.5 5.5 0 1013 9.5z"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
    x: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
    code: '<path d="M6 4L2.5 8 6 12M10 4l3.5 4-3.5 4"/>',
    bg: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 010 11z" fill="currentColor"/>',
};

function icon(name: string): SVGElement {
    const holder = document.createElement("span");
    holder.innerHTML = `<svg class="ic" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
    return holder.firstElementChild as SVGElement;
}

function $(selector: string, root: ParentNode): HTMLElement {
    const node = root.querySelector(selector);
    if (!node) throw new Error(`Missing catalog node: ${selector}`);
    return node as HTMLElement;
}

function previewSrc(id: string, kind: string, canvas: CanvasMode, custom: string, skin: string): string {
    const query = new URLSearchParams({ embed: "1", canvas });
    if (kind === "component") {
        query.set("ui", "component-specimen");
        query.set("part", id);
        query.set("skin", skin);
    } else query.set("ui", id);
    if (canvas === "custom") query.set("canvasColor", custom);
    return `/?${query.toString()}`;
}

function readPrefs(): Prefs {
    const prefs: Prefs = { theme: null, canvas: "dark", custom: "#2b3a55", skin: "classic", collapsed: [] };
    try {
        const raw = JSON.parse(localStorage.getItem(PREF_KEY) ?? "null") as Partial<Prefs> | null;
        if (!raw || typeof raw !== "object") return prefs;
        if (raw.theme === "light" || raw.theme === "dark") prefs.theme = raw.theme;
        if (raw.canvas === "light" || raw.canvas === "dark" || raw.canvas === "checker" || raw.canvas === "custom") prefs.canvas = raw.canvas;
        if (typeof raw.custom === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.custom)) prefs.custom = raw.custom;
        if (typeof raw.skin === "string") prefs.skin = previewSkin(raw.skin);
        if (Array.isArray(raw.collapsed)) prefs.collapsed = raw.collapsed.filter((item) => typeof item === "string");
    } catch { /* keep defaults */ }
    return prefs;
}

/** 无 screen/ui 参数时的预览目录：侧栏树 + 组件卡片和原稿界面。 */
export function mountPreviewCatalog(screens: readonly ScreenEntry[], preview: CatalogPreviewHost): void {
    const sections = buildCatalog(screens);
    const prefs = readPrefs();
    let query = "";
    let activeId: string | null = null;
    let pinned: string | null = null;
    let spyLock = 0;
    let closeLightbox: (() => void) | null = null;
    let popClose: (() => void) | null = null;

    document.title = "UniFlex UI";
    document.body.classList.add("is-catalog");
    document.body.style.setProperty("--catalog-bg", "#f5f5f6");
    const pageStyle = document.createElement("style");
    pageStyle.textContent = "html:has(body.is-catalog),body.is-catalog{height:auto!important;min-height:100%;overflow:auto!important}body.is-catalog{width:auto!important;background:var(--catalog-bg,#f5f5f6)!important}body.is-catalog #ui{display:none!important}";
    document.head.append(pageStyle);
    const ui = document.getElementById("ui");
    if (ui) ui.style.display = "none";
    let host = document.getElementById("catalog-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "catalog-host";
        document.body.prepend(host);
    }
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${SHELL_CSS}</style>
<header class="top">
  <button class="ib top__menu" id="btnMenu" type="button" aria-label="导航"></button>
  <div class="top__brand"><span class="top__name">UniFlex UI</span><span class="top__ver">预览</span></div>
  <span class="top__status" id="status"></span>
  <div class="popwrap"><button class="ib" id="btnCanvas" type="button" title="画布" aria-label="画布" aria-haspopup="true"></button></div>
  <div class="popwrap"><button class="btn" id="btnSkin" type="button" title="主题" aria-label="主题" aria-haspopup="menu" aria-expanded="false"><span id="skinLabel">经典</span></button></div>
  <button class="ib" id="btnTheme" type="button" title="明暗" aria-label="明暗"></button>
</header>
<aside class="side" id="side" aria-label="导航">
  <div class="side__search"><input id="search" type="search" placeholder="搜索  /" autocomplete="off" aria-label="搜索"></div>
  <nav class="side__tree" id="tree"></nav>
</aside>
<div class="backdrop" id="backdrop"></div>
<main class="main"><div class="main__in" id="main"></div></main>`;
    $("#btnMenu", shadow).append(icon("menu"));
    $("#btnCanvas", shadow).append(icon("bg"));
    $("#btnSkin", shadow).append(icon("chevron"));
    $(".side__search", shadow).prepend(icon("search"));
    const componentCount = sections.reduce((sum, section) => sum + section.groups.reduce((inner, group) => inner + group.items.filter((item) => item.kind === "component").length, 0), 0);
    const screenCount = sections.reduce((sum, section) => sum + section.groups.reduce((inner, group) => inner + group.items.filter((item) => item.kind === "screen").length, 0), 0);
    $("#status", shadow).textContent = `${componentCount} 个组件 · ${screenCount} 个界面`;

    const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore quota */ } };
    const shellBg = () => {
        const bg = (shadow.host as HTMLElement).dataset.theme === "dark" ? "#131416" : "#f5f5f6";
        document.body.style.setProperty("--catalog-bg", bg);
    };
    const applyTheme = (theme: "light" | "dark") => {
        prefs.theme = theme;
        savePrefs();
        (shadow.host as HTMLElement).dataset.theme = theme;
        $("#btnTheme", shadow).replaceChildren(icon(theme === "dark" ? "sun" : "moon"));
        shellBg();
    };
    const syncFrameSrc = () => {
        for (const frame of Array.from(shadow.querySelectorAll<HTMLElement>(".frame[data-id]"))) {
            const id = frame.dataset.id;
            if (!id) continue;
            frame.dataset.src = previewSrc(id, frame.dataset.kind ?? "screen", prefs.canvas, prefs.custom, prefs.skin);
        }
    };
    const applyCanvas = () => {
        const root = shadow.host as HTMLElement;
        root.dataset.canvas = prefs.canvas;
        root.style.setProperty("--canvas-custom", prefs.custom);
        syncFrameSrc();
    };
    const applySkin = () => {
        syncFrameSrc();
        for (const [frame, record] of frames) {
            const { slot, item } = record;
            if (!mounted.has(slot)) continue;
            if (item.kind !== "component" && item.id !== "settings") continue;
            const bounds = frame.getBoundingClientRect();
            const fullscreen = record.host !== record.home;
            if (fullscreen || (bounds.bottom > -240 && bounds.top < innerHeight + 240)) {
                preview.show(slot, item, prefs.skin, fullscreen ? 0 : bounds.bottom > 44 && bounds.top < innerHeight ? 1 : 2);
            } else {
                mounted.delete(slot);
                recent.delete(slot);
                preview.hide(slot);
            }
        }
        schedulePreviews();
        for (const frame of Array.from(shadow.querySelectorAll<HTMLElement>('.frame[data-kind="component"]'))) {
            const iframe = frame.querySelector("iframe");
            if (!iframe?.getAttribute("src") || iframe.dataset.ready !== "1") continue;
            iframe.contentWindow?.postMessage({ type: "uniflex-preview-skin", skin: prefs.skin }, location.origin);
        }
    };

    const treeOf = (list: readonly CatalogSection[]): TreeNode[] => list.map((section) => ({
        id: section.id,
        label: section.label,
        children: section.groups.map((group) => ({
            id: group.id,
            label: group.label,
            count: group.items.length,
            children: group.items.map((item) => ({ id: item.id, label: item.label, keys: `${item.label} ${item.keys}` })),
        })),
    }));
    const hit = (node: TreeNode, q: string) => `${node.label} ${node.keys ?? ""}`.toLowerCase().includes(q);

    const renderSidebar = () => {
        const q = query.trim().toLowerCase();
        const build = (node: TreeNode, level: number, forced: boolean): HTMLLIElement | null => {
            const self = !q || forced || hit(node, q);
            const kids = (node.children ?? []).map((child) => build(child, level + 1, forced || (!!q && hit(node, q)))).filter((child): child is HTMLLIElement => !!child);
            if (!self && kids.length === 0) return null;
            const open = q ? true : !prefs.collapsed.includes(node.id);
            const row = document.createElement("div");
            row.className = `trow l${level}`;
            row.dataset.link = node.id;
            row.style.paddingLeft = `${Math.max(0, level - 1) * 10}px`;
            if (node.children?.length) {
                const caret = document.createElement("button");
                caret.type = "button";
                caret.className = "trow__caret";
                caret.setAttribute("aria-expanded", String(open));
                caret.setAttribute("aria-label", "折叠");
                caret.append(icon("chevron"));
                caret.addEventListener("click", () => {
                    prefs.collapsed = open ? [...prefs.collapsed, node.id] : prefs.collapsed.filter((id) => id !== node.id);
                    savePrefs();
                    renderSidebar();
                });
                row.append(caret);
            } else {
                const pad = document.createElement("span");
                pad.className = "trow__pad";
                row.append(pad);
            }
            const link = document.createElement("a");
            link.href = `#/${node.id}`;
            link.title = node.label;
            link.textContent = node.label;
            const count = document.createElement("span");
            count.className = "trow__count";
            count.textContent = node.children?.length
                ? String(q ? kids.length : (node.count ?? node.children.length))
                : "";
            row.append(link, count);
            const li = document.createElement("li");
            li.append(row);
            if (open && kids.length) {
                const ul = document.createElement("ul");
                ul.append(...kids);
                li.append(ul);
            }
            return li;
        };
        const items = treeOf(sections).map((node) => build(node, 0, false)).filter((node): node is HTMLLIElement => !!node);
        const tree = $("#tree", shadow);
        tree.replaceChildren();
        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "tree__empty";
            empty.textContent = "无匹配";
            tree.append(empty);
        } else {
            const ul = document.createElement("ul");
            ul.className = "tree";
            ul.append(...items);
            tree.append(ul);
        }
        paintActive();
    };

    const paintActive = () => {
        const box = $("#tree", shadow);
        for (const row of Array.from(box.querySelectorAll(".trow.is-active,.trow.is-parent"))) row.classList.remove("is-active", "is-parent");
        const row = activeId ? box.querySelector<HTMLElement>(`.trow[data-link="${CSS.escape(activeId)}"]`) : null;
        if (!row) return;
        row.classList.add("is-active");
        let li = row.parentElement?.parentElement?.closest("li") ?? null;
        while (li) {
            li.firstElementChild?.classList.add("is-parent");
            li = li.parentElement?.closest("li") ?? null;
        }
        const top = row.getBoundingClientRect().top;
        const bottom = row.getBoundingClientRect().bottom;
        const bounds = box.getBoundingClientRect();
        if (top < bounds.top + 8) box.scrollTop -= bounds.top + 8 - top;
        else if (bottom > bounds.bottom - 8) box.scrollTop += bottom - bounds.bottom + 8;
    };

    const matches = (item: CatalogLeaf, scope = "") => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return `${scope} ${item.label} ${item.keys}`.toLowerCase().includes(q);
    };

    const frames = new Map<HTMLElement, { item: CatalogLeaf; slot: HTMLElement; live: HTMLElement; home: HTMLElement; host: HTMLElement }>();
    const mounted = new Map<HTMLElement, CatalogLeaf>();
    const frameSizes: ResizeObserver[] = [];
    const fitLive = (frame: HTMLElement, live: HTMLElement, width: number, height: number) => {
        live.style.width = `${width}px`;
        live.style.height = `${height}px`;
        const slot = live.shadowRoot?.firstElementChild as HTMLElement | undefined;
        if (slot) {
            slot.style.width = `${width}px`;
            slot.style.height = `${height}px`;
        }
        if (frame.clientWidth > 0) {
            live.style.visibility = "visible";
            live.style.transform = `scale(${frame.clientWidth / width})`;
        } else live.style.visibility = "hidden";
    };
    const createLive = (frame: HTMLElement, item: CatalogLeaf): HTMLElement => {
        const live = document.createElement("div");
        live.className = "live";
        const root = live.attachShadow({ mode: "open" });
        const slot = document.createElement("div");
        slot.style.cssText = "position:relative;overflow:hidden;";
        root.append(slot);
        frame.append(live);
        const record = { item, slot, live, home: frame, host: frame };
        const fit = () => fitLive(record.host, record.live, item.width, item.height);
        fit();
        requestAnimationFrame(fit);
        const observer = new ResizeObserver(fit);
        observer.observe(frame);
        frameSizes.push(observer);
        frames.set(frame, record);
        return slot;
    };
    const releaseMounted = () => {
        for (const record of frames.values()) {
            if (!mounted.has(record.slot)) continue;
            mounted.delete(record.slot);
            preview.hide(record.slot);
        }
        frames.clear();
        recent.clear();
        for (const observer of frameSizes.splice(0)) observer.disconnect();
    };

    const openCode = (item: CatalogLeaf, trigger: HTMLButtonElement) => {
        const code = componentUsage[item.id];
        if (!code) return;
        const dialog = document.createElement("dialog");
        dialog.className = "codebox";
        dialog.setAttribute("aria-label", `${item.label} 用法代码`);
        const header = document.createElement("div");
        header.className = "codebox__h";
        const title = document.createElement("h2");
        title.textContent = `${item.label} · 用法代码`;
        const close = document.createElement("button");
        close.type = "button";
        close.className = "ib";
        close.title = "关闭";
        close.setAttribute("aria-label", "关闭代码");
        close.append(icon("x"));
        close.addEventListener("click", () => dialog.close());
        header.append(title, close);
        const note = document.createElement("p");
        note.className = "codebox__note";
        note.textContent = "UniFlex TSX 用法示例。theme、skin、状态和回调由所在页面提供；完整配置见 ComponentSpecimen.tsx。";
        const body = document.createElement("div");
        body.className = "codebox__b";
        const bar = document.createElement("div");
        bar.className = "code__h";
        bar.append(document.createTextNode("TSX"));
        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "ib";
        copy.textContent = "复制代码";
        copy.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(code);
                copy.textContent = "已复制";
            } catch {
                copy.textContent = "复制失败";
            }
        });
        bar.append(copy);
        const pre = document.createElement("pre");
        pre.textContent = code;
        body.append(bar, pre);
        dialog.append(header, note, body);
        dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener("close", () => { dialog.remove(); trigger.focus(); }, { once: true });
        shadow.append(dialog);
        dialog.showModal();
        close.focus();
    };

    const cardOf = (item: CatalogLeaf): HTMLElement => {
        const article = document.createElement("article");
        article.className = "card" + (item.wide ? " card--wide" : "");
        article.id = `sec-${item.id}`;
        article.dataset.spy = item.id;
        const header = document.createElement("header");
        header.className = "card__h";
        const title = document.createElement("h4");
        title.title = item.label;
        title.textContent = item.label;
        const open = document.createElement("button");
        open.type = "button";
        open.className = "ib";
        open.title = "全屏";
        open.setAttribute("aria-label", `全屏 ${item.label}`);
        open.append(icon("expand"));
        open.addEventListener("click", () => openLightbox(item));
        header.append(title);
        if (item.kind === "screen") {
            const meta = document.createElement("span");
            meta.className = "card__m";
            meta.textContent = `${item.width}×${item.height}`;
            header.append(meta);
        } else if (componentUsage[item.id]) {
            const code = document.createElement("button");
            code.type = "button";
            code.className = "ib";
            code.title = "查看用法代码";
            code.setAttribute("aria-label", `查看${item.label}用法代码`);
            code.append(icon("code"));
            code.addEventListener("click", () => openCode(item, code));
            header.append(code);
        }
        header.append(open);
        const frame = document.createElement("div");
        frame.className = "frame";
        frame.dataset.preview = "";
        frame.dataset.src = previewSrc(item.id, item.kind, prefs.canvas, prefs.custom, prefs.skin);
        frame.dataset.id = item.id;
        frame.dataset.kind = item.kind;
        frame.style.aspectRatio = `${item.width}/${item.height}`;
        if (item.kind === "component") frame.style.setProperty("--native", `${item.width}px`);
        createLive(frame, item);
        if (item.kind === "component") {
            const canvas = document.createElement("div");
            canvas.className = "ds-canvas";
            canvas.append(frame);
            article.append(header, canvas);
        } else {
            const stage = document.createElement("div");
            stage.className = "stage";
            stage.append(frame);
            article.append(header, stage);
        }
        frameObserver.observe(frame);
        return article;
    };

    // Keep a small recent history for back-scrolling; queued offscreen work is never retained.
    const recent = new Map<HTMLElement, number>();
    let useOrder = 0;
    let previewRaf = 0;
    const refreshPreviews = () => {
        previewRaf = 0;
        const retained: HTMLElement[] = [];
        for (const [frame, record] of frames) {
            const bounds = frame.getBoundingClientRect();
            const fullscreen = record.host !== record.home;
            const visible = bounds.bottom > 44 && bounds.top < innerHeight;
            const nearby = bounds.bottom > -240 && bounds.top < innerHeight + 240;
            if (fullscreen || nearby) {
                const priority = fullscreen ? 0 : visible ? 1 : 2;
                recent.set(record.slot, ++useOrder);
                if (!mounted.has(record.slot)) {
                    mounted.set(record.slot, record.item);
                    preview.show(record.slot, record.item, prefs.skin, priority);
                } else preview.prioritize(record.slot, priority);
            } else if (mounted.has(record.slot)) {
                if (record.slot.dataset.previewState === "ready") retained.push(record.slot);
                else {
                    mounted.delete(record.slot);
                    recent.delete(record.slot);
                    preview.hide(record.slot);
                }
            }
        }
        retained.sort((a, b) => (recent.get(b) ?? 0) - (recent.get(a) ?? 0));
        for (const slot of retained.slice(12)) {
            mounted.delete(slot);
            recent.delete(slot);
            preview.hide(slot);
        }
    };
    const schedulePreviews = () => {
        if (!previewRaf) previewRaf = requestAnimationFrame(refreshPreviews);
    };
    const frameObserver = new IntersectionObserver(schedulePreviews, { rootMargin: "240px" });
    window.addEventListener("resize", schedulePreviews);

    const renderMain = () => {
        closeLightbox?.();
        releaseMounted();
        frameObserver.disconnect();
        const main = $("#main", shadow);
        main.replaceChildren();
        for (const section of sections) {
            const visible = section.groups.some((group) => group.items.some((item) => matches(item, `${section.label} ${group.label}`)));
            if (!visible) continue;
            const view = document.createElement("section");
            view.className = "view";
            view.id = `sec-${section.id}`;
            view.dataset.spy = section.id;
            const heading = document.createElement("h1");
            heading.textContent = section.label;
            view.append(heading);
            for (const group of section.groups) {
                const items = group.items.filter((item) => matches(item, `${section.label} ${group.label}`));
                if (!items.length) continue;
                const block = document.createElement("section");
                block.className = "group";
                block.id = `sec-${group.id}`;
                block.dataset.spy = group.id;
                const ghead = document.createElement("div");
                ghead.className = "ghead";
                const h2 = document.createElement("h2");
                h2.textContent = group.label;
                const n = document.createElement("span");
                n.className = "ghead__n";
                n.textContent = String(items.length);
                ghead.append(h2, n);
                const cards = document.createElement("div");
                cards.className = section.id === "v-components" ? "cards cards--components" : "cards";
                cards.append(...items.map(cardOf));
                block.append(ghead, cards);
                view.append(block);
            }
            main.append(view);
        }
    };

    const setActive = (id: string | null) => {
        if (id === activeId) return;
        activeId = id;
        paintActive();
        const next = id ? `#/${id}` : location.pathname + location.search;
        try { history.replaceState(null, "", next); } catch { /* ignore */ }
    };
    const spy = () => {
        if (Date.now() < spyLock) return;
        if (pinned) {
            const pinnedEl = shadow.getElementById(`sec-${pinned}`);
            const top = pinnedEl?.getBoundingClientRect().top;
            if (top != null && top > -60 && top < 160) { setActive(pinned); return; }
            pinned = null;
        }
        let current: string | null = null;
        for (const node of Array.from(shadow.querySelectorAll<HTMLElement>("[data-spy]"))) {
            if (node.getBoundingClientRect().top <= 96) current = node.dataset.spy ?? current;
        }
        setActive(current);
    };
    const route = (id: string | null) => {
        (shadow.host as HTMLElement).classList.remove("side-open");
        const target = id ? shadow.getElementById(`sec-${id}`) : null;
        pinned = target ? id : null;
        spyLock = Date.now() + 900;
        activeId = null;
        setActive(pinned);
        // Direct navigation must not enqueue every card between the old and new sections.
        target?.scrollIntoView({ behavior: "instant", block: "start" });
        schedulePreviews();
    };

    const openLightbox = (item: CatalogLeaf) => {
        closeLightbox?.();
        const box = document.createElement("div");
        box.className = "lightbox";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-label", item.label);
        const bar = document.createElement("div");
        bar.className = "lightbox__h";
        const name = document.createElement("b");
        name.textContent = item.label;
        const meta = document.createElement("span");
        meta.textContent = `${item.width}×${item.height}`;
        const alone = document.createElement("button");
        alone.type = "button";
        alone.className = "ib";
        alone.textContent = "单独打开";
        alone.addEventListener("click", () => {
            location.href = item.kind === "component"
                ? `?ui=component-specimen&part=${encodeURIComponent(item.id)}&skin=${prefs.skin}`
                : `?ui=${encodeURIComponent(item.id)}&skin=${prefs.skin}`;
        });
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "ib";
        closeBtn.title = "关闭";
        closeBtn.setAttribute("aria-label", "关闭");
        closeBtn.append(icon("x"));
        bar.append(name, meta, alone, closeBtn);
        const body = document.createElement("div");
        body.className = "lightbox__b";
        const frame = document.createElement("div");
        frame.className = "frame";
        frame.dataset.kind = item.kind;
        frame.dataset.id = item.id;
        let record: { item: CatalogLeaf; slot: HTMLElement; live: HTMLElement; home: HTMLElement; host: HTMLElement } | undefined;
        for (const entry of frames.values()) {
            if (entry.item.id === item.id && entry.item.kind === item.kind) { record = entry; break; }
        }
        let tempSlot: HTMLElement | null = null;
        if (record) {
            record.host = frame;
            if (!mounted.has(record.slot)) {
                mounted.set(record.slot, item);
                preview.show(record.slot, item, prefs.skin, 0);
            } else preview.prioritize(record.slot, 0);
            frame.append(record.live);
        } else {
            const live = document.createElement("div");
            live.className = "live";
            const root = live.attachShadow({ mode: "open" });
            const slot = document.createElement("div");
            slot.style.cssText = "position:relative;overflow:hidden;";
            root.append(slot);
            frame.append(live);
            tempSlot = slot;
            preview.show(slot, item, prefs.skin, 0);
        }
        body.append(frame);
        box.append(bar, body);
        const fit = () => {
            const scale = Math.min((body.clientWidth - 32) / item.width, (body.clientHeight - 16) / item.height, item.kind === "component" ? 1.5 : 1);
            frame.style.width = `${item.width * scale}px`;
            frame.style.height = `${item.height * scale}px`;
            const live = frame.querySelector(".live") as HTMLElement | null;
            if (!live) return;
            const applied = frame.clientWidth > 0 ? frame.clientWidth / item.width : scale;
            live.style.width = `${item.width}px`;
            live.style.height = `${item.height}px`;
            const slot = live.shadowRoot?.firstElementChild as HTMLElement | undefined;
            if (slot) {
                slot.style.width = `${item.width}px`;
                slot.style.height = `${item.height}px`;
            }
            live.style.visibility = "visible";
            live.style.transform = `scale(${applied})`;
        };
        const restore = () => {
            if (tempSlot) {
                preview.hide(tempSlot);
                tempSlot = null;
                return;
            }
            if (!record) return;
            record.host = record.home;
            if (record.live.parentElement !== record.home) record.home.append(record.live);
            fitLive(record.home, record.live, item.width, item.height);
            schedulePreviews();
        };
        const close = () => {
            restore();
            box.remove();
            window.removeEventListener("resize", fit);
            document.removeEventListener("keydown", onKey, true);
            if (closeLightbox === close) closeLightbox = null;
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            close();
        };
        closeBtn.addEventListener("click", close);
        body.addEventListener("click", (event) => { if (event.target === body) close(); });
        shadow.append(box);
        window.addEventListener("resize", fit);
        document.addEventListener("keydown", onKey, true);
        fit();
        requestAnimationFrame(fit);
        closeLightbox = close;
        closeBtn.focus();
    };

    const popover = (anchor: HTMLElement, build: (pop: HTMLElement, close: () => void) => void) => {
        if (popClose) { popClose(); return; }
        const pop = document.createElement("div");
        pop.className = "pop";
        pop.setAttribute("role", "menu");
        const close = () => {
            pop.remove();
            document.removeEventListener("pointerdown", away, true);
            anchor.setAttribute("aria-expanded", "false");
            popClose = null;
        };
        const away = (event: Event) => {
            const path = event.composedPath();
            if (!path.includes(pop) && !path.includes(anchor)) close();
        };
        popClose = close;
        build(pop, close);
        anchor.parentElement?.append(pop);
        anchor.setAttribute("aria-expanded", "true");
        document.addEventListener("pointerdown", away, true);
    };
    const popItem = (label: string, checked: boolean, lead: Node | null, onClick: () => void) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pop__item";
        button.setAttribute("role", "menuitemradio");
        button.setAttribute("aria-checked", String(checked));
        button.addEventListener("click", onClick);
        if (lead) button.append(lead);
        button.append(document.createTextNode(label));
        return button;
    };
    const chip = (background: string) => {
        const mark = document.createElement("i");
        mark.className = "chip";
        mark.style.background = background;
        return mark;
    };

    $("#btnCanvas", shadow).addEventListener("click", () => {
        const anchor = $("#btnCanvas", shadow);
        popover(anchor, (pop, close) => {
            const label = document.createElement("div");
            label.className = "pop__label";
            label.textContent = "画布背景";
            const pick = (name: string, mode: CanvasMode, swatch: string) => popItem(name, prefs.canvas === mode, chip(swatch), () => {
                prefs.canvas = mode;
                savePrefs();
                applyCanvas();
                close();
            });
            const custom = pick("自定义", "custom", prefs.custom);
            const color = document.createElement("input");
            color.type = "color";
            color.className = "pop__color";
            color.value = prefs.custom;
            color.setAttribute("aria-label", "自定义颜色");
            color.addEventListener("click", (event) => event.stopPropagation());
            color.addEventListener("input", () => {
                prefs.canvas = "custom";
                prefs.custom = color.value;
                savePrefs();
                applyCanvas();
            });
            custom.append(color);
            pop.append(
                label,
                pick("浅色", "light", "#eef0f3"),
                pick("深色", "dark", "#14161b"),
                pick("棋盘格", "checker", "repeating-conic-gradient(#b9bcc4 0 25%,#fff 0 50%) 0 0/8px 8px"),
                custom,
            );
        });
    });
    $("#btnTheme", shadow).addEventListener("click", () => {
        applyTheme((shadow.host as HTMLElement).dataset.theme === "dark" ? "light" : "dark");
    });
    const paintSkin = () => {
        const current = PREVIEW_SKINS.find((skin) => skin.id === prefs.skin) ?? PREVIEW_SKINS[0];
        $("#skinLabel", shadow).textContent = current.label;
    };
    paintSkin();
    $("#btnSkin", shadow).addEventListener("click", () => {
        const anchor = $("#btnSkin", shadow);
        popover(anchor, (pop, close) => {
            const label = document.createElement("div");
            label.className = "pop__label";
            label.textContent = "主题";
            pop.append(label);
            for (const skin of PREVIEW_SKINS) {
                pop.append(popItem(skin.label, prefs.skin === skin.id, null, () => {
                    prefs.skin = skin.id;
                    savePrefs();
                    paintSkin();
                    applySkin();
                    close();
                }));
            }
        });
    });
    $("#btnMenu", shadow).addEventListener("click", () => (shadow.host as HTMLElement).classList.toggle("side-open"));
    $("#backdrop", shadow).addEventListener("click", () => (shadow.host as HTMLElement).classList.remove("side-open"));
    $("#search", shadow).addEventListener("input", (event) => {
        query = (event.target as HTMLInputElement).value;
        renderSidebar();
        renderMain();
    });
    $("#search", shadow).addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        shadow.querySelector<HTMLAnchorElement>("#tree li li a, #tree a")?.click();
    });
    $("#tree", shadow).addEventListener("click", (event) => {
        const anchor = (event.target as Element | null)?.closest("a[href^='#/']");
        if (!anchor) return;
        event.preventDefault();
        const id = anchor.getAttribute("href")?.slice(2) ?? "";
        try { history.pushState(null, "", `#/${id}`); } catch { /* ignore */ }
        route(id);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            if (popClose) { popClose(); return; }
            (shadow.host as HTMLElement).classList.remove("side-open");
        }
        const active = shadow.activeElement ?? document.activeElement;
        const typing = !!active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
        if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            (shadow.host as HTMLElement).classList.add("side-open");
            $("#search", shadow).focus();
        }
    });
    window.addEventListener("message", (event) => {
        if (event.origin !== location.origin) return;
        const data = event.data as { type?: string } | null;
        if (data?.type === "uniflex-preview-back") closeLightbox?.();
        if (data?.type !== "uniflex-preview-ready") return;
        for (const iframe of Array.from(shadow.querySelectorAll("iframe"))) {
            if (iframe.contentWindow !== event.source) continue;
            iframe.dataset.ready = "1";
            const frame = iframe.parentElement;
            if (frame?.dataset.kind !== "component") return;
            const current = new URL(iframe.src, location.href).searchParams.get("skin");
            if (previewSkin(current ?? undefined) !== prefs.skin) {
                iframe.contentWindow?.postMessage({ type: "uniflex-preview-skin", skin: prefs.skin }, location.origin);
            }
            return;
        }
    });
    let spyRaf = 0;
    document.addEventListener("scroll", () => {
        schedulePreviews();
        if (!spyRaf) spyRaf = requestAnimationFrame(() => { spyRaf = 0; spy(); });
    }, { passive: true });

    const initialTheme = prefs.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(initialTheme);
    applyCanvas();
    renderSidebar();
    renderMain();
    const hash = location.hash.match(/^#\/([\w-]+)/)?.[1] ?? null;
    if (hash) route(hash);
    else spy();
    schedulePreviews();
}
