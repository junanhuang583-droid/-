# 3B-3: exact hand landing and staggered batches

## Baseline / authorized stop
- Starting head: `4a64e09e24010c5d9c040b9818ded9fa2a6b07c5`; source tree `0e946038d55b6f73e3a6446502c960e31b3ae9bf`.
- Recovered artifact `10610256740`, SHA-256 `32e33be97e0416d96279bc3d958266727ce1c77f2281f5784db1e62fc02f9a87`; complete source ZIP tree recomputed before edits.
- Continue on `work/3b-draw-receipts`, Draft PR #6. Main remains the approved `73613575032a6a58f12597770a5d38bf5711a9de`.
- Authorization ends at 3B-3. No merge/Pages deployment, new artwork, 3B-4 rule/source expansion, or user package delivery.

## Implemented
- Extracted the unchanged fan calculation into `application/hand-fan.ts`, used by the existing hand UI and draw presentation. Static widths, overlaps, angles, drop, z-order and default collapsed/expanded behavior are preserved. There is no second set of guessed landing coordinates.
- Hand rendering retains actual buttons when receipts append cards or a batch unlocks. The private hand path invalidates its render cache and removes faces synchronously as before. Receipt IDs identify incoming occurrences; slot binding validates index/recipient/definition, rather than searching by definition and merging duplicates. Stale bindings skip cosmetic playback instead of revealing an unrelated card.
- A batch reserves its final fan immediately. Existing cards make room once over 180 ms; each new front stays hidden, inert and absent from the accessibility tree until its individual handoff. Incremental reveals do not rerender/restart the whole hand or the 3A mechanism.
- Each incoming card targets the measured center, angle and physical height of its actual button in the authored world plane. The approved back retains its native aspect ratio. The current prototype front has a different width/height ratio, so the 55 ms back fold and 65 ms actual-front unfold meet edge-on at a shared height/center/angle; the back is not stretched or swapped while face-on. The same real front remains after animation and unlock; no duplicated card face component or final all-at-once repaint.
- Hand-bound travel bends below the hero before crossing into the final slot. Initial local inspection caught a straight path intersecting the portrait; the added continuous-tangent route avoids it without moving the portrait, hand or deck. Existing single-card source quad, extraction and real-rim occlusion remain intact.
- One batch may have up to three flying/landing cards. Starts are spaced by at least 165 ms and ALSO wait for the actual previous extraction to clear the rim; a paused extraction cannot be bypassed by a wall-clock timer. Nominal five-card sequence is about 1.15 seconds (135+235+120 ms per card, staggered). Timings are cosmetic, not rule timings or hardware performance guarantees.
- Opening uses the same bounded stagger for its existing 8+8+4 private requests instead of twenty serial flights. Opening targets remain private intakes; the broader opening/source/last-deck refinements are 3B-4, not claimed final here.
- Draw lock remains continuous between reveal and the first flight. New/old cards cannot be played during the batch, including the brief gap before the first sprite. Reduced motion, unavailable art, resize, visibility loss, pagehide, external/new-game state and explicit animation cancellation discard only presentation and reveal the authoritative hand; stale callbacks cannot change the replacement hand.

## Checks
New unit checks cover original fan outputs/long hands, duplicate/stale receipt binding, stagger/extraction bounds, and the below-hero continuous route. New browser checks cover desktop/mobile normal-speed actual slot identity, intermediate per-card reveal, one old-hand reflow, bounded overlap/exclusive extraction, empty and long hands, paused extraction, cancellation during the real front unfold, real cross-tab interruption and consecutive batches.

The original 3B-2 pixel attribution still checks the same physical rim. Its deterministic diagnostic now selects the first card/stage in a staggered batch; the maximum-one assertion becomes maximum-one-extracting plus maximum-three-active, without weakening source registration/occlusion or card-count checks. The earlier 3A draw-lock test accepts a visible first sprite rather than incorrectly requiring the new batch to remain serial.

## Evidence boundary
Pinned npm packages were not cached; `npm ci --offline` failed ENOTCACHED and the runtime cannot resolve the registry. Source-only strict checks use available TypeScript 5.8.3 with temporary Vite declarations outside the repository. A full-app inline browser preview uses the current source, unchanged images and an explicit in-memory storage adapter because HTTP navigation is blocked. Preliminary normal-speed previews at 1536x691/740x360 observed five individual arrivals, three maximum active cards, center error below 0.01 screen pixel and no hero intersection. This is preparatory, not production CI evidence or physical-device performance.

Before completion, require the repository's pinned typecheck/build/full browser regression, four-viewport deployment rehearsal and 3A motion checks, then open actual full-game screenshots/normal-speed recordings from that build. Record exact counts, source tree, run and observed limits on PR #6. Do not label intermediate opening/source work as 3B-4/5/6 completion.
