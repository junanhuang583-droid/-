# 3A visual repair checkpoint

## R0: frozen baseline

- Baseline main: `3fe11131721008a4cf40b83723e7d93bdb362a9c`.
- Baseline source tree: `0f2900593502aa703644ff5955e2342ec9db8df9`.
- Repair branch: `work/3a-visual-repair`; no changes to main or Pages.
- Existing source archive from engineering artifact `10590521366` was restored and its complete Git tree matched the baseline tree exactly.
- Baseline production/screenshot evidence remains in Actions run `35462517211`. These are functional regression evidence, not approval of the animation's visual quality.
- Original approved B3 transport: `assets-source/battlefield-v2/extra/turn-core-back.webp`; SHA-256 `adcd3eb725ed3c15c15d18eec873f0102c56b87d7b70ddecb6c5a76f72e365af`.
- Original runtime-pack chunks, front/light textures, housing, card back, heroes and 1152x648 coordinate system remain unchanged.

## R1: registration and solid preparation

- Register the original B3 through its measured `(21,11,156,76)` pixel window. Only transparent margins are excluded. A clipped texture child performs the crop; no artwork is generated, re-encoded, repainted or distorted.
- Fit the cropped texture uniformly into the original core. Front/back widths match; their proportional height difference is under 0.5 world pixels, with exactly the same pivot. All approved binary hashes and cache URLs remain unchanged.
- Both faces are mounted on one thin-plate child, front/back separated by 3 world pixels, with eight narrow beveled edge planes. The front-facing surface rests on the original z=0 plane; thickness extends into the existing socket.
- Clipping stays on texture children. The solid owner is not clipped or filtered at rest. CSS hover/press brightness now belongs to individual surfaces, not their 3D ancestor.
- The old outer-carrier keyframes, disabled-light jump and handoff overlay are deliberately NOT redesigned here. R2 must replace the legacy filter/angle animation and complete lighting; R3 owns stable mounting and handoff sequencing.
- Added registration/unit tests and full-battlefield browser checks for source alpha bounds, aspect ratio, common pivot, static side depth, unchanged rim/hitbox and missing/corrupt artwork fallback.
- R1 static screenshots temporarily hide only the old handoff dialog for inspection. They are not final motion, privacy-flow or R3 acceptance. Production-build regression results and actual screenshot review must be recorded on the draft PR before declaring R1 complete.

## Scope and stop

Current authorization extends through R3 only. R4 final acceptance and R5 publication remain separate work packages. Existing rule/state/command ownership must not change.

The user does not need intermediate bundles or file deliveries, and will inspect the actual result after R5. Internal visual and regression checks still apply at each step. Do not merge or publish this branch before the repair is complete.


## R2: continuous motion and surface lighting

- Replaced the two-part outer-carrier flip with one physical plate rotation, 0 to 180 and 180 to 0. Both mounted textures and eight side planes remain on the same body. There is no image swap at the side pose.
- The carrier now only presses/seats in depth. A held pointer/Space press is sampled before the command; its depth continues into the rotation, rather than resetting/replaying. A cancelled outside release does not submit a rule command.
- Nominal outgoing duration is 380 ms (up to 60 take-up, 250 rotation, 70 seating); an already held press consumes no duplicate take-up and uses 320 ms. Reveal uses 320 ms without repeating the outgoing press.
- All motion and lighting tracks use the same timeline. Only surface children receive shade/sheen/opacity. The physical carrier and plate stay unfiltered, fully opaque and unclipped throughout rotation.
- Button disabled state no longer abruptly extinguishes the outgoing amber or changes the lettering color. The outgoing surface keeps its glow until facing away. The returning surface reaches its real ready/blocked brightness continuously; real draw locks remain respected, then readiness fades in over 120 ms.
- Artwork readiness is applied synchronously on render to avoid a one-frame fallback flash. Only optical pose/light crosses existing view renders; full stable mounting, board orientation and handoff UI redesign are still R3 work.
- Cancelled animations, hidden pages and reduced-motion changes discard only cosmetic work. Old node generations cannot complete against a newer view. No motion state enters saves. No rules, card values, image bytes, asset manifests, dependency versions or deployment workflows were changed.
- Updated implementation-coupled legacy tests to sample the named plate rotation rather than whichever carrier animation is returned first. Added pure trajectory checks and full-game optical, native press, cancellation, preference-change, real draw-lock and ten-turn unmodified playback checks.
- Local development checks use an offline full-application preview with asset URLs/in-memory storage adapted because this runtime cannot install npm packages or open local HTTP. They are preparatory only. Final locked-dependency production CI and its full-game screenshots must be reviewed before reporting R2 complete.
- No intermediate packages are delivered to the user. Main and Pages remain on the released baseline. Stop before R3.


## R3: stable public presentation and private hot-seat handoff

- R2 recovery commit: `cb2728b041348459cd0be09a3c01c8c1e0a349c1`. The source archive from its successful CI artifact was restored; its full tree matched `f4d5ed29056315373ac03ab3604253c72ab6fc41` before editing.
- The shell, design plane, background, end-turn button/core/plate/rim, public-view wrapper and hand dock are now mounted once. Dynamic regions update separately; unchanged markup is retained and handlers bind once. A public-view update cannot restart the plate's running timeline.
- Only the viewing player identity is transient. Ending a turn commits immediately but holds the previous public orientation during the outgoing flip and waiting phase. All values still render from the authoritative snapshot. On reveal, a 75 ms fade-out / 105 ms fade-in changes the public orientation at the invisible midpoint while the independent plate continues rotating.
- The old dark blurred handoff overlay is replaced by a compact native modal dialog with a fully transparent backdrop. The right-hand back face stays visible. Native modal exclusion blocks pointer and keyboard access to background UI; heading-first focus, repeat-key rejection, a focus loop and non-dismissable Escape prevent accidental next-player activation.
- Private hand-card DOM and hidden log details are removed synchronously at handoff start, not after animation. Gesture/inspector/special-preview/sacrifice UI owners receive one transient presentation-lock notification and clear their own state. Synthetic background interaction cannot bypass these UI guards. Private cards only return after successful reveal presentation or authoritative interruption recovery.
- Public side styling and control badges follow the presented orientation, not the prematurely advanced active player. The public units stay legible while inert. Rule state, targeting, commands, persistence, asset bytes, geometry, R2 motion parameters and deployment workflows are unchanged.
- External/new-game/terminal updates invalidate old presentation work and cancel residual flight nodes. Reload and reduced-motion interruption converge to the latest session without writing optical state or repeating commands.
- Added nine full-application browser checks: stable-node/clear-backdrop/private-hand checks at 1536x691 and 740x360; keyboard focus; same-task preview/gesture cleanup; shield bypass attempts; real cross-tab interruption; reload; reduced motion; and a real pending-effect picker after modal close.
- Development checks were performed in the adapted offline full-application preview because this runtime cannot install the pinned npm dependencies or open local HTTP. They are provisional; production CI results and actual full-game screenshots must be reviewed and recorded on PR #3 before declaring R3 complete.
- No intermediate user packages, 3B work, merge, or Pages publication. Stop before R4.
