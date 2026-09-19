# 3A visual repair checkpoint

## R0: frozen baseline

- Baseline main: `3fe11131721008a4cf40b83723e7d93bdb362a9c`.
- Baseline source tree: `0f2900593502aa703644ff5955e2342ec9db8df9`.
- Repair branch: `work/3a-visual-repair`; no changes to main or Pages.
- Existing source archive from engineering artifact `10590521366` was restored and its complete Git tree matched the baseline tree exactly.
- Baseline production/screenshot evidence remains in Actions run `35462517211`. These are functional regression evidence, not approval of the animation's visual quality.
- Original approved B3 transport: `assets-source/battlefield-v2/extra/turn-core-back.webp`; SHA-256 `adcd3eb725ed3c15c15d18eec873f0102c56b87d7b70ddecb6c5a76f72e365af`.
- Original runtime-pack chunks, front/light textures, housing, card back, heroes and 1152x648 coordinate system remain unchanged.

## Scope and stop

Current authorization is R0 + R1 only: register both faces against one pivot and prepare a thin-plate structure. R2 motion/lighting, R3 handoff flow, R4 final acceptance and R5 publication are separate work packages. Existing rule/state/command ownership must not change.

The user does not need intermediate bundles or file deliveries, and will inspect the actual result after R5. Internal visual and regression checks still apply at each step. Do not merge or publish this branch before the repair is complete.
