# 3C: temporary legal summon placement guides

## Baseline and scope
- User accepted 3B for the current milestone and authorized completion of 3C.
- Main read from GitHub: `1ffc8abd4b79f2997fa5d615fb29b2fa8ce81584`.
- Source tree: `c29a2299dd9321a1a4512b5321d22e4bd66da10f`.
- Restored artifact 10628126865; independently recomputed SHA-256:
  `dd789912a1d48d6683b8512c04826f06446b766adda700de977a7d48faec2a59`.
  Extracted source ZIP with original file modes; tree matches exactly.
- New isolated branch `work/3c-summon-placement`; do not replace the accepted 3B.
- Only summon placement UI and the minimum shared legality seam. No 3D combat
  effects, new card rules, generated images, background changes, or global redesign.

## Implementation
The old drag class displayed all empty slots even for unsupported cards or after
the normal summon allowance had been consumed. Extract the existing preflight
validation verbatim into a read-only validator used by the original summon
command and the new options query. Preview never executes a speculative summon:
no health changes, deaths, random IDs or writes. Lethal health costs remain legal.
Sacrifice candidates are derived from valid sets using the same validator; the
existing picker and leftmost sacrificed-slot rule remain in charge of resolution.

Only legal direct slots receive temporary cool-colored corner guides. Hover
selects one warm-colored target with a release caption; no permanent circles or
fake environment slots are added. Legal sacrifice candidates receive distinct
child marks, with no empty slots advertised. Parent positions/sizes remain under
battlefield-layout.css, which restores compact idle rows after cancel or drop.

The existing swipe-to-view versus drag-to-play distinction is preserved. Merely
peeking does not advertise slots. Unsupported cards, full ordinary boards, used
summon allowance and insufficient sacrifices produce no misleading targets.
Native Enter/Space on a hand card selects legal slots; arrows move focus, Escape
returns to the card. Ordinary click/tap semantics are unchanged.

Pointer release reevaluates its actual coordinates and current rule legality,
not the last animation-frame target. Cancellation, lost capture, Escape, resize,
blur, hidden/pagehide, presentation locks and real session changes clear intent,
ghost and guide nodes. The actual command remains the final authority if state
changes between intent and commit. Existing sacrifice confirmation is retained;
closing it does not spend a summon or pay a cost.

## Validation and release gate
Added read-only/command equivalence, legality, lethal-cost and sacrifice tests;
full-browser checks cover sparse targets, idle/peek, hover, real drop, blocked
cases, final-release coordinates, lifecycle cleanup, keyboard and real cross-tab
updates. Existing two mobile native-touch drags, all-unit layout checks, 3A/3B
animations, save and offline regressions remain required.
The served-site checker additionally exercises native summon input at desktop
and small landscape sizes, asserts exact legal slots and one real command, and
archives idle/hover/settled screenshots. Run it before merge and after Pages.

Local source checking used available TypeScript and temporary Vite declarations
outside the repo. A complete source preview used unchanged assets with an inline
module loader and memory storage because local HTTP is blocked; these are
preparatory, not production evidence. Pinned npm installation is unavailable
locally (ENOTCACHED). Final acceptance must use repository CI, raw reports and
opened production screenshots. Record exact accepted/deployed SHA and counts on
the PR. No physical-device performance or user aesthetic approval is presumed.

## Final integration corrections
The initial CI passed all existing 3A/3B regressions and new direct-placement
cases, but exposed the existing sacrifice picker as unstyled ordinary document
content under the fixed hand dock. Its original selection/confirmation handler
now uses a scoped native dialog with focus and hit-test exclusion plus Escape
cancellation. Sacrifice costs, targets, deathrattles and landing are untouched.
A native held-key probe also found selection could chain into confirmation after
focus moved; repeated Enter/Space is now rejected while a target is selected.
Both behaviors have explicit browser regression checks; no failure is bypassed.

## Post-merge failure-injection isolation
The first main release gate (35630697264) did not deploy: all 20 new 3C cases
and 156 unit tests passed, but an older missing-card-back case saw 20 real
flights instead of zero. Its trace showed the service worker prefetching the
full card back successfully (HTTP 200), then fulfilling page requests despite
the page.route abort. The screenshot contained the successfully decoded backs.
This is failure-injection isolation, not a summon or draw rule regression.

Only that test now uses serviceWorkers: block. It additionally asserts that the
abort route actually ran and no worker controls the page. All original zero-
flight/private-hand/committed-card assertions remain. Real offline, cache-update
and normal published-site tests continue with workers enabled. No application,
asset, build, workflow, dependency or other test file changed in this correction.
Reference: Playwright's official page.route documentation notes that service
worker-intercepted requests bypass page routing and recommends blocking workers
for this kind of network mock (https://playwright.dev/docs/api/class-page#page-route).
