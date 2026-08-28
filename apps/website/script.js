(() => {
  const root = document.documentElement;
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const copyStatus = document.querySelector("[data-copy-status]");

  function setTheme(theme, persist = true) {
    root.dataset.theme = theme;
    const dark = theme === "dark";
    const label = dark ? "切换到浅色主题" : "切换到深色主题";
    if (themeToggle) {
      themeToggle.setAttribute("aria-label", label);
      themeToggle.title = label;
      const glyph = themeToggle.querySelector("span");
      if (glyph) glyph.textContent = dark ? "☼" : "◐";
    }
    if (themeColor) themeColor.content = dark ? "#090e19" : "#f7f8fb";
    if (persist) {
      try {
        localStorage.setItem("gono-theme", theme);
      } catch {}
    }
  }

  setTheme(root.dataset.theme === "dark" ? "dark" : "light", false);
  themeToggle?.addEventListener("click", () => {
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  document.querySelectorAll(".wsk-project-card").forEach((card) => {
    const release = () => card.classList.remove("wsk-is-pressed");
    card.addEventListener("pointerdown", (event) => {
      if (event.button === 0) card.classList.add("wsk-is-pressed");
    });
    card.addEventListener("pointerup", release);
    card.addEventListener("pointercancel", release);
    card.addEventListener("pointerleave", release);
  });

  function announce(message) {
    if (!copyStatus) return;
    copyStatus.textContent = message;
    window.setTimeout(() => {
      copyStatus.textContent = "";
    }, 1800);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {}
      area.remove();
      return copied;
    }
  }

  document.querySelectorAll("[data-copy-command]").forEach((button) => {
    button.addEventListener("click", async () => {
      const command = button.getAttribute("data-copy-command");
      if (!command) return;
      const copied = await copyText(command);
      const original = button.textContent;
      button.textContent = copied ? "已复制" : "请手动复制";
      announce(copied ? "克隆命令已复制到剪贴板。" : "请手动复制克隆命令。");
      window.setTimeout(() => {
        button.textContent = original || "复制 clone 命令";
      }, 1800);
    });
  });

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
      let id;
      try {
        id = decodeURIComponent(link.hash.slice(1));
      } catch {
        return;
      }
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      root.classList.add("wsk-scroll-instant");
      target.scrollIntoView({ block: "start" });
      history.replaceState(history.state, "", location.pathname + location.search);
      window.requestAnimationFrame(() => root.classList.remove("wsk-scroll-instant"));
      if (link.classList.contains("wsk-skip-link")) {
        target.focus({ preventScroll: true });
      }
    },
    true,
  );
})();
