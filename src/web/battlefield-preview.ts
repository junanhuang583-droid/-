import "./battlefield-preview.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("缺少 #app 根节点");

document.documentElement.classList.add("battlefield-preview-mode");
document.body.className = "battlefield-preview-body";

root.innerHTML = `
  <main class="battlefield-only" aria-label="战场背景验收">
    <img
      class="battlefield-art"
      src="./assets/battlefield/gothic-abyss.webp"
      alt=""
      draggable="false"
      decoding="async"
      fetchpriority="high"
    />
  </main>
`;
