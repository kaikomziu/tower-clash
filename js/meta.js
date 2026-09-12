// ===== キャンペーンの永続データ(コイン・所持キャラ・ステージ進行・ガチャ天井) =====
"use strict";

const META_KEY = "towerclash_campaign_v1";

function metaDefault() {
  const owned = {};
  STARTER_CHARS.forEach((id) => (owned[id] = { rank: 1, level: 1, xp: 0 }));
  return {
    coins: 300,
    owned,
    pity: 0,
    stageProgress: {}, // { [stageId]: { easy:true/false, normal:.., hard:.. } }
    loadout: STARTER_CHARS.slice(),
    presets: [null, null, null], // 編成プリセット3枠、それぞれキャラID配列 or null
    items: {}, // { itemId: 所持数 }
    equipped: {}, // { charId: itemId }
    daily: null, // ensureDaily()で日付が変わるたびに生成し直す
    achievements: {}, // { [achievementId]: true }
    currentTitle: null, // 装備中の称号(実績IDを流用。nullなら「指揮官」)
    playerLevel: 1, playerXp: 0, // 指揮官レベル(コイン獲得のたびに経験値が入る)
    rankingName: "", // 世界ランキング登録時の表示名(端末に保存、次回登録時にも使い回す)
    stats: { // 実績判定に使う累計スタッツ
      stagesCleared: 0, dailyStageClears: 0, gachaPulls: 0, towersPlaced: 0,
      enemiesKilled: 0, wavesCleared: 0, coinsEarnedTotal: 0, levelUpsBought: 0,
      loginDays: 0, onlineWins: 0, dailyBonusClaims: 0, dailyMissionsClaimed: 0,
      totalPowerPeak: 0, endlessRuns: 0, endlessBestWave: 0, bossRushClears: 0,
    },
  };
}

function metaLoad() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return metaDefault();
    const data = JSON.parse(raw);
    const def = metaDefault();
    return Object.assign(def, data, {
      owned: Object.assign({}, def.owned, data.owned || {}),
      stats: Object.assign({}, def.stats, data.stats || {}),
      achievements: Object.assign({}, def.achievements, data.achievements || {}),
      items: Object.assign({}, def.items, data.items || {}),
      equipped: Object.assign({}, def.equipped, data.equipped || {}),
    });
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
  // レベルは戦闘中だけのLv1-3(タワーの一時強化)とは別物の永続値。コイン購入・試合終了時のXPで上昇
  levelOf(id) { return this.data.owned[id] ? (this.data.owned[id].level || 1) : 0; },
  xpOf(id) { return this.data.owned[id] ? (this.data.owned[id].xp || 0) : 0; },

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

  pendingLevelUps: [], // 表示待ちの指揮官レベルアップ通知(非永続、drainPendingLevelUpsで取り出す)

  addCoins(n) {
    const rounded = Math.round(n);
    this.data.coins = Math.max(0, this.data.coins + rounded);
    if (rounded > 0) {
      this.trackStat("coinsEarnedTotal", rounded);
      this.grantPlayerXp(Math.round(rounded * PLAYER_XP_RATE));
    }
    this.save();
  },
  // 指揮官レベルの経験値付与。コイン加算のたびに自動で呼ばれる(addCoins自体は呼ばない: 無限ループ回避)
  grantPlayerXp(amount) {
    if (amount <= 0) return;
    if (this.data.playerLevel === undefined) this.data.playerLevel = 1;
    if (this.data.playerXp === undefined) this.data.playerXp = 0;
    this.data.playerXp += amount;
    while (this.data.playerXp >= playerXpToNext(this.data.playerLevel)) {
      this.data.playerXp -= playerXpToNext(this.data.playerLevel);
      this.data.playerLevel++;
      this.data.coins += playerLevelUpReward(this.data.playerLevel);
      this.pendingLevelUps.push(this.data.playerLevel);
    }
  },
  drainPendingLevelUps() {
    const list = this.pendingLevelUps;
    this.pendingLevelUps = [];
    return list;
  },

  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n; this.save(); return true;
  },

  // ===== 実績(トロフィー) =====
  trackStat(key, amount) {
    if (!this.data.stats) this.data.stats = metaDefault().stats;
    this.data.stats[key] = (this.data.stats[key] || 0) + amount;
  },
  updatePowerPeak(current) {
    if (!this.data.stats) this.data.stats = metaDefault().stats;
    if (current > (this.data.stats.totalPowerPeak || 0)) { this.data.stats.totalPowerPeak = current; this.save(); }
  },
  updateEndlessBestWave(wave) {
    if (!this.data.stats) this.data.stats = metaDefault().stats;
    if (wave > (this.data.stats.endlessBestWave || 0)) { this.data.stats.endlessBestWave = wave; this.save(); }
  },
  // 未解除の実績のうち条件を満たしたものを解除し、報酬コインを付与。新規解除の配列を返す
  checkAchievements() {
    if (!this.data.achievements) this.data.achievements = {};
    const newly = [];
    ACHIEVEMENTS.forEach((a) => {
      if (this.data.achievements[a.id]) return;
      if (a.check(this.data.stats, this.data)) {
        this.data.achievements[a.id] = true;
        newly.push(a);
      }
    });
    if (newly.length) {
      this.save();
      newly.forEach((a) => this.addCoins(a.reward));
    }
    return newly;
  },
  achievementProgress() {
    return { unlocked: Object.keys(this.data.achievements || {}).length, total: ACHIEVEMENT_TOTAL_COUNT };
  },

  // ===== 称号(解除済み実績の名前を装備できる) =====
  setTitle(achievementId) {
    if (achievementId !== null && !this.data.achievements[achievementId]) return false;
    this.data.currentTitle = achievementId;
    this.save();
    return true;
  },
  getTitleText() {
    if (!this.data.currentTitle) return "指揮官";
    const a = ACHIEVEMENTS.find((x) => x.id === this.data.currentTitle);
    return a ? a.name : "指揮官";
  },

  getLoadout() {
    const owned = Object.keys(this.data.owned);
    let lo = (this.data.loadout || []).filter((id) => owned.includes(id));
    if (lo.length === 0) lo = owned.slice(0, MAX_LOADOUT);
    return lo;
  },
  setLoadout(ids) { this.data.loadout = ids.slice(0, MAX_LOADOUT); this.save(); },

  // ===== 編成プリセット(3枠) =====
  savePreset(slot, ids) {
    if (!this.data.presets) this.data.presets = [null, null, null];
    this.data.presets[slot] = ids.slice(0, MAX_LOADOUT);
    this.save();
  },
  loadPresetIds(slot) {
    const p = (this.data.presets || [])[slot];
    if (!p) return null;
    return p.filter((id) => this.isOwned(id));
  },

  // ===== 装備アイテム(ステージクリアでドロップ、キャラ1体につき1個まで装備) =====
  addItem(itemId, count) {
    if (!this.data.items) this.data.items = {};
    this.data.items[itemId] = (this.data.items[itemId] || 0) + (count || 1);
    this.save();
  },
  itemCount(itemId) { return (this.data.items && this.data.items[itemId]) || 0; },
  equippedOf(charId) { return (this.data.equipped && this.data.equipped[charId]) || null; },
  equipItem(charId, itemId) {
    if (!this.isOwned(charId) || this.itemCount(itemId) <= 0) return false;
    const prev = this.equippedOf(charId);
    if (prev === itemId) return true;
    if (prev) this.addItem(prev, 1); // 既存装備を在庫へ戻す
    this.data.items[itemId] -= 1;
    if (!this.data.equipped) this.data.equipped = {};
    this.data.equipped[charId] = itemId;
    this.save();
    return true;
  },
  unequipItem(charId) {
    const prev = this.equippedOf(charId);
    if (!prev) return false;
    this.addItem(prev, 1);
    delete this.data.equipped[charId];
    this.save();
    return true;
  },

  // オンライン対戦へ送る自分の編成データ(通信用の軽量な形)
  buildLoadoutPayload() {
    return this.getLoadout().map((id) => ({ id, rank: this.rankOf(id), level: this.levelOf(id), equip: this.equippedOf(id) }));
  },

  // コインを使ってキャラのレベルを1上げる(永続、戦闘中だけのLv1-3とは無関係)
  levelUpCost(id) {
    if (!this.isOwned(id)) return null;
    return levelUpCoinCost(this.levelOf(id));
  },
  levelUpWithCoins(id) {
    const cost = this.levelUpCost(id);
    if (cost === null) return false;
    if (!this.spendCoins(cost)) return false;
    this.data.owned[id].level = this.levelOf(id) + 1;
    this.trackStat("levelUpsBought", 1);
    this.save();
    return true;
  },

  // 試合終了時、編成した各キャラに経験値を付与し、閾値を超えたぶんだけ自動でレベルアップさせる
  grantMatchXp(charIds, amount) {
    let changed = false;
    (charIds || []).forEach((id) => {
      const o = this.data.owned[id];
      if (!o) return;
      if (o.level === undefined) o.level = 1;
      if (o.xp === undefined) o.xp = 0;
      if (o.level >= MAX_LEVEL) return;
      o.xp += amount;
      changed = true;
      while (o.level < MAX_LEVEL && o.xp >= xpToNextLevel(o.level)) {
        o.xp -= xpToNextLevel(o.level);
        o.level++;
      }
      if (o.level >= MAX_LEVEL) o.xp = 0;
    });
    if (changed) this.save();
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
      this.data.owned[id] = { rank: 1, level: 1, xp: 0 };
      isNew = true; rank = 1;
    } else if (owned.rank >= MAX_RANK) {
      refund = 40; this.addCoins(refund); rank = owned.rank;
    } else {
      owned.rank++; rank = owned.rank;
    }
    this.trackMission("gacha", 1);
    this.trackStat("gachaPulls", 1);
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
      this.trackStat("loginDays", 1);
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
    this.trackStat("dailyBonusClaims", 1);
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
    this.trackStat("dailyMissionsClaimed", 1);
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

// 通信で受け取った相手の編成データ([{id,rank,level}]) から、TowerClashSimに渡せるcharDefsマップを作る
function defsFromLoadoutPayload(list) {
  const out = {};
  (list || []).forEach(({ id, rank, level, equip }) => { out[id] = applyEquipBonus(effectiveCharDef(id, rank, level), equip); });
  return out;
}
