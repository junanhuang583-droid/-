import type { Keyword, MinionCardDefinition, TextEffect } from "../model/cards.js";

export interface ParsedMinionCard extends MinionCardDefinition {
  /** 保留整段原始记录，复杂卡暂时不强行结构化时仍不会丢信息。 */
  rawText: string;
}

const KEYWORD_MAP: Record<string, Keyword> = {
  快攻: "fast_attack",
  迅疾: "haste",
  嘲讽: "taunt",
  狂妄: "arrogance",
  亡语: "deathrattle",
  守护: "guard",
  "甲一": "armor_1",
  "甲二": "armor_2",
  吸血: "lifesteal",
  汲取: "drain",
  灵体: "spirit",
  隐匿: "stealth",
  侦察: "scout",
  必中: "sure_hit",
  必杀: "execution",
  沉睡: "sleep",
  冰冻: "freeze",
  石化: "petrify",
};

export function parseMinionCardsFromRecord(markdown: string): ParsedMinionCard[] {
  const matches = [...markdown.matchAll(/^(#{3,4})\s+([CT]\d{3})\s+(.+)$/gm)];

  return matches.map((match, index) => {
    const id = match[2] as `C${string}` | `T${string}`;
    const name = match[3]!.trim();
    const blockStart = (match.index ?? 0) + match[0].length;
    const blockEnd = matches[index + 1]?.index ?? markdown.length;
    const rawText = markdown.slice(blockStart, blockEnd).trim();

    const attributes = parseAttributes(rawText);
    const series = readBullet(rawText, "系列");
    const copies = parseCopies(readBullet(rawText, "数量"));
    const summonText = readBullet(rawText, id.startsWith("T") ? "产生方式" : "召唤");
    const statLine = findStatLine(rawText);
    const effects = parseEffects(rawText);
    const notes = [...rawText.matchAll(/^- 记录备注：(.+)$/gm)].map((m) => m[1]!.trim());

    return {
      id,
      name,
      type: id.startsWith("T") ? "token_minion" : "minion",
      ...(series ? { series } : {}),
      attributes,
      copies,
      health: statLine.health,
      attack: statLine.attack,
      healing: statLine.healing,
      summonText,
      effects,
      notes,
      rawText,
    };
  });
}

function readBullet(block: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`^- ${escaped}：(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function parseAttributes(block: string): string[] {
  const raw = readBullet(block, "属性");
  if (!raw || raw === "未单独确认。" || raw === "未提供") return [];
  return raw
    .replace(/[。.]$/, "")
    .split(/[、，,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseCopies(raw: string | null): number | null {
  if (!raw || raw.includes("未提供")) return null;
  const match = raw.match(/(\d+)\s*张/);
  return match ? Number(match[1]) : null;
}

function findStatLine(block: string): { health: number | null; attack: number | null; healing: number | null } {
  const line = block.match(/^- 生命：(.+)$/m)?.[1] ?? null;
  if (!line) return { health: null, attack: null, healing: null };

  const health = numberOrNull(line.match(/^([^；;]+)/)?.[1]);
  const attack = numberOrNull(line.match(/攻击：([^伤；;]+)/)?.[1]);
  const healing = numberOrNull(line.match(/治疗：([^（(；;]+)/)?.[1]);
  return { health, attack, healing };
}

function numberOrNull(value: string | undefined): number | null {
  if (!value || value.includes("未提供")) return null;
  const match = value.match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function parseEffects(block: string): TextEffect[] {
  const ignored = new Set(["系列", "属性", "生命", "数量", "召唤", "产生方式", "来源", "记录备注", "特殊血条属性", "特殊血总量"]);
  const effects: TextEffect[] = [];

  for (const match of block.matchAll(/^- ([^：\n]+)：(.+)$/gm)) {
    const label = match[1]!.trim();
    const text = match[2]!.trim();
    if (ignored.has(label)) continue;
    if (label === "效果") {
      const keywordName = text.replace(/[。.]$/, "").trim();
      const keyword = KEYWORD_MAP[keywordName];
      effects.push(keyword
        ? { text, implementation: "keyword", keyword }
        : { text, implementation: "raw" });
      continue;
    }

    const keyword = KEYWORD_MAP[label];
    effects.push(keyword
      ? { name: label, text, implementation: "keyword", keyword }
      : { name: label, text, implementation: "raw" });
  }

  return effects;
}
