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
  hideInstallHelp();
  showPwaToast("Card Game 已安装。请从桌面 Card Game 图标启动独立模式。");
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
      // PWA support is optional. The browser game remains usable if registration fails.
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
    <button id="install-app" class="pwa-control-button" type="button" aria-label="安装 Card Game">安装方法</button>
  `;
  document.body.append(controls);

  const toast = document.createElement("div");
  toast.id = "pwa-toast";
  toast.className = "pwa-toast";
  toast.setAttribute("role", "status");
  document.body.append(toast);

  const help = document.createElement("div");
  help.id = "pwa-install-help";
  help.className = "pwa-install-help";
  help.hidden = true;
  help.innerHTML = `
    <div class="pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <button class="pwa-install-close" type="button" data-close-install aria-label="关闭">×</button>
      <span class="pwa-install-kicker">Card Game 应用模式</span>
      <h2 id="pwa-install-title">安装到手机桌面</h2>
      <p>安装成功后，桌面会出现 <strong>Card Game</strong> 图标。以后从这个图标启动，才会使用独立应用窗口并尽量隐藏浏览器工具栏。</p>
      <div class="pwa-install-steps">
        <span>1</span><p>打开当前浏览器的菜单或工具箱。</p>
        <span>2</span><p>选择“安装应用”“添加到主屏幕”或名称相近的选项。</p>
        <span>3</span><p>确认后回到桌面，从 Card Game 图标重新打开。</p>
      </div>
      <p class="pwa-install-note">如果浏览器支持网页内直接安装，这个按钮会自动改成“＋ 安装”，点击后直接出现系统安装框。</p>
      <button class="pwa-install-done" type="button" data-close-install>知道了</button>
    </div>
  `;
  document.body.append(help);

  fullscreenButton = document.querySelector<HTMLButtonElement>("#fullscreen-toggle");
  installButton = document.querySelector<HTMLButtonElement>("#install-app");

  fullscreenButton?.addEventListener("click", () => {
    void toggleFullscreen();
  });
  installButton?.addEventListener("click", () => {
    void installApp();
  });
  help.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target === help || target?.closest("[data-close-install]")) hideInstallHelp();
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
      showPwaToast("当前浏览器不允许网页主动进入全屏。可以安装到桌面后从 Card Game 图标启动。");
      return;
    }

    await document.documentElement.requestFullscreen();
    await tryLockLandscape();
  } catch {
    showPwaToast("这次全屏请求被系统拦截了。可以再点一次，或安装到桌面后启动。");
  }
}

async function tryLockLandscape(): Promise<void> {
  const orientation = screen.orientation as LockableOrientation | undefined;
  if (!orientation?.lock) return;
  try {
    await orientation.lock("landscape");
  } catch {
    // Some browsers only allow orientation lock for installed applications.
  }
}

async function installApp(): Promise<void> {
  if (isStandaloneMode()) {
    showPwaToast("现在已经在 Card Game 独立应用模式中运行。");
    return;
  }

  if (!installPrompt) {
    showInstallHelp();
    return;
  }

  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  syncControls();
  if (choice.outcome === "accepted") {
    showPwaToast("安装完成后，请从桌面 Card Game 图标重新启动。");
  } else {
    showPwaToast("已取消安装。需要时可以再次使用安装入口。");
  }
}

function showInstallHelp(): void {
  const help = document.querySelector<HTMLElement>("#pwa-install-help");
  if (help) help.hidden = false;
}

function hideInstallHelp(): void {
  const help = document.querySelector<HTMLElement>("#pwa-install-help");
  if (help) help.hidden = true;
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
    installButton.textContent = installPrompt ? "＋ 安装" : "安装方法";
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
  }, 4200);
}
