(() => {
  const root = document.documentElement;
  const menu = document.getElementById("main-navigation");
  const menuButton = document.querySelector("[data-menu-toggle]");
  const themeButton = document.querySelector("[data-theme-toggle]");

  const closeMenu = () => {
    if (!menu || !menuButton) return;
    menu.classList.remove("wsk-is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "打开导航");
  };

  const scrollToTarget = (target, focusTarget = false) => {
    root.classList.add("wsk-scroll-instant");
    target.scrollIntoView({ block: "start" });
    if (focusTarget) {
      target.focus({ preventScroll: true });
    }
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}`,
    );
    closeMenu();
    requestAnimationFrame(() => root.classList.remove("wsk-scroll-instant"));
  };

  document.addEventListener(
    "click",
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const link =
        event.target instanceof Element
          ? event.target.closest('a[href^="#"]')
          : null;
      if (!link) return;

      const id = decodeURIComponent(link.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      scrollToTarget(target, link.classList.contains("wsk-skip-link"));
    },
    true,
  );

  if (location.hash) {
    const target = document.getElementById(
      decodeURIComponent(location.hash.slice(1)),
    );
    if (target) requestAnimationFrame(() => scrollToTarget(target));
  }

  const syncThemeButton = () => {
    if (!themeButton) return;
    const isDark = root.dataset.theme !== "light";
    themeButton.setAttribute(
      "aria-label",
      isDark ? "切换到浅色主题" : "切换到深色主题",
    );
    themeButton.setAttribute(
      "title",
      isDark ? "切换到浅色主题" : "切换到深色主题",
    );
    const glyph = themeButton.querySelector("span");
    if (glyph) glyph.textContent = isDark ? "☼" : "◐";
  };

  themeButton?.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("gono-theme", next);
    syncThemeButton();
  });
  syncThemeButton();

  menuButton?.addEventListener("click", () => {
    if (!menu) return;
    const open = menu.classList.toggle("wsk-is-open");
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
  });

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];

  const activateTab = (tab, moveFocus = false) => {
    const panelId = tab.getAttribute("aria-controls");
    tabs.forEach((candidate) => {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.id !== panelId;
    });
    if (moveFocus) tab.focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") {
        next = (index - 1 + tabs.length) % tabs.length;
      }
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      activateTab(tabs[next], true);
    });
  });

  const copyButton = document.querySelector("[data-copy-command]");
  const copyStatus = document.querySelector("[data-copy-status]");
  copyButton?.addEventListener("click", async () => {
    const command = copyButton.dataset.copyCommand;
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      copyButton.textContent = "已复制";
      if (copyStatus) copyStatus.textContent = "克隆命令已复制到剪贴板。";
    } catch {
      copyButton.textContent = "请手动复制";
    }
    window.setTimeout(() => {
      copyButton.textContent = "复制";
      if (copyStatus) copyStatus.textContent = "";
    }, 1800);
  });
})();
