# 3B-5 / 3B-6 final acceptance and publication

The user explicitly authorized 3B-5 combined acceptance and 3B-6 publication.
This supersedes the earlier checkpoint's stop-before-3B-5 restriction. No 3C or
additional card rules are authorized. Deliver the verified site, not intermediate packages.

## Frozen inputs
- Main / user-approved 3A: `73613575032a6a58f12597770a5d38bf5711a9de`.
- Accepted 3B-4 head: `8eacc63f2183ed7d06a27e52cf6848b31b506812`.
- Exact source tree: `20aa7a283a4db1eba1c417a50d451bc958f1fc61`.
- Archive `10627076510` SHA-256 verified as
  `1c24407341e9e07d685e5eaf10d9cf058b76307b130c5a2b489e1fbc49bd5132`.
  Source ZIP restored with file modes; recomputed tree matches the above.
- Branch `work/3b-draw-receipts`, PR #6; reread refs before publication.

## Combined acceptance additions
The real published checker now runs normal-speed opening, five-card mixed-type
hand landing, a subsequent four-card normal turn, last-card and actual refill
scenarios at 1536x691 and 740x360. It observes DOM/animation activity passively,
without patched timing, seeking, synthetic game events, or replacement storage.
Only the isolated acceptance browser is seeded between scenarios. Video, full
battlefield screenshots, source/recipient observations, exact card counts,
individual front content and sourceCommit are archived in `draw-results.json`.
The same checker runs on the served production bundle before merge and on the
actual Pages URL after deployment. A successful rehearsal is not a website release.

Nine browser cases add mixed minion/prototype-special fronts in both key sizes,
actual touch play of a just-landed card, a suspended-first-frame lifecycle gap,
reload/pagehide/portrait-return during front unfolding, disk failure/recovery,
and a real offline mixed-type draw/reload. Lifecycle suspension is explicitly
emulated, not physical phone testing. Original 3A optics, exact source occlusion,
hand-slot geometry, long hands, receipts, rules and cache-upgrade regressions remain.

## Narrow corrections found during the final review
The old special-card decorator returned immediately on any presentation lock.
That wrongly deferred its existing visual face until after the whole draw batch;
a newly drawn X001/A001 could unfold as a raw identifier then repaint on unlock.
It now decorates actual non-private hidden hand slots while keeping all input and
previews locked. Its unchanged content is cached, so the same rendered front
remains through arrival and unlock. No prototype special effect becomes executable.

The target-layout barrier used an unowned requestAnimationFrame promise. A page
could stop rendering just before the first flight, leaving no active motion for
cancellation to resolve. The barrier now shares the deck presenter's abort lifetime
and checks document visibility. Pagehide/resize/media changes can settle that wait
without requiring a future animation frame or touching the committed hand.

No approved assets, 3A geometry/rail/cavity repairs, rule balance, receipt/store
semantics, save schema, dependencies or workflow permissions are changed. Existing
moderate development dependency audit findings remain separately recorded.

## Completion gate
Record final CI counts, exact accepted source/tree, screenshot/video review and
main checks on PR #6. Merge only the accepted head with expected-head protection;
then require verify, build, deploy and online smoke with matching sourceCommit,
including the new normal-speed draw checks. Recheck main after publication.
Final user aesthetic acceptance and physical-device performance are not presumed.

The review container lacks uncached pinned npm packages and cannot directly
navigate local HTTP/file pages. Any source-only or inline-adapted preview checks
are provisional. The pinned CI, actual production recordings and raw reports are
the final acceptance source. No deployment is claimed by this document alone.
