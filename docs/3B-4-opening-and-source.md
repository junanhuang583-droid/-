# 3B-4: opening/private intakes and last-card/refill flow

## Recovery and authorization
- Accepted starting HEAD: `246f65cc0ad1d6f95a868042020a9c3f3ee52bd3`.
- Source tree: `fa44b6dec2f56148b596eaabc292159f83533a7c`; restored source ZIP including modes recomputed exactly before editing.
- Evidence input: artifact `10610024626`, SHA-256 `18d9f48ff5610a8eb7f1c4cd4c5e37c5526e051d7add15ea742cf3fad9672670`.
- Continue on `work/3b-draw-receipts`, Draft PR #6. Main/Pages stay on the user-approved `73613575032a6a58f12597770a5d38bf5711a9de`.
- This package is 3B-4 only. Stop before 3B-5 combined acceptance and 3B-6 publication. No intermediate user bundles.

## Source continuity without delayed rules
`drawSequence` validates and projects the existing journal's actual ordered pop/refill facts. No new draws, shuffle, fatigue, grant rule or persistent hand identity is introduced. Zero-success results produce zero tasks. Grants are filtered from the deck path. Duplicate definitions retain separate receipt identities; inconsistent receipts fail closed cosmetically.

`DeckSourceView` mounts the existing deck/rim once, updates its numeric plaque from the authoritative snapshot, and holds only the still-to-be-extracted visual slices. Already-drawn last cards remain at the source during handoff instead of vanishing and spawning later from an empty well. The source lends its top to one departing sprite; physical exit releases it, moves to the next recorded pop, and restores the real final 4/3/2/1/0 abstraction when drained. The original `deckSlices` calculation is reused. No new background artwork or source-count rules are created.

A refill is represented at its actual recorded boundary before that pop. For one original card plus five recycled cards, five successful draws present source counts 1,5,4,3,2 and settle on one remaining card. The plaque stays at the committed value 1 throughout. There is no second debit, new random shuffle, invented receipt or large discard animation. Existing combined-discard refill remains an explicitly temporary gameplay rule.

## Opening and private receiving
Temporary face-down stacks sit beside the actual upper/lower heroes, measured with the existing authored-plane/gameplay geometry. Each incoming back reaches the matching stack's exact position, size and angle; the stationary back takes over in the same task. At most three backs depict each recipient's accumulated stack while counts report actual received/total cards. No private card name/definition enters these nodes, and no actual hand face is rendered before hot-seat reveal.

Opening follows journal order (P1 opening, P2 opening, then the first player's turn draw), rather than alternating receipt objects whose source facts are not alternating. Rules and card assignments are unchanged. The current 8+8+4 results use the existing stagger and exclusive extraction gate. The final stacks remain through the first handoff, then clear on successful reveal. The old generic private-hand strip is suppressed while these explicit intakes are present. A zero-card private hand does not render a fake single back.

Formal extra normal/super evolution-stone hand grants are still not implemented. The existing post-opening prototype injection goes into the shared deck, creates no draw/grant flights, and retains its original rule timing. No merchant or other unimplemented skill is added.

## Lifecycle / interaction
The 3B-3 continuous reveal-to-draw lock and real-slot landing remain intact. External/new-game/terminal state clears source leases, private opening receivers and hand presentation. Reload discards all visual receipts and renders saved authoritative counts; it never reconstructs or redeals old cards. Interruption or failed optional artwork settles committed private counts, cleans up source slices and allows the first reveal. No ghost layer can remain the source of a future draw.

Both pending-effect UI owners now wait for the presentation lock to release and recheck on view-render notifications. A real pending unit/control target picker is not rendered behind the invisible handoff modal or lost when animation finishes without another rule command. Rule target legality and commands are untouched.

## Required checks and evidence boundary
Added 10 unit cases for last-card source traces, recorded refill/shortfall, duplicate/corrupt receipts, grant separation and both private intake clearances. Added 12 full-game browser cases for both first-player orientations and key viewport sizes, last 0/1/2/4/5, real refill, reload while source cards wait, opening interruption, missing back artwork, and a real pending-effect picker after the optical handoff. Original 3A, exact hand landing, source occlusion, storage, touch and offline regressions remain required.

The local registry could not resolve and pinned package installation was unavailable. Provisional source checks used available TypeScript with temporary Vite declarations outside the repository. A full-application inline preview adapted module/asset URLs and in-memory storage because local HTTP navigation is blocked; desktop/mobile opening views, subsequent turns and last-card/refill paths ran without page errors. Those checks are preparatory only, not a substitute for locked-dependency production CI.

Record final CI counts, exact source tree and opened production full-game images on PR #6. No new deployment, physical-device performance, final whole-3B quality or user aesthetic acceptance is claimed at this checkpoint.
