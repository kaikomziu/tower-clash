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
    daily: null, // ensureDaily()で日付が変わるたびに生成し直す
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

  // オンライン対戦へ送る自分の編成データ(通信用の軽量な形)
  buildLoadoutPayload() {
    return this.getLoadout().map((id) => ({ id, rank: this.rankOf(id) }));
  },

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
    this.trackMission("gacha", 1);
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

  // ===== デイリー(日付が変わると自動リセット) =====
  ensureDaily() {
    const today = todayStr();
    if (!this.data.daily) {
      this.data.daily = { date: null, bonusClaimed: false, bonusStreak: 0, lastClaimDate: null, missions: [], dailyStageClearedDate: null };
    }
    const d = this.data.daily;
    if (d.date !== today) {
      d.date = today;
      d.bonusClaimed = false;
      d.missions = generateDailyMissions();
      if (d.lastClaimDate && daysBetween(d.lastClaimDate, today) > 1) d.bonusStreak = 0;
      this.save();
    }
  },

  // デイリーボーナス受け取り。結果 { streak, reward } / 受け取り済みならnull
  claimDailyBonus() {
    this.ensureDaily();
    const d = this.data.daily;
    if (d.bonusClaimed) return null;
    d.bonusStreak = (d.bonusStreak % DAILY_BONUS_TABLE.length) + 1;
    const reward = DAILY_BONUS_TABLE[(d.bonusStreak - 1) % DAILY_BONUS_TABLE.length];
    d.bonusClaimed = true;
    d.lastClaimDate = todayStr();
    this.addCoins(reward);
    this.save();
    return { streak: d.bonusStreak, reward };
  },

  trackMission(type, amount) {
    this.ensureDaily();
    let changed = false;
    this.data.daily.missions.forEach((m) => {
      if (m.type === type && !m.claimed && m.progress < m.target) {
        m.progress = Math.min(m.target, m.progress + amount);
        changed = true;
      }
    });
    if (changed) this.save();
  },
  claimMission(idx) {
    this.ensureDaily();
    const m = this.data.daily.missions[idx];
    if (!m || m.claimed || m.progress < m.target) return null;
    m.claimed = true;
    this.addCoins(m.reward);
    this.save();
    return m.reward;
  },
  hasClaimableMission() {
    this.ensureDaily();
    return this.data.daily.missions.some((m) => !m.claimed && m.progress >= m.target);
  },

  getDailyStage() {
    this.ensureDaily();
    return STAGES[dayIndexToday() % STAGES.length];
  },
  isDailyStageClearedToday() {
    this.ensureDaily();
    return this.data.daily.dailyStageClearedDate === todayStr();
  },
  // 本日まだ受け取っていなければtrueを返し、受け取り済みにする(コイン加算は呼び出し側でまとめて行う)
  claimDailyStageReward() {
    this.ensureDaily();
    if (this.isDailyStageClearedToday()) return false;
    this.data.daily.dailyStageClearedDate = todayStr();
    this.save();
    return true;
  },
};

// 通信で受け取った相手の編成データ([{id,rank}]) から、TowerClashSimに渡せるcharDefsマップを作る
function defsFromLoadoutPayload(list) {
  const out = {};
  (list || []).forEach(({ id, rank }) => { out[id] = effectiveCharDef(id, rank); });
  return out;
}
