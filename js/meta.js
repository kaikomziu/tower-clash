// ===== キャンペーンの永続データ(コイン・所持キャラ・ステージ進行・ガチャ天井) =====
"use strict";

const META_KEY = "towerclash_campaign_v1";

function metaDefault() {
  const owned = {};
  STARTER_CHARS.forEach((id) => (owned[id] = { rank: 1 }));
  return {
    coins: 300,
    owned,
    pity: 0,
    stageProgress: {}, // { [stageId]: { easy:true/false, normal:.., hard:.. } }
    loadout: STARTER_CHARS.slice(),
  };
}

function metaLoad() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return metaDefault();
    const data = JSON.parse(raw);
    const def = metaDefault();
    return Object.assign(def, data, { owned: Object.assign({}, def.owned, data.owned || {}) });
  } catch (e) {
    return metaDefault();
  }
}
function metaSave(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
}

const Meta = {
  data: metaLoad(),
  save() { metaSave(this.data); },

  isOwned(id) { return !!this.data.owned[id]; },
  rankOf(id) { return this.data.owned[id] ? this.data.owned[id].rank : 0; },

  isStageUnlocked(stageId) {
    if (stageId === 0) return true;
    const prev = this.data.stageProgress[stageId - 1];
    return !!(prev && (prev.easy || prev.normal || prev.hard));
  },
  isCleared(stageId, diffKey) {
    const p = this.data.stageProgress[stageId];
    return !!(p && p[diffKey]);
  },
  markCleared(stageId, diffKey) {
    if (!this.data.stageProgress[stageId]) this.data.stageProgress[stageId] = {};
    const first = !this.data.stageProgress[stageId][diffKey];
    this.data.stageProgress[stageId][diffKey] = true;
    this.save();
    return first;
  },

  addCoins(n) { this.data.coins = Math.max(0, this.data.coins + Math.round(n)); this.save(); },
  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n; this.save(); return true;
  },

  getLoadout() {
    const owned = Object.keys(this.data.owned);
    let lo = (this.data.loadout || []).filter((id) => owned.includes(id));
    if (lo.length === 0) lo = owned.slice(0, MAX_LOADOUT);
    return lo;
  },
  setLoadout(ids) { this.data.loadout = ids.slice(0, MAX_LOADOUT); this.save(); },

  // ガチャ1回分。結果 { id, isNew, rank, pityUsed, refund }
  pull() {
    const forcePity = this.data.pity >= GACHA_PITY_COUNT - 1;
    const id = gachaPickOne(forcePity);
    const rarity = CHAR_DEFS[id].rarity;
    if (rarity >= GACHA_PITY_RARITY) this.data.pity = 0; else this.data.pity++;

    const owned = this.data.owned[id];
    let isNew = false, refund = 0, rank;
    if (!owned) {
      this.data.owned[id] = { rank: 1 };
      isNew = true; rank = 1;
    } else if (owned.rank >= MAX_RANK) {
      refund = 40; this.addCoins(refund); rank = owned.rank;
    } else {
      owned.rank++; rank = owned.rank;
    }
    this.save();
    return { id, isNew, rank, refund, rarity };
  },

  pullOnce() {
    if (!this.spendCoins(GACHA_COST_SINGLE)) return null;
    return this.pull();
  },
  pullTen() {
    if (!this.spendCoins(GACHA_COST_TEN)) return null;
    const results = [];
    for (let i = 0; i < 10; i++) results.push(this.pull());
    return results;
  },
};
