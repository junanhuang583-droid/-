import "./battlefield-layer.css";

const existing = document.querySelector<HTMLElement>("#battlefield-background");
if (!existing) {
  const layer = document.createElement("div");
  layer.id = "battlefield-background";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `
    <img
      src="./assets/battlefield/gothic-abyss.webp"
      alt=""
      draggable="false"
      decoding="async"
      fetchpriority="high"
    />
  `;
  document.body.prepend(layer);
}
