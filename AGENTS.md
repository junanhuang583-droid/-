# Card Game execution contract

Read `docs/工程整改与开发总计划_v1.md`, `docs/工程基线最终验收报告_v1.md`, the canonical record, and actual Git refs before editing. A recovery note or prior chat report is not evidence of the current deployment.

- Rules come from `docs/卡牌游戏记录_v0.5.md` and explicit user amendments. Never invent unknown values, quantities, costs, timing, or balance. Visible prototype cards are not necessarily executable.
- Browser gameplay enters `src/core/commands.ts` and the single application GameStore. Views collect intent and render snapshots; no UI-local damage/death pipeline, localStorage round-trip engine, synthetic StorageEvents, log-parsed deathrattles, or periodic rewrite loops.
- `battlefield-geometry.ts`, `battlefield-layer.ts`, and `battlefield-layout.css` own geometry. `gameplayGeometry` owns physical hero/unit clearances. Prototype skins stay in the lower `legacy` layer.
- Decorations may position their own children, never override parent card/minion geometry. Do not inject global parent position rules or append another `!important` layout patch. The old keyword injection caused diagonal minion rows despite green tests.
- Preserve the complete approved battlefield image. CSS is not stone-wall/environment artwork. Rejected 0-7.2B sockets and mirror-corner hacks must not return.
- Do not generate any image without explicit image-generation authorization. Code authorization is not image authorization. B0 stops before map V2. Later left deck and right mechanism are designed together; the approved card back is not redesigned.
- Run `npm ci`, `npm run check`, `npx playwright install --with-deps chromium`, and `npm run test:browser` against the production build. Verify every actual minion's row center, bounds, half, spacing, hero clearance, and hit target, plus 1-5 sparse rows and real touch drags. Testing only the first minion is insufficient.
- Open and inspect actual full-game screenshots. Builds, isolated button harnesses, and screenshot file existence do not establish visual acceptance. CI touch emulation is not physical Android/iOS PWA installation testing.
- Keep asset chunk materialization/checksums, visible art-failure fallback, save compatibility, and complete offline shells. Retain the previous exact hashed assets across HTTP 404 after updates; never return HTML as a missing script.
- Work on an isolated branch, inspect diffs, and merge only accepted source. Re-read main before a non-forced fast-forward/merge. Never overwrite another worker's changes.
- Deployment is not complete until the Pages sourceCommit and real published-browser checks match the delivered revision. Archive source, production bundle, raw results, screenshots and audit warnings. Never label untested scope as passed.
- Report current scope, exact pass/fail counts, source revision, evidence, deployment state, known limits and next stop. Read the total plan for the remaining rule/visual/PC roadmap; do not expand a single authorized task into multiple stages.
