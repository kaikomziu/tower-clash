// ===== キャンペーンモード: ステージ/キャラクター/難易度/ガチャ/ウェーブのデータ定義 =====
"use strict";

const CCELL = 50, CCOLS = 16, CROWS = 9;
const CBOARD_W = CCOLS * CCELL, CBOARD_H = CROWS * CCELL;

const DIFFICULTIES = {
  easy: { key: "easy", name: "EASY", label: "かんたん", hpMul: 0.72, spdMul: 0.92, countMul: 0.75, coinMul: 1.0, color: "#4ade80" },
  normal: { key: "normal", name: "NORMAL", label: "ふつう", hpMul: 1.0, spdMul: 1.0, countMul: 1.0, coinMul: 1.5, color: "#facc15" },
  hard: { key: "hard", name: "HARD", label: "むずかしい", hpMul: 1.55, spdMul: 1.12, countMul: 1.3, coinMul: 2.2, color: "#f87171" },
  // デイリーステージ専用。通常の難易度選択には出さない(renderDiffPickで除外)
  daily: { key: "daily", name: "DAILY", label: "デイリー", hpMul: 1.3, spdMul: 1.05, countMul: 1.15, coinMul: 1.0, color: "#38bdf8" },
};

// ===== ステージ(全5種、それぞれ固有の通り道) =====
const STAGES = [
  {
    id: 0, name: "はじまりの草原", emoji: "🌾", desc: "見晴らしのいい練習向きの一本道",
    baseMul: 1.0, waveCount: 8, baseCoin: 90,
    path: [[0,4],[1,4],[2,4],[3,4],[4,4],[4,3],[4,2],[5,2],[6,2],[7,2],[7,3],[7,4],[7,5],[7,6],[8,6],[9,6],[10,6],[10,5],[10,4],[10,3],[11,3],[12,3],[13,3],[14,3],[15,3]],
  },
  {
    id: 1, name: "岩山の隘路", emoji: "⛰️", desc: "曲がり角が増え、置ける場所が絞られる",
    baseMul: 1.2, waveCount: 9, baseCoin: 120,
    path: [[0,2],[1,2],[2,2],[3,2],[3,3],[3,4],[3,5],[3,6],[4,6],[5,6],[6,6],[7,6],[7,5],[7,4],[7,3],[7,2],[7,1],[8,1],[9,1],[10,1],[11,1],[11,2],[11,3],[11,4],[11,5],[11,6],[11,7],[12,7],[13,7],[14,7],[15,7]],
  },
  {
    id: 2, name: "灼熱の峡谷", emoji: "🌋", desc: "細かく折れ曲がる峡谷。射線の確保がカギ",
    baseMul: 1.45, waveCount: 10, baseCoin: 160,
    path: [[0,1],[1,1],[2,1],[2,2],[2,3],[2,4],[2,5],[3,5],[4,5],[4,4],[4,3],[4,2],[4,1],[5,1],[6,1],[6,2],[6,3],[6,4],[6,5],[6,6],[6,7],[7,7],[8,7],[8,6],[8,5],[8,4],[8,3],[8,2],[8,1],[9,1],[10,1],[10,2],[10,3],[10,4],[10,5],[10,6],[10,7],[11,7],[12,7],[12,6],[12,5],[12,4],[12,3],[12,2],[12,1],[13,1],[14,1],[15,1]],
  },
  {
    id: 3, name: "氷結の回廊", emoji: "🧊", desc: "長く伸びる回廊。持久力が試される",
    baseMul: 1.75, waveCount: 11, baseCoin: 210,
    path: [[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[5,3],[5,2],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[10,2],[10,3],[10,4],[10,5],[10,6],[10,7],[11,7],[12,7],[13,7],[13,6],[13,5],[13,4],[13,3],[14,3],[15,3]],
  },
  {
    id: 4, name: "竜の巣窟", emoji: "🐲", desc: "最終ステージ。あらゆる敵が牙を剥く",
    baseMul: 2.15, waveCount: 13, baseCoin: 300,
    path: [[0,2],[1,2],[2,2],[2,3],[2,4],[2,5],[2,6],[3,6],[4,6],[5,6],[5,5],[5,4],[5,3],[5,2],[6,2],[7,2],[8,2],[8,3],[8,4],[8,5],[8,6],[9,6],[10,6],[11,6],[11,5],[11,4],[11,3],[11,2],[12,2],[13,2],[14,2],[15,2]],
  },
];

// ===== 敵モンスター(ウェーブで自動生成) =====
const MONSTER_DEFS = {
  grunt: { name: "グラント", hp: 30, speed: 70, dmg: 1, gold: 5, coin: 1, color: "#facc15", emoji: "👾" },
  runner: { name: "ランナー", hp: 18, speed: 132, dmg: 1, gold: 6, coin: 1, color: "#4ade80", emoji: "⚡" },
  tank: { name: "タンク", hp: 140, speed: 42, dmg: 2, gold: 15, coin: 2, color: "#f472b6", emoji: "🛡️" },
  boss: { name: "ミニボス", hp: 700, speed: 36, dmg: 5, gold: 60, coin: 8, color: "#c084fc", emoji: "👹" },
};

// ===== プレイヤーキャラクター(タワー) =====
// kind: 'single'(単体) / 'splash'(範囲) / 'slow'(遅延) / 'chain'(連鎖) / 'dot'(継続) / 'pull'(後退) / 'buff'(支援・非攻撃)
const CHAR_DEFS = {
  arrow: { id: "arrow", name: "アロー弓兵", rarity: 1, emoji: "🏹", cost: 50, dmg: 9, cooldown: 0.9, range: 135, kind: "single", color: "#7dd3fc", desc: "安価で連射が速い基本ユニット" },
  cannon: { id: "cannon", name: "キャノン砲兵", rarity: 1, emoji: "💣", cost: 100, dmg: 26, cooldown: 1.6, range: 115, kind: "splash", splash: 55, color: "#fca5a5", desc: "着弾地点周辺に範囲ダメージ" },
  frost: { id: "frost", name: "フロスト氷術師", rarity: 1, emoji: "❄️", cost: 80, dmg: 4, cooldown: 1.0, range: 125, kind: "slow", slow: 0.5, slowDur: 2.5, color: "#a5f3fc", desc: "敵を大きく減速させる" },
  spark: { id: "spark", name: "雷撃の射手", rarity: 2, emoji: "⚡", cost: 120, dmg: 7, cooldown: 0.8, range: 120, kind: "chain", chainCount: 3, chainRange: 75, chainFalloff: 0.7, color: "#fde047", desc: "近くの敵に連鎖する電撃",
    special: { kind: "chainOverload", minHits: 3, bonusMult: 0.6 }, specialDesc: "特殊: 3体以上に連鎖すると最後の対象に追加ダメージ" },
  blade: { id: "blade", name: "剣豪", rarity: 2, emoji: "🗡️", cost: 110, dmg: 24, cooldown: 0.5, range: 70, kind: "single", color: "#e5e7eb", desc: "射程は短いが超高速の斬撃",
    special: { kind: "doubleAttack", chance: 0.2 }, specialDesc: "特殊: 20%の確率で即座にもう一度斬りつける" },
  flame: { id: "flame", name: "業火の魔道士", rarity: 3, emoji: "🔥", cost: 160, dmg: 10, cooldown: 1.1, range: 115, kind: "dot", dotDmg: 6, dotDur: 3, color: "#fb923c", desc: "炎上させ継続ダメージを与える",
    special: { kind: "burnSpread", radius: 55 }, specialDesc: "特殊: 炎上中の敵が倒れると周囲に炎が燃え広がる" },
  sniper: { id: "sniper", name: "狙撃手", rarity: 3, emoji: "🎯", cost: 175, dmg: 58, cooldown: 2.2, range: 230, kind: "single", color: "#c4b5fd", desc: "超長射程・単発高火力",
    special: { kind: "execute", threshold: 0.3, mult: 0.6 }, specialDesc: "特殊: HP30%以下の敵に追加ダメージ(急所撃ち)" },
  tornado: { id: "tornado", name: "竜巻使い", rarity: 4, emoji: "🌪️", cost: 210, dmg: 5, cooldown: 1.3, range: 110, kind: "pull", pullDist: 42, color: "#93c5fd", desc: "敵を通り道の後方へ吹き飛ばす",
    special: { kind: "stunOnPull", dur: 1 }, specialDesc: "特殊: 吹き飛ばした敵を1秒間完全停止させる" },
  king: { id: "king", name: "騎士王", rarity: 4, emoji: "👑", cost: 230, dmg: 0, cooldown: 1.0, range: 130, kind: "buff", buffDmg: 0.3, buffRate: 0.18, color: "#fbbf24", desc: "攻撃はしないが周囲を強化する",
    special: { kind: "rangeBuff", amount: 0.15 }, specialDesc: "特殊: 支援効果に周囲タワーの射程+15%も追加" },
  dragon: { id: "dragon", name: "古竜", rarity: 5, emoji: "🐉", cost: 320, dmg: 40, cooldown: 1.4, range: 130, kind: "splash", splash: 70, dotDmg: 8, dotDur: 3, color: "#ef4444", desc: "広範囲を炎で焼き尽くす",
    special: { kind: "novaEvery", n: 5 }, specialDesc: "特殊: 5回に1回、画面全体を巻き込む大爆発を放つ" },
  sage: { id: "sage", name: "星海の賢者", rarity: 5, emoji: "✨", cost: 300, dmg: 72, cooldown: 1.6, range: 190, kind: "slow", slow: 0.35, slowDur: 2, color: "#a78bfa", desc: "強力な一撃と減速を同時に",
    special: { kind: "freezeEvery", n: 4, dur: 2 }, specialDesc: "特殊: 4回に1回、対象を完全凍結させる" },
};
const CHAR_ORDER = ["arrow", "cannon", "frost", "spark", "blade", "flame", "sniper", "tornado", "king", "dragon", "sage"];
const STARTER_CHARS = ["arrow", "cannon", "frost"];
const MAX_LOADOUT = 6;

const RARITY_COLOR = { 1: "#9ca3af", 2: "#4ade80", 3: "#60a5fa", 4: "#c084fc", 5: "#fbbf24" };
const RARITY_LABEL = { 1: "★1", 2: "★2", 3: "★3", 4: "★4", 5: "★5" };

// ===== ガチャ(★1は初期所持のため対象外。★4以上は天井保証あり) =====
const GACHA_POOL = CHAR_ORDER.filter((id) => CHAR_DEFS[id].rarity >= 2);
const GACHA_RARITY_WEIGHT = { 2: 55, 3: 30, 4: 11, 5: 4 };
const GACHA_COST_SINGLE = 150;
const GACHA_COST_TEN = 1350;
const GACHA_PITY_RARITY = 4; // この天井数までに★4以上が出ないと確定
const GACHA_PITY_COUNT = 10;

function gachaWeightedList() {
  const list = [];
  GACHA_POOL.forEach((id) => {
    const r = CHAR_DEFS[id].rarity;
    const w = GACHA_RARITY_WEIGHT[r] / GACHA_POOL.filter((x) => CHAR_DEFS[x].rarity === r).length;
    list.push({ id, w });
  });
  return list;
}
function gachaPickOne(forcePity) {
  let pool = gachaWeightedList();
  if (forcePity) pool = pool.filter((p) => CHAR_DEFS[p.id].rarity >= GACHA_PITY_RARITY);
  const total = pool.reduce((a, p) => a + p.w, 0);
  let r = Math.random() * total;
  for (const p of pool) { r -= p.w; if (r <= 0) return p.id; }
  return pool[pool.length - 1].id;
}

// ランク(重複ガチャで上昇、上限5)とレベル(コイン購入 or 試合終了時のXPで上昇、上限20。戦闘中だけのLv1-3とは無関係な永続値)
// の両方を反映した実効ステータスを計算する
const MAX_RANK = 5;
const MAX_LEVEL = 20;
function effectiveCharDef(id, rank, level) {
  const base = CHAR_DEFS[id];
  const r = Math.max(1, Math.min(MAX_RANK, rank || 1));
  const lv = Math.max(1, Math.min(MAX_LEVEL, level || 1));
  const rankStatMul = 1 + 0.1 * (r - 1);
  const levelStatMul = 1 + 0.03 * (lv - 1);
  const statMul = rankStatMul * levelStatMul;
  const rangeMul = 1 + 0.04 * (r - 1); // 射程はランクのみで伸びる
  return Object.assign({}, base, {
    dmg: base.dmg * statMul,
    range: base.range * rangeMul,
    splash: base.splash ? base.splash * (1 + 0.02 * (r - 1)) : base.splash,
    dotDmg: base.dotDmg ? base.dotDmg * statMul : base.dotDmg,
    buffDmg: base.buffDmg ? base.buffDmg * (1 + 0.06 * (r - 1)) : base.buffDmg,
    rank: r,
    level: lv,
  });
}

// ===== レベルアップ(コイン購入・永続) =====
const LEVEL_UP_COST_BASE = 60, LEVEL_UP_COST_PER = 40;
function levelUpCoinCost(level) {
  if (level >= MAX_LEVEL) return null;
  return LEVEL_UP_COST_BASE + level * LEVEL_UP_COST_PER;
}

// ===== レベルアップ(試合終了時の経験値・永続) =====
const MATCH_XP_WIN = 8, MATCH_XP_LOSE = 3;
const XP_BASE = 20, XP_PER_LEVEL = 10;
function xpToNextLevel(level) { return XP_BASE + level * XP_PER_LEVEL; }

// ===== 戦闘中レベルアップ(設置後、最大3レベルまで) =====
const BATTLE_MAX_LEVEL = 3;
const BATTLE_LEVEL_DMG_MUL = [1, 1.32, 1.7];
const BATTLE_LEVEL_RANGE_MUL = [1, 1.08, 1.16];
function battleLevelUpCost(baseCost, currentLevel) {
  return Math.round(baseCost * 0.55 * currentLevel);
}

// ===== ウェーブ生成(ステージ×難易度×ウェーブ番号から自動生成) =====
function buildWave(stage, diff, waveIndex) {
  const isBoss = waveIndex === stage.waveCount - 1;
  const progress = waveIndex / Math.max(1, stage.waveCount - 1);
  const mul = stage.baseMul * diff.hpMul * (1 + 0.05 * waveIndex);
  const spdMul = diff.spdMul * (1 + 0.008 * waveIndex);
  const countBase = 4 + waveIndex * 1.6;
  const count = Math.max(2, Math.round(countBase * diff.countMul));

  const entries = [];
  let types;
  if (progress < 0.3) types = ["grunt"];
  else if (progress < 0.6) types = ["grunt", "runner"];
  else types = ["grunt", "runner", "tank"];

  for (let i = 0; i < count; i++) {
    const t = types[Math.floor(Math.random() * types.length)];
    entries.push({ type: t, hpMul: mul, spdMul, interval: 0.55 });
  }
  if (isBoss) entries.push({ type: "boss", hpMul: mul * 0.9, spdMul, interval: 0.9 });
  return entries;
}

// ===== 日付ユーティリティ =====
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}
function dayIndexToday() {
  return Math.floor(new Date(todayStr() + "T00:00:00").getTime() / 86400000);
}

// ===== デイリーボーナス(7日サイクル、連続受け取りで増額) =====
const DAILY_BONUS_TABLE = [50, 70, 90, 120, 150, 200, 300];

// ===== デイリーミッション(毎日3件をランダム抽選) =====
const MISSION_POOL = [
  { type: "placeTower", desc: (n) => `タワーを${n}体設置する`, targets: [5, 10, 15], reward: (n) => 30 + n * 4 },
  { type: "kill", desc: (n) => `敵を${n}体撃破する`, targets: [20, 40, 80], reward: (n) => 30 + Math.round(n * 1.5) },
  { type: "waveClear", desc: (n) => `ウェーブを${n}回クリアする`, targets: [5, 10, 20], reward: (n) => 40 + n * 3 },
  { type: "stageClear", desc: (n) => `ステージを${n}回クリアする`, targets: [1, 2, 3], reward: (n) => 60 + n * 40 },
  { type: "gacha", desc: (n) => `ガチャを${n}回引く`, targets: [1, 3, 5], reward: (n) => 50 + n * 20 },
  { type: "hardClear", desc: () => "むずかしい難易度でステージをクリアする", targets: [1], reward: () => 150 },
];
function generateDailyMissions() {
  const pool = MISSION_POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map((m) => {
    const target = m.targets[Math.floor(Math.random() * m.targets.length)];
    return { type: m.type, target, progress: 0, reward: m.reward(target), claimed: false, desc: m.desc(target) };
  });
}
