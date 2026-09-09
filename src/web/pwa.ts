import "./pwa.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface StandaloneNavigator extends Navigator {
  standalone?: boolean;
}

interface LockableOrientation extends ScreenOrientation {
  lock?: (orientation: string) => Promise<void>;
}

let installPrompt: BeforeInstallPromptEvent | null = null;
let fullscreenButton: HTMLButtonElement | null = null;
let installButton: HTMLButtonElement | null = null;
let toastTimer: number | null = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as BeforeInstallPromptEvent;
  syncControls();
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  syncModeClasses();
  syncControls();
  showPwaToast("Card Game 已安装。以后从桌面图标打开会使用独立全屏模式。");
});

document.addEventListener("fullscreenchange", () => {
  syncModeClasses();
  syncControls();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountPwaControls, { once: true });
} else {
  mountPwaControls();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = new URL("./sw.js", window.location.href);
    void navigator.serviceWorker.register(swUrl).catch(() => {
      // PWA support is an enhancement. The game remains playable if registration fails.
    });
  });
}

function mountPwaControls(): void {
  if (document.querySelector("#pwa-controls")) return;

  const controls = document.createElement("div");
  controls.id = "pwa-controls";
  controls.className = "pwa-controls";
  controls.innerHTML = `
    <button id="fullscreen-toggle" class="pwa-control-button" type="button" aria-label="切换全屏">⛶ 全屏</button>
    <button id="install-app" class="pwa-control-button" type="button" aria-label="安装 Card Game">＋ 安装</button>
  `;
  document.body.append(controls);

  const toast = document.createElement("div");
  toast.id = "pwa-toast";
  toast.className = "pwa-toast";
  toast.setAttribute("role", "status");
  document.body.append(toast);

  fullscreenButton = document.querySelector<HTMLButtonElement>("#fullscreen-toggle");
  installButton = document.querySelector<HTMLButtonElement>("#install-app");

  fullscreenButton?.addEventListener("click", () => {
    void toggleFullscreen();
  });
  installButton?.addEventListener("click", () => {
    void installApp();
  });

  syncModeClasses();
  syncControls();
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) {
      showPwaToast("当前浏览器不允许网页主动进入全屏。可以使用“安装”后从桌面图标启动。");
      return;
    }

    await document.documentElement.requestFullscreen();
    await tryLockLandscape();
  } catch {
    showPwaToast("这次全屏请求被系统拦截了。再点一次“全屏”，或安装到桌面后启动。");
  }
}

async function tryLockLandscape(): Promise<void> {
  const orientation = screen.orientation as LockableOrientation | undefined;
  if (!orientation?.lock) return;
  try {
    await orientation.lock("landscape");
  } catch {
    // Some mobile browsers only allow orientation lock for installed PWAs.
  }
}

async function installApp(): Promise<void> {
  if (isStandaloneMode()) {
    showPwaToast("现在已经在独立应用模式中运行。");
    return;
  }

  if (!installPrompt) {
    showPwaToast("如果没有弹出安装框，请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。");
    return;
  }

  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  syncControls();
  if (choice.outcome === "accepted") {
    showPwaToast("安装完成后，从桌面 Card Game 图标启动即可脱离浏览器工具栏。");
  }
}

function syncModeClasses(): void {
  const standalone = isStandaloneMode();
  const fullscreen = Boolean(document.fullscreenElement) || window.matchMedia("(display-mode: fullscreen)").matches;
  document.body.classList.toggle("pwa-standalone", standalone);
  document.body.classList.toggle("is-fullscreen", fullscreen);
}

function syncControls(): void {
  const standalone = isStandaloneMode();
  const fullscreen = Boolean(document.fullscreenElement) || window.matchMedia("(display-mode: fullscreen)").matches;

  if (fullscreenButton) {
    fullscreenButton.textContent = fullscreen ? "退出全屏" : "⛶ 全屏";
    fullscreenButton.hidden = standalone && !document.fullscreenElement;
  }
  if (installButton) {
    installButton.hidden = standalone;
    installButton.classList.toggle("install-ready", installPrompt !== null);
  }
}

function isStandaloneMode(): boolean {
  const navigatorWithStandalone = navigator as StandaloneNavigator;
  return window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || navigatorWithStandalone.standalone === true;
}

function showPwaToast(message: string): void {
  const toast = document.querySelector<HTMLElement>("#pwa-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
    toastTimer = null;
  }, 3600);
}
