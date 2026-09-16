# Card Game execution contract

Read `docs/工程整改与开发总计划_v1.md` and the latest acceptance report before editing.

- The canonical card rules are `docs/卡牌游戏记录_v0.5.md`; do not invent unknown values, quantities, costs, timing, or balance.
- Only `src/core/commands.ts` and the single application GameStore may commit browser gameplay. Views collect intent and render snapshots; no localStorage round-trips, synthetic StorageEvents, log-parsed deathrattles, or duplicate death pipelines.
- Battlefield geometry is owned by `battlefield-geometry.ts`, `battlefield-layer.ts`, and `battlefield-layout.css`. Prototype skins are in the lower `legacy` cascade layer. Do not append `!important` patches or another global geometry stylesheet.
- The approved battlefield stays a complete image. CSS cannot substitute for stone-wall/environment artwork. Rejected 0-7.2B fake sockets must not return.
- Do not generate any image without explicit user image-generation authorization. Code authorization is not image authorization.
- Stop before map V2 remaster in this baseline batch. Later left deck and right mechanism must be designed together. Card back is final and must not be redesigned.
- Run `npm ci`, `npm run check`, `npx playwright install --with-deps chromium`, and `npm run test:browser` against the production build. Builds alone are not visual acceptance. Report exact test scope and failures.
- Never claim real phone/PWA installation testing based on CI viewport emulation or offline set_content diagnostics.
- Use an isolated branch, inspect diffs, preserve save compatibility and asset integrity, and merge only the tested source. Never force-push another worker's updates.
