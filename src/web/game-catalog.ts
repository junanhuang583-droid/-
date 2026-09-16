import cardRecord from "../../docs/卡牌游戏记录_v0.5.md?raw";
import { createCatalog } from "../core/basic-game.js";
import { parseMinionCardsFromRecord } from "../data/parse-card-record.js";

// A single parse for the active application. Views do not rebuild the catalog.
export const cards = parseMinionCardsFromRecord(cardRecord);
export const catalog = createCatalog(cards);
export const byId = catalog.cards;
