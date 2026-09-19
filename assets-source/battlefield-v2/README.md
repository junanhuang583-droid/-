# Battlefield V2 production transport

The deployed V2 artwork is stored here as a checksum-verified base64 runtime pack so GitHub builds can reproduce the exact approved WebP assets without relying on lossy regeneration.

- `manifest.json` records every runtime asset's dimensions, byte length and SHA-256.
- `runtime-pack/part00.txt` ... `part11.txt` concatenate to one base64 stream.
- `scripts/materialize-v2.mjs` decodes that stream in manifest order and verifies every WebP before writing `public/assets/battlefield-v2/<version>/`.
- Small approved follow-up components may live under `extra/` as exact WebP source bytes. They must be declared with a `transport` path in `manifest.json`; the materializer verifies their byte length, SHA-256 and RIFF/WEBP container before copying them.
- The high-resolution editable/derivation source set remains in the Stage 2D handoff archive. It is not required to build or deploy the game.

Do not edit the pack manually. New art revisions must produce a new manifest version and a new verified pack.

## Stage 3A-1

`extra/turn-core-back.webp` is the approved 2B B3 flip-back panel. 3A-1 only registers, preloads and DOM-wires the back face. The visible control intentionally remains on the existing front face until the 3A-2 motion/state pass.
