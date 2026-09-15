# Stage 0-7.1 Approved UI Asset Contract

本目录记录 Stage 0-7.1 已批准并准备好的战场 UI 美术基准。

0-7.2 已开始运行时接入：**只有结束回合机关已替换为正式战场美术**。卡背与牌库仍保持未接入状态。

## Production payloads prepared in the current work session

| Asset | Prepared size | SHA-256 | Next integration stage |
| --- | ---: | --- | --- |
| card-back-final.webp | 768×1152 | 42cfd0869a5395816e0a8eccd6aed411414230b757f1be3964995a8d50a4e1aa | 0-7.3 |
| end-turn-device.webp | 721×360, alpha | dedff0552daac903a5c5a6e57c77dffb8e4c1e97affaca8c6c0cd98322b3e72e | 0-7.2 已接入 |
| reference/deck-holder-concept.webp | 656×700 | 9ff017b7bea223e1e0291b105e3853ebc21cda0e448a4c704728d8397c7a2de2 | 0-7.4 |

### Hard rules

1. 正式卡背不得重新生成、加字、改变中央徽记或恢复上下突出长尖角。
2. 结束回合机关不得改回网页按钮式大色块；必须保持“嵌在战场右侧结构中的机关”。
3. 牌库底座与动态卡层必须拆开。概念图中的卡堆不是一张固定贴图。
4. 大量牌只用四层视觉厚度抽象；最后四张才一张一张真实减少。
5. 这些资产不改变游戏规则，只改变表现层。


## 0-7.2 Runtime integration lock

- Production path: `src/web/assets/ui-stage07/end-turn-device.webp`
- The approved art is attached to the existing `#end-turn` button. The clickable control and its game event are preserved.
- Enabled, disabled, hover/focus, and pressed states use presentation-only CSS filters/transforms.
- No card-back, deck-holder, draw-animation, card-face, combat-rule, or PWA-control work is included in 0-7.2.


### Binary integrity guard

The production end-turn WebP is reconstructed by `scripts/materialize-stage07-ui.mjs`
from the eight `assets-source/ui-stage07/end-turn-device/partNN.txt` chunks before
both dev and production builds. The build fails if the output is not exactly
27486 bytes with SHA-256
`dedff0552daac903a5c5a6e57c77dffb8e4c1e97affaca8c6c0cd98322b3e72e`.
