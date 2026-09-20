# End-turn lower socket residue correction

Baseline: main `1e908ae57851b30070235a5b3fe825f11c59efcc`, accepted R4 tree `7e70aca2fbb2b731b82eaa0974e2a6d43f6cae4c`.

The user's screenshot points to the lower edge of the RIGHT end-turn device, not the viewport bottom or hero placement. R1 transparent-margin registration is already present. Do not repeat that obsolete diagnosis or overwrite R1-R5 with an old artifact.

Layer attribution on the current build: hiding the physical plate leaves the brown/gold lower line in place; hiding the background removes it. The strip is residual face-bevel artwork in the fixed background, below the rotating core. It is not a rule, timing or whole-world alignment error.

Repair: a small alpha-masked cavity-texture derivative covers only that residual strip. It samples existing empty-slot texture without generative art or mirrored environment corners. Exact source, mask, crop and output hash are in `assets-source/battlefield-v2/lower-socket-repair.json`. Original approved background, front, light, B3, rim and pack bytes stay unchanged. Existing core/input geometry and all R2/R3 motion/privacy code stay unchanged.

The repair is an image sibling behind the control, mounted once through the existing view event. It cannot intercept clicks or rotate with the plate. Loading failure retains the original slot without a broken icon or game lock. A new manifest version includes the checksum-verified extension in the normal materializer and offline shell.

New regression: 3 integrity/geometry unit cases and 5 browser cases. The two main viewport cases compare actual served-page PNG pixels with a diagnostic frame hiding ONLY the repair, proving the stationary bronze stripe is removed and out-of-scope pixels are unchanged. Additional checks cover fixed-vs-moving layer identity and missing/corrupt optional texture handling. All pre-existing tests, full-game visual checks and online publication gates remain required.

Preparatory inspection used the actual baseline bundle with offline asset/storage adaptations because this review container cannot navigate local HTTP or install uncached pinned packages. That is not final production evidence. Record actual CI results, visual inspection and deployed sourceCommit on the PR before reporting completion. No intermediate user packages, no 3B, no global layout change.
