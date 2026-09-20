# Follow-up: complete the moving back-panel lower edge

Baseline main: `ba420dc48e9513a5c363a37c03b34fda42a8a5a8` (tree `2a280bab6d40b7f68647afb58a5b4f30a52ec4df`). Branch: `fix/turn-back-complete-lower-edge`.

The user's enlarged screenshot disproves PR #4's claim of visual completion. That patch removed a stationary bronze stripe but did not repair the open lower edge in B3 itself, and its blue-edged donor still read as a raised strip. Do not repeat R1's already-solved transparent-margin diagnosis or move the whole battlefield.

Source inspection: in original `turn-core-back.webp`, pixels x65..132 on native row84 have alpha0. The two lower diagonal metal rails terminate with no connecting horizontal rail. This is already present in the decoded texture, with no CSS, fixed rim or background involved. A background-only cleanup cannot complete the moving silhouette.

Repair uses a small lossless restoration layer attached to B3, not another fixed cover. The missing lower rail is reconstructed from the same B3 straight upper metal rail, with only a bounded 78x8-pixel destination and a protected central emblem. See `back-lower-rail-repair.json` for exact donor, bounds and method. These are source-derived replacement pixels, not claimed recovery of unknown originals. The original approved B3 file is retained unchanged; all decoded pixels outside the bounded edit and the protected emblem remain identical. The moving-face view and loader bind the layer through one `TURN_BACK_RAIL_ASSET` constant. No second plate or fixed occluder is introduced. The original proportional crop, pivot, 3D body, timing and fixed latches remain unchanged.

The existing stationary cleanup texture is revised in place using more central cavity pixels to remove its copied bright-blue side edge. Its alpha mask, geometry and fixed-behind-control ownership remain unchanged; no second fixed cover is added. All original battlefield/front/light/rim binaries, rules, saves, layout and hot-seat behavior are untouched.

Acceptance adds source-alpha/protected-pixel tests, real full-page rendered-pixel comparisons at two viewports against the old incomplete B3, moving-vs-fixed ownership, and missing/corrupt derivative fallback. The release checker verifies the actual served new moving layer, opaque lower rail and moving-plate attachment as well as its existing normal-speed/hand-privacy checks. Full-game screenshots must be opened before publication; source pixel success alone is insufficient.

Preparatory full-app preview used the actual baseline production JS with inline asset/storage adaptation. Local Chromium HTTP navigation is administrator-blocked and pinned offline npm install failed ENOTCACHED; no claim of full local CI. Exact pinned-dependency CI and online smoke remain required. User requests a working final website, no intermediate artifact package. Stop after this fix, no 3B work. Record exact source, CI and publication checkpoint in the PR.
