import { CATALOG_TILES, CATALOG_TITLES, catalogIdFor } from "./catalog.mjs";
import { COMMON_PACKAGE, PREVIEW_FONT_FAMILY } from "./constants.mjs";

export function renderPreviewHtml({ screens = [], font = true } = {}) {
    const list = screens.map((entry) => ({
        id: entry.id,
        group: entry.group ?? "",
        packageName: entry.packageName,
        componentName: entry.componentName,
        width: entry.width ?? entry.canvas?.width,
        height: entry.height ?? entry.canvas?.height,
        commonPackage: entry.commonPackage ?? COMMON_PACKAGE,
        tabOf: entry.tabOf,
        tabLabel: entry.tabLabel,
        activeTabLabel: entry.activeTabLabel,
    }));
    const first = list[0] ?? { id: "catalog", width: 750, height: 1424 };
    const face = PREVIEW_FONT_FAMILY;
    const catalogId = catalogIdFor(list);
    const options = list.filter((entry) => !entry.tabOf).map((entry) =>
        `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.componentName)}</option>`).join("");
    const picker = list.filter((entry) => !entry.tabOf).length > 1
        ? `<label id="picker" style="position:fixed;top:8px;left:8px;z-index:10;color:#e8edf2;font:14px/1.4 sans-serif">`
            + `<select id="screen">${options}</select></label>`
        : "";
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>FairyGUI 预览</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #101318; }
    #ui { position: absolute; left: 50%; top: 50%; width: ${first.width}px; height: ${first.height}px; transform-origin: center; overflow: hidden; }
    .fgui-text { padding: 0 !important; paint-order: stroke fill; }
    #home { position: fixed; top: 8px; right: 8px; z-index: 10; border: 0; border-radius: 8px; padding: 8px 14px;
      background: #2a3340; color: #e8edf2; font: 14px/1.4 sans-serif; cursor: pointer; }
    #catalog { position: absolute; inset: 0; width: 750px; height: 1424px; background: #101318; color: #ffffff;
      flex-direction: column; align-items: center; padding-top: 40px; box-sizing: border-box; }
    #catalog:not([hidden]) { display: flex; }
    #catalog .title { width: 650px; height: 72px; font-size: 42px; line-height: 72px; text-align: center; }
    #catalog .sub { width: 650px; height: 50px; font-size: 24px; line-height: 50px; text-align: center; color: #aab4c4; }
    #catalog .tiles { width: 616px; padding-top: 36px; display: flex; flex-wrap: wrap; gap: 16px; align-content: flex-start; }
    #catalog button { border: 0; color: #ffffff; font-size: 34px; cursor: pointer; }
    #catalog button[disabled] { opacity: 0.35; cursor: default; }
    ${font ? `@font-face { font-family: ${face}; src: url("./regular.ttf") format("truetype"); font-weight: 400; font-style: normal; }
    #catalog { font-family: ${face}, sans-serif; }` : ""}
  </style>
</head>
<body>
  ${picker}
  <button id="home" type="button" hidden>目录</button>
  <main id="ui">${catalogMarkup(list)}</main>
  <script src="./fairygui.js"></script>
  <script type="module">
    const fgui = window.fgui;
    if (!fgui) throw new Error("fairygui-dom failed to load");
    // 九宫格合成缓存：CSS border-image 在切片接缝处会露出格子线，改为 canvas 一次性合成
    const nineSliceCache = new Map();
    const nineSliceImages = new Map();
    const nineSliceImage = (src) => {
      let entry = nineSliceImages.get(src);
      if (!entry) {
        entry = { img: new Image(), ready: false, queue: [] };
        entry.img.onload = () => {
          entry.ready = true;
          entry.queue.splice(0).forEach((fn) => fn());
        };
        entry.img.src = src;
        nineSliceImages.set(src, entry);
      }
      return entry;
    };
    const drawNineSlice = (src, sg, dg, w, h) => {
      const key = [src, w, h, sg.left, sg.top, sg.right, sg.bottom, dg.left, dg.top, dg.right, dg.bottom].join("|");
      const cached = nineSliceCache.get(key);
      if (cached) return cached;
      const entry = nineSliceImages.get(src);
      if (!entry || !entry.ready) return null;
      const img = entry.img;
      const L = Math.round(dg.left), T = Math.round(dg.top);
      const R = Math.round(dg.right), B = Math.round(dg.bottom);
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const cols = [[0, L, 0, sg.left], [L, Math.max(0, w - L - R), sg.left, Math.max(0, iw - sg.left - sg.right)], [w - R, R, iw - sg.right, sg.right]];
      const rows = [[0, T, 0, sg.top], [T, Math.max(0, h - T - B), sg.top, Math.max(0, ih - sg.top - sg.bottom)], [h - B, B, ih - sg.bottom, sg.bottom]];
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
      const ctx = canvas.getContext("2d");
      for (const [dy, dh, sy, sh] of rows) {
        for (const [dx, dw, sx, sw] of cols) {
          if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) continue;
          ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        }
      }
      const url = canvas.toDataURL();
      if (nineSliceCache.size > 400) nineSliceCache.clear();
      nineSliceCache.set(key, url);
      return url;
    };
    const patchNineSlice = () => {
      let proto = null;
      document.querySelectorAll("#ui div").forEach((el) => {
        if (!proto && el._scale9Grid) proto = Object.getPrototypeOf(el);
      });
      if (!proto || proto.__nineSliceCanvasPatched) return Boolean(proto);
      proto.__nineSliceCanvasPatched = true;
      proto.refresh = function() {
        if (this._timerID_1 != 0) return;
        this._timerID_1 = window.requestAnimationFrame(() => {
          this._timerID_1 = 0;
          if (!this._src) {
            this.style.backgroundImage = "none";
            this.style.borderImage = "none";
            return;
          }
          if (this._scaleByTile) {
            this.style.borderImage = "none";
            this.style.backgroundImage = "url('" + this._src + "')";
            if (this._textureScale.x != 1 || this._textureScale.y != 1) {
              this.style.backgroundSize = this._textureScale.x + "px " + this._textureScale.y + "px";
            } else {
              this.style.backgroundSize = "auto";
            }
            this.style.backgroundRepeat = "repeat";
            return;
          }
          if (this._scale9Grid) {
            const g = this._scale9Grid;
            const sx = (this._textureScale && this._textureScale.x) || 1;
            const sy = (this._textureScale && this._textureScale.y) || 1;
            const w = Math.round(parseFloat(this.style.width) || this.clientWidth || 0);
            const h = Math.round(parseFloat(this.style.height) || this.clientHeight || 0);
            this.style.boxSizing = "border-box";
            this.style.borderImage = "none";
            if (w > 0 && h > 0) {
              const src = this._src;
              const dst = { left: g.left / sx, top: g.top / sy, right: g.right / sx, bottom: g.bottom / sy };
              const apply = () => {
                const url = drawNineSlice(src, g, dst, w, h);
                if (!url) return;
                this.style.backgroundImage = "url('" + url + "')";
                this.style.backgroundSize = "100% 100%";
                this.style.backgroundRepeat = "no-repeat";
              };
              const entry = nineSliceImage(src);
              if (entry.ready) apply();
              else entry.queue.push(apply);
            }
            return;
          }
          this.style.borderImage = "none";
          this.style.backgroundImage = "url('" + this._src + "')";
          this.style.backgroundSize = "100% 100%";
          this.style.backgroundRepeat = "no-repeat";
        });
      };
      return true;
    };
    // 视图创建后调用：补丁 Image.prototype（幂等）并让已有九宫格元素按新逻辑重绘。
    // 清零 pending 定时器：创建期旧 refresh 的 rAF 可能仍在排队，会被它顶掉后由新逻辑收尾。
    const refreshNineSlice = () => {
      if (!patchNineSlice()) return;
      document.querySelectorAll("#ui div").forEach((el) => {
        if (el._scale9Grid && typeof el.refresh === "function") {
          el._timerID_1 = 0;
          el.refresh();
        }
      });
    };
    patchNineSlice();
    const screens = ${JSON.stringify(list)};
    const titles = ${JSON.stringify(CATALOG_TITLES)};
    const catalogId = ${JSON.stringify(catalogId)};
    const host = document.getElementById("ui");
    const catalogEl = document.getElementById("catalog");
    const homeBtn = document.getElementById("home");
    const canvas = { width: ${first.width}, height: ${first.height} };
    const params = new URLSearchParams(location.search);
    const exportMode = params.get("psd") === "1";
    if (exportMode) {
      document.getElementById("picker")?.style.setProperty("display", "none");
      if (homeBtn) homeBtn.hidden = true;
    }
    let groot;
    let view;
    let loadedNames = new Set();
    let loadedGroup = null;
    let currentId = null;
    const resize = () => {
      if (exportMode) {
        host.style.left = "0";
        host.style.top = "0";
        host.style.transform = "none";
        host.style.transformOrigin = "top left";
      } else {
        const scale = Math.min(innerWidth / canvas.width, innerHeight / canvas.height);
        host.style.transform = \`translate(-50%, -50%) scale(\${scale})\`;
      }
      groot?.setSize(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    ${font ? `fgui.UIConfig.defaultFont = "${face}";` : ""}
    const pkgUrl = (screen, name) => {
      const pkg = name || screen.packageName;
      return screen.group ? "./" + screen.group + "/" + pkg : "./" + pkg;
    };
    const disposeView = () => {
      if (!view) return;
      view.removeFromParent();
      view.dispose?.();
      view = null;
    };
    const unloadPackages = () => {
      disposeView();
      for (const name of [...loadedNames]) {
        try { fgui.UIPackage.removePackage(name); } catch { /* ignore */ }
      }
      loadedNames = new Set();
      loadedGroup = null;
    };
    const ensure = async (screen) => {
      const group = screen.group || "";
      if (loadedGroup !== group) {
        unloadPackages();
        const common = screen.commonPackage || "${COMMON_PACKAGE}";
        await fgui.UIPackage.loadPackage(pkgUrl(screen, common));
        loadedNames.add(common);
        loadedGroup = group;
      }
      if (!loadedNames.has(screen.packageName)) {
        await fgui.UIPackage.loadPackage(pkgUrl(screen));
        loadedNames.add(screen.packageName);
      }
    };
    const walk = (obj, visit) => {
      if (!obj) return;
      visit(obj);
      if (obj.numChildren) for (let i = 0; i < obj.numChildren; i++) walk(obj.getChildAt(i), visit);
    };
    const isFillImage = (obj) => {
      const item = obj?.packageItem || obj?._contentItem;
      const file = String(item?.file || item?.name || obj?._element?.src || obj?.element?.src || "");
      return /(^|\\/)fill_[0-9a-f]+\\.png/i.test(file);
    };
    const clearFillNineGrid = (root) => {
      walk(root, (obj) => {
        if (!isFillImage(obj)) return;
        const el = obj.element || obj._element;
        if (!el) return;
        el.scale9Grid = null;
        el.scaleByTile = false;
        if (el.textureScale) { el.textureScale.x = 1; el.textureScale.y = 1; }
        if (el.style) {
          el.style.borderImage = "none";
          el.style.borderImageSlice = "0 fill";
          el.style.boxSizing = "content-box";
          const src = el.src || el._src;
          if (src) {
            el.style.backgroundImage = "url('" + src + "')";
            el.style.backgroundSize = "100% 100%";
            el.style.backgroundRepeat = "no-repeat";
          }
        }
      });
    };
    const enableElementHit = (obj) => {
      if (!obj) return;
      obj.opaque = true;
      obj.touchable = true;
      const el = obj.element || obj._element;
      if (!el) return;
      el._touchDisabled = false;
      el.touchable = true;
      el.opaque = true;
      if (typeof el.updateTouchableFlag === "function") el.updateTouchableFlag();
      if (el.style && (el.style.pointerEvents === "none" || el.style.pointerEvents === "None")) {
        el.style.pointerEvents = "auto";
      }
    };
    const bindClick = (obj, handler) => {
      if (!obj || obj.__catalogBound) return;
      obj.__catalogBound = true;
      enableElementHit(obj);
      obj.onClick(handler, null);
    };
    const bindLabeled = (obj, handler) => {
      bindClick(obj, handler);
      if (obj.group) bindClick(obj.group, handler);
      for (let p = obj.parent; p; p = p.parent) {
        if (typeof p.fireClick === "function") {
          bindClick(p, handler);
          break;
        }
      }
      const grouped = obj.group;
      const parent = obj.parent;
      if (!grouped || !parent?.numChildren) return;
      for (let i = 0; i < parent.numChildren; i++) {
        const child = parent.getChildAt(i);
        if (child.group === grouped) bindClick(child, handler);
      }
    };
    const bindCatalogClicks = (root, goScreen) => {
      const targets = [];
      walk(root, (obj) => {
        const label = String(obj.title || obj.text || "").trim();
        const id = titles[label];
        if (!id) return;
        bindLabeled(obj, () => goScreen(id));
        const box = obj.group && obj.group.width > 0 ? obj.group : obj;
        const global = box.localToGlobal ? box.localToGlobal(0, 0) : { x: box.x, y: box.y };
        const origin = root.localToGlobal ? root.localToGlobal(0, 0) : { x: 0, y: 0 };
        targets.push({
          id,
          x: global.x - origin.x,
          y: global.y - origin.y,
          w: box.width,
          h: box.height,
        });
      });
      const el = root.element || root._element;
      if (!el || el.__catalogHitsBound) return;
      el.__catalogHitsBound = true;
      enableElementHit(root);
      el.addEventListener("click", (event) => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (event.clientX - rect.left) / rect.width * root.width;
        const y = (event.clientY - rect.top) / rect.height * root.height;
        for (let i = targets.length - 1; i >= 0; i--) {
          const tile = targets[i];
          if (x >= tile.x && x <= tile.x + tile.w && y >= tile.y && y <= tile.y + tile.h) {
            goScreen(tile.id);
            return;
          }
        }
      });
    };
    const enableHits = (obj) => {
      if (!obj) return;
      enableElementHit(obj);
      if (!obj.numChildren) return;
      for (let i = 0; i < obj.numChildren; i++) {
        const child = obj.getChildAt(i);
        if (!child) continue;
        enableElementHit(child);
      }
    };
    const hit = (obj, handler) => {
      if (!obj) return;
      enableHits(obj);
      bindClick(obj, handler);
      if (obj.numChildren) {
        for (let i = 0; i < obj.numChildren; i++) bindClick(obj.getChildAt(i), handler);
      }
      const parent = obj.parent;
      if (!parent?.numChildren) return;
      for (let i = 0; i < parent.numChildren; i++) {
        const child = parent.getChildAt(i);
        if (child.group === obj) {
          enableHits(child);
          bindClick(child, handler);
        }
      }
    };
    const isDismiss = (name) => {
      const n = String(name || "");
      return n === "CloseButton" || n === "Back" || n === "Close"
        || n.endsWith("/Back") || n.endsWith("/Close") || n.endsWith("/Mask") || n === "Mask";
    };
    const layoutSlider = (slider, value, min, max) => {
      if (!slider?.numChildren) return;
      const kids = [];
      for (let i = 0; i < slider.numChildren; i++) kids.push(slider.getChildAt(i));
      const images = kids.filter((child) => child.width > 0 && (child.icon != null || child.src || child.name));
      const track = images[0] || kids[0];
      const thumb = images[images.length - 1] || kids[kids.length - 1];
      const fill = images.length > 2 ? images[1] : null;
      const span = Math.max(0, (track?.width ?? slider.width) - (thumb?.width ?? 0));
      const ratio = max <= min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
      if (thumb && track) thumb.x = track.x + ratio * span;
      if (fill && track) fill.width = Math.max(1, ratio * track.width);
    };
    const bindQuantity = (root) => {
      const named = {};
      const texts = [];
      walk(root, (obj) => {
        if (obj.name) named[obj.name] = obj;
        if (!obj.numChildren && obj.text != null && /^\\d+$/.test(String(obj.text).trim())) texts.push(obj);
      });
      const dec = named["QuantityControl/Decrease"];
      const inc = named["QuantityControl/Increase"];
      const maxBtn = named["QuantityControl/Max"];
      const slider = named["QuantityControl/Slider"];
      if (!dec && !inc && !maxBtn && !slider) return;
      const qtyGroup = (dec || inc || slider)?.group || named.QuantityControl;
      const title = texts.find((obj) => qtyGroup && obj.group === qtyGroup)
        || texts.find((obj) => obj.parent === (dec || inc || slider)?.parent && obj.group === qtyGroup)
        || named.title || named.t0;
      const min = 0;
      const max = 99;
      const read = () => {
        const n = Number.parseInt(String(title?.text ?? title?.title ?? "0"), 10);
        return Number.isFinite(n) ? n : 0;
      };
      const apply = (value) => {
        const next = Math.max(min, Math.min(max, Math.round(value)));
        if (title) {
          title.text = String(next);
          if (title.title != null) title.title = String(next);
          title.element?.applyText?.();
        }
        layoutSlider(slider, next, min, max);
      };
      hit(dec, () => apply(read() - 1));
      hit(inc, () => apply(read() + 1));
      hit(maxBtn, () => apply(max));
      if (slider) {
        enableHits(slider);
        const fromEvent = (evt) => {
          const pos = evt?.pos ?? evt?.input;
          const gx = pos?.x ?? 0;
          const gy = pos?.y ?? 0;
          const local = slider.globalToLocal ? slider.globalToLocal(gx, gy) : { x: gx - slider.x };
          const width = slider.width || 1;
          apply(min + (Math.max(0, Math.min(1, local.x / width)) * (max - min)));
        };
        slider.on?.("pointer_down", fromEvent);
        hit(slider, fromEvent);
      }
    };
    const bindPageInteractions = (root, goCatalog, { dismissActions = true } = {}) => {
      bindQuantity(root);
      walk(root, (obj) => {
        if (isDismiss(obj.name)) hit(obj, goCatalog);
        if (dismissActions && (obj.name === "ConfirmButton" || obj.name === "CancelButton")) hit(obj, goCatalog);
      });
    };
    const bindTabClicks = (root, screen, goScreen) => {
      const family = screen.tabOf || screen.id;
      const variants = screens.filter((entry) => entry.tabOf === family && entry.tabLabel);
      if (!variants.length) return;
      const base = screens.find((entry) => entry.id === family);
      const byLabel = new Map(variants.map((entry) => [entry.tabLabel, entry.id]));
      if (base?.activeTabLabel) byLabel.set(base.activeTabLabel, base.id);
      walk(root, (obj) => {
        if (obj.numChildren) return;
        const label = String(obj.text || obj.title || "").trim();
        if (!label) return;
        const target = byLabel.get(label);
        if (!target || target === screen.id) return;
        bindLabeled(obj, () => goScreen(target));
      });
    };
    const setCanvas = (width, height) => {
      canvas.width = width;
      canvas.height = height;
      host.style.width = width + "px";
      host.style.height = height + "px";
      groot?.setSize(width, height);
      resize();
    };
    const showHtmlCatalog = () => {
      disposeView();
      if (groot?.element) groot.element.style.display = "none";
      catalogEl.hidden = false;
      if (homeBtn && !exportMode) homeBtn.hidden = true;
      setCanvas(750, 1424);
      currentId = "catalog";
      window.__FGUI_PREVIEW__ = { view: null, screens, catalog: true, catalogId, currentId, go };
      document.documentElement.dataset.fguiReady = "true";
      document.documentElement.dataset.fguiScreen = "catalog";
    };
    const syncPicker = (id) => {
      const picker = document.getElementById("screen");
      if (picker && [...picker.options].some((option) => option.value === id)) picker.value = id;
    };
    async function show(id) {
      if (id === "catalog") {
        showHtmlCatalog();
        return;
      }
      const screen = screens.find((entry) => entry.id === id);
      if (!screen) {
        showHtmlCatalog();
        return;
      }
      catalogEl.hidden = true;
      await ensure(screen);
      disposeView();
      setCanvas(screen.width, screen.height);
      view = fgui.UIPackage.createObject(screen.packageName, screen.componentName);
      if (!view) throw new Error("createObject failed");
      view.setSize(screen.width, screen.height);
      groot = fgui.GRoot.inst;
      groot.addChild(view);
      if (groot.element.parentNode !== host) host.appendChild(groot.element);
      groot.element.style.display = "";
      groot.setSize(screen.width, screen.height);
      const relayout = (obj) => {
        obj?.element?.applyText?.();
        if (obj?.numChildren) for (let i = 0; i < obj.numChildren; i++) relayout(obj.getChildAt(i));
      };
      relayout(view);
      clearFillNineGrid(view);
      refreshNineSlice();
      resize();
      currentId = screen.id;
      if (screen.id === "preview-home") bindCatalogClicks(view, go);
      bindTabClicks(view, screen, go);
      bindPageInteractions(view, () => go(catalogId), { dismissActions: screen.id !== "preview-home" && screen.id !== catalogId });
      if (homeBtn && !exportMode) homeBtn.hidden = screen.id === catalogId;
      window.__FGUI_PREVIEW__ = {
        view, packageName: screen.packageName, componentName: screen.componentName,
        screens, catalogId, currentId, go,
      };
      document.documentElement.dataset.fguiReady = "true";
      document.documentElement.dataset.fguiScreen = screen.id;
      syncPicker(screen.id);
    }
    let goingTo = null;
    function go(id) {
      if (id !== "catalog" && !screens.some((entry) => entry.id === id)) return;
      if (id === currentId || goingTo === id) return;
      goingTo = id;
      const query = new URLSearchParams(location.search);
      if (exportMode) query.set("psd", "1");
      query.set("screen", id);
      history.pushState(null, "", "?" + query.toString());
      const done = show(id);
      Promise.resolve(done).finally(() => { if (goingTo === id) goingTo = null; });
      return done;
    }
    catalogEl?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-screen]");
      if (!button || button.disabled) return;
      go(button.getAttribute("data-screen"));
    });
    homeBtn?.addEventListener("click", () => go(catalogId));
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") go(catalogId);
    });
    const select = document.getElementById("screen");
    const initial = params.get("screen") || catalogId;
    if (select) {
      select.value = screens.some((entry) => entry.id === initial) ? initial : catalogId;
      select.addEventListener("change", () => go(select.value));
    }
    window.addEventListener("popstate", () => {
      const next = new URLSearchParams(location.search).get("screen") || catalogId;
      show(next);
    });
    ${font ? `await Promise.race([
      Promise.all([
        document.fonts.load("40px ${face}").catch(() => {}),
        document.fonts.ready,
      ]),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);` : ""}
    try {
      await show(initial);
    } catch (error) {
      console.error(error);
      showHtmlCatalog();
    }
  </script>
</body>
</html>
`;
}

function catalogMarkup(screens) {
    const available = new Set(screens.map((entry) => entry.id));
    const buttons = CATALOG_TILES.map((tile) => {
        const enabled = available.has(tile.id);
        return `<button type="button" data-screen="${escapeHtml(tile.id)}"`
            + ` style="width:${tile.width}px;height:${tile.height}px;background:${tile.background}"`
            + `${enabled ? "" : " disabled"}>${escapeHtml(tile.title)}</button>`;
    }).join("");
    return `<div id="catalog" hidden>
    <div class="title">FairyGUI 预览</div>
    <div class="sub">选择功能界面</div>
    <div class="tiles">${buttons}</div>
  </div>`;
}

export function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function screensFromIr(ir) {
    return (ir.screens ?? []).map((entry) => ({
        id: entry.id,
        group: "",
        packageName: entry.packageName,
        componentName: entry.componentName,
        width: entry.canvas.width,
        height: entry.canvas.height,
        commonPackage: COMMON_PACKAGE,
        tabOf: entry.tabOf,
        tabLabel: entry.tabLabel,
        activeTabLabel: entry.activeTabLabel,
    }));
}
