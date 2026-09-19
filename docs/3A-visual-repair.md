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

Current authorization is R0 + R1 only. R2 motion/lighting, R3 handoff flow, R4 final acceptance and R5 publication are separate work packages. Existing rule/state/command ownership must not change.

The user does not need intermediate bundles or file deliveries, and will inspect the actual result after R5. Internal visual and regression checks still apply at each step. Do not merge or publish this branch before the repair is complete.
