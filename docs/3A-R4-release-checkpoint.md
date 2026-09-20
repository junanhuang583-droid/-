# 3A-R4 / R5 release checkpoint

This checkpoint supersedes the earlier "stop before R4" scope in `3A-visual-repair.md`. The user authorized final combined acceptance and publication, with visual feedback on the website after R5; no intermediate package delivery is requested.

## Input and immutable baseline
- R3 head: `c94eb5fc7e86a961625a041432d7e55459e3921c`.
- R3 tree: `7df0e3677b00bd7d24f7b473c10d3033a1ca63d6`; matched the restored full source archive.
- Main baseline: `3fe11131721008a4cf40b83723e7d93bdb362a9c`.
- Branch: `work/3a-visual-repair`, PR #3.

## R4 added acceptance
Eight full-browser cases cover two long-hand/full-board viewports, native repeated touch input, both directions of visibility-event interruption, failed disk persistence with successful in-memory handoff and recovery, and missing/corrupt art during normal motion. Visibility events are explicitly emulated; they do not claim physical phone suspension coverage.

The existing four-viewport published checker now additionally runs normal-speed motion checks on the actually served bundle at 1536x691 and 740x360, recording video and requestAnimationFrame samples. No animation is paused, sought or slowed in this release check. It verifies real intermediate rotation, monotonic progress, fixed geometry, stable nodes, outgoing amber continuity, no face-up hand during motion, transparent handoff, correct viewing direction, exact-once command commit and preserved card counts. The same checker runs before deployment and against the real Pages URL afterward.

This package changes acceptance scripts/tests only, not artwork, rule state, R2 motion parameters, handoff code or dependencies. All existing rule/layout/touch/offline/cache coverage remains required. Actual CI screenshots and recorded frames must be inspected, not inferred from test counts.

## Release gate and evidence
Final CI counts, exact source/merge SHA, run IDs and actual screenshot/video findings are recorded on PR #3 after the jobs finish. Before merge, reread main/head and reject concurrent changes. R5 must complete verify, build, deploy and online smoke, including matching sourceCommit; a successful local rehearsal is not an online release.

No 3B work. No physical-device installation or final user visual approval is claimed by automation. Existing dependency-audit warnings remain separate from game acceptance. Keep all internal evidence in Actions; deliver only the verified website and brief status to the user.
