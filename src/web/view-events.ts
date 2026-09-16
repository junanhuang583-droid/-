type Decorator = { priority: number; run: () => void };
const decorators: Decorator[] = [];
let frame = 0;
export function onViewRendered(run: () => void, priority = 50): void {
  decorators.push({ priority, run });
  publishViewRendered();
}
export function publishViewRendered(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    for (const entry of [...decorators].sort((a, b) => a.priority - b.priority)) entry.run();
  });
}
