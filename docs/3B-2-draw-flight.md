# 3B-2: one card leaving the real deck

## Baseline and limit
- Accepted 3B-1 head: `11b5898afaebeae2cab628470ec73c580f5a19ba`.
- Its restored source ZIP recomputed to tree `ed0ecddcdb914f1f844117bb9f0837ef1ca33d27`, preserving file modes.
- Source artifact `10608254777` SHA-256: `00b9d50da239e9ba393c7a77ba7b5aa624622bbc50d916f23b9272ffb5ca968c`.
- Work remains on `work/3b-draw-receipts`, Draft PR #6. Main stays `73613575032a6a58f12597770a5d38bf5711a9de`.
- Authorized: single-card projected birth, extraction, occlusion and flight. Stop before 3B-3. No merge, deployment, new image generation or intermediate user packages.

## Implementation
`draw-flight.ts` owns cosmetic geometry. It reads the existing manifest's baked deck quad and final-card aspect ratio. One projective surface starts at those exact four master-to-world corners, gradually becomes an upright full card, and follows a two-segment continuous-tangent curve to a private intake next to the receiving hero. The card never swaps image at the socket boundary; after extraction its aspect ratio stays uniform. The initial reference timing is 135 ms extraction plus 235 ms flight.

`DeckDrawMotion` owns only the short-lived sprite, tracks and decode/cleanup. Its stage is a world-sized child of the original deck, offset by the existing deck registration. It remains below the SAME original foreground rim throughout. There is no duplicate rim, sudden z-index switch or moving-node reparenting. When a static top slice exists it is temporarily borrowed/hidden, then restored after clearance; the rest of the abstract stack and authoritative numeric count are untouched. A committed last card can be represented even when there is no remaining static slice.

The flight uses the approved complete card back and a small alpha-derived shadow. No card-name/card-definition metadata is put on the face-down sprite. Existing receipt occurrence IDs remain the identity. Target geometry uses the existing world/screen transform. Targets are explicitly provisional private intakes, not claimed exact fan-card slots; 3B-3 owns exact landing, face reveal, old-hand rearrangement and batch stagger.

The existing opening pair calls are serialized by a single cosmetic source owner, preventing two cards appearing in the same source at once. This intentionally makes the temporary opening longer (about 20 times 370 ms, plus setup) until 3B-3 supplies overlapping/staggered choreography. Only that test's opening waits are given a 15-second bound; exact occurrence/count, no-replay and all turn checks remain. Reduced motion or an unavailable optional image skips the remaining cosmetic work and shows committed cards, without retrying any draw.

The flight now shares the world plane with its occluder. The old initial-deal shield keeps input exclusion and its existing status box, but its blanket dimming/blur is removed so the actual source remains visible. No other global layout or 3A style is changed.

Resize/fullscreen changes, visibility loss, pagehide, reduced-motion change, explicit cancellation, stale socket nodes and external/new-game cancellation clean up the stage, tracks and borrowed slice. Image decode is bounded; failure cannot leave a hidden top or an input lock. Main still owns the existing sequencing/operation locks, and the rule engine/receipt journal/queue/saves are not modified.

## Required acceptance
Eight pure geometry tests cover exact quad and ratio, projective four-corner mapping, clear exit, continuous velocity, post-exit aspect ratio, convexity, shared viewport conversion and invalid input.

Eight additional full-game browser cases cover both key sizes with actual PNG occlusion attribution, a normal-speed five-card observation, three interruption paths and two damaged optional assets. The pixel attribution chooses opaque decoded-rim pixels which the card crosses: hiding only the card must leave those pixels unchanged; hiding only the original rim must expose the card underneath. The same physical card/rim/3A nodes and committed card counts are checked. This is stronger than asserting a transform exists.

Full-game source pose, partly occluded, clear and flight screenshots must be opened. All existing 3A lower-rail/cavity, hot-seat/privacy, receipts, rule, layout, touch, storage and offline checks remain required.

## Development evidence versus final gate
The review environment cannot resolve npm/GitHub directly or navigate HTTP in its browser. Source-only strict checks used available TypeScript and temporary Vite declarations OUTSIDE the repository; native geometry assertions passed. Preparatory full-app viewing used inlined compiled modules, unchanged asset data and an in-memory storage adapter, not a served production build. Both 1536x691 and 740x360 were viewed. In this provisional preview the opaque-rim pixel delta with/without the underneath card was below 0.35/255, and hiding the rim exposed a difference over 45/255. These are not substituted for production CI.

Pinned-dependency production CI counts, actual served-build screenshot review and the exact accepted head are to be recorded on PR #6 after validation. No final 3B quality, exact hand landing, multi-card choreography, physical-device test or new online version is claimed by this package.
