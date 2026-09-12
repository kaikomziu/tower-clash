// ===== 実績(トロフィー)定義 =====
// check(stats, data) は Meta.data.stats と Meta.data を受け取り、達成していればtrueを返す
"use strict";

function ownedCount(data) { return Object.keys(data.owned).length; }
function maxOwnedLevel(data) { return Object.values(data.owned).reduce((m, o) => Math.max(m, o.level || 1), 0); }
function rank5Count(data) { return Object.values(data.owned).filter((o) => (o.rank || 1) >= MAX_RANK).length; }
function allStagesClearedOn(data, diffKey) { return STAGES.every((s) => data.stageProgress[s.id] && data.stageProgress[s.id][diffKey]); }

const ACHIEVEMENTS = [
  // ----- ステージ攻略 -----
  { id: "stage_clear_1", name: "はじめの一歩", desc: "はじめてステージをクリアする", emoji: "🌾", reward: 50, check: (s) => s.stagesCleared >= 1 },
  { id: "stage_all_easy", name: "かんたん制覇", desc: "全5ステージをかんたんでクリアする", emoji: "🟢", reward: 150, check: (s, d) => allStagesClearedOn(d, "easy") },
  { id: "stage_all_normal", name: "ふつう制覇", desc: "全5ステージをふつうでクリアする", emoji: "🟡", reward: 250, check: (s, d) => allStagesClearedOn(d, "normal") },
  { id: "stage_all_hard", name: "むずかしい制覇", desc: "全5ステージをむずかしいでクリアする", emoji: "🔴", reward: 500, check: (s, d) => allStagesClearedOn(d, "hard") },
  { id: "stage_final_hard", name: "竜殺し", desc: "最終ステージ「竜の巣窟」をむずかしいでクリアする", emoji: "🐲", reward: 300, check: (s, d) => d.stageProgress[4] && d.stageProgress[4].hard },
  { id: "stage_cleared_10", name: "常連プレイヤー", desc: "ステージクリア回数の合計が10回に到達", emoji: "🎖️", reward: 100, check: (s) => s.stagesCleared >= 10 },
  { id: "stage_cleared_50", name: "歴戦の指揮官", desc: "ステージクリア回数の合計が50回に到達", emoji: "🏅", reward: 300, check: (s) => s.stagesCleared >= 50 },
  { id: "daily_stage_1", name: "デイリー初挑戦", desc: "デイリーステージをはじめてクリアする", emoji: "🗓️", reward: 80, check: (s) => s.dailyStageClears >= 1 },
  { id: "daily_stage_10", name: "デイリー常連", desc: "デイリーステージを10回クリアする", emoji: "📅", reward: 200, check: (s) => s.dailyStageClears >= 10 },
  { id: "daily_stage_50", name: "デイリーマスター", desc: "デイリーステージを50回クリアする", emoji: "🌟", reward: 500, check: (s) => s.dailyStageClears >= 50 },

  // ----- ガチャ -----
  { id: "gacha_1", name: "運試し", desc: "はじめてガチャを引く", emoji: "🎰", reward: 30, check: (s) => s.gachaPulls >= 1 },
  { id: "gacha_10", name: "ガチャ入門", desc: "ガチャを10回引く", emoji: "🎟️", reward: 80, check: (s) => s.gachaPulls >= 10 },
  { id: "gacha_50", name: "課金戦士(コイン)", desc: "ガチャを50回引く", emoji: "💴", reward: 200, check: (s) => s.gachaPulls >= 50 },
  { id: "gacha_100", name: "ガチャ中毒", desc: "ガチャを100回引く", emoji: "🌀", reward: 400, check: (s) => s.gachaPulls >= 100 },
  { id: "gacha_300", name: "廃課金者の風格", desc: "ガチャを300回引く", emoji: "👑", reward: 1000, check: (s) => s.gachaPulls >= 300 },

  // ----- 育成 -----
  { id: "own_5", name: "コレクター見習い", desc: "5種類のキャラを仲間にする", emoji: "📖", reward: 100, check: (s, d) => ownedCount(d) >= 5 },
  { id: "own_8", name: "コレクター", desc: "8種類のキャラを仲間にする", emoji: "📚", reward: 200, check: (s, d) => ownedCount(d) >= 8 },
  { id: "own_all", name: "図鑑コンプリート", desc: "全11種類のキャラを仲間にする", emoji: "🏆", reward: 400, check: (s, d) => ownedCount(d) >= CHAR_ORDER.length },
  { id: "rank5_1", name: "極めし者", desc: "いずれかのキャラをランク5にする", emoji: "⭐", reward: 250, check: (s, d) => rank5Count(d) >= 1 },
  { id: "level_10", name: "熟練の証", desc: "いずれかのキャラをレベル10にする", emoji: "📈", reward: 150, check: (s, d) => maxOwnedLevel(d) >= 10 },
  { id: "level_max", name: "限界突破", desc: "いずれかのキャラをレベル20(最大)にする", emoji: "💠", reward: 400, check: (s, d) => maxOwnedLevel(d) >= MAX_LEVEL },

  // ----- 戦闘 -----
  { id: "tower_50", name: "設置職人", desc: "タワー設置回数の合計が50回に到達", emoji: "🏗️", reward: 60, check: (s) => s.towersPlaced >= 50 },
  { id: "tower_200", name: "築城家", desc: "タワー設置回数の合計が200回に到達", emoji: "🏯", reward: 150, check: (s) => s.towersPlaced >= 200 },
  { id: "tower_1000", name: "要塞建築士", desc: "タワー設置回数の合計が1000回に到達", emoji: "🏰", reward: 400, check: (s) => s.towersPlaced >= 1000 },
  { id: "kill_100", name: "駆除業者", desc: "敵撃破数の合計が100体に到達", emoji: "👾", reward: 60, check: (s) => s.enemiesKilled >= 100 },
  { id: "kill_1000", name: "殲滅指揮官", desc: "敵撃破数の合計が1000体に到達", emoji: "💥", reward: 200, check: (s) => s.enemiesKilled >= 1000 },
  { id: "kill_10000", name: "災厄", desc: "敵撃破数の合計が10000体に到達", emoji: "☠️", reward: 600, check: (s) => s.enemiesKilled >= 10000 },
  { id: "wave_500", name: "波状攻撃の守護者", desc: "クリアしたウェーブ数の合計が500回に到達", emoji: "🌊", reward: 300, check: (s) => s.wavesCleared >= 500 },

  // ----- コイン -----
  { id: "coin_1000", name: "小金持ち", desc: "累計獲得コインが1,000に到達", emoji: "🪙", reward: 50, check: (s) => s.coinsEarnedTotal >= 1000 },
  { id: "coin_10000", name: "資産家", desc: "累計獲得コインが10,000に到達", emoji: "💰", reward: 200, check: (s) => s.coinsEarnedTotal >= 10000 },
  { id: "coin_100000", name: "経済を回す者", desc: "累計獲得コインが100,000に到達", emoji: "🏦", reward: 500, check: (s) => s.coinsEarnedTotal >= 100000 },

  // ----- デイリー -----
  { id: "daily_bonus_1", name: "ログインボーナス", desc: "デイリーボーナスをはじめて受け取る", emoji: "🎁", reward: 30, check: (s) => s.dailyBonusClaims >= 1 },
  { id: "daily_bonus_7", name: "皆勤賞", desc: "デイリーボーナスを7回受け取る", emoji: "📆", reward: 150, check: (s) => s.dailyBonusClaims >= 7 },
  { id: "daily_bonus_30", name: "生活の一部", desc: "デイリーボーナスを30回受け取る", emoji: "🗓️", reward: 400, check: (s) => s.dailyBonusClaims >= 30 },
  { id: "mission_20", name: "任務遂行者", desc: "デイリーミッションの達成回数が20回に到達", emoji: "📋", reward: 200, check: (s) => s.dailyMissionsClaimed >= 20 },

  // ----- オンライン -----
  { id: "online_win_1", name: "初陣勝利", desc: "オンライン対戦ではじめて勝利する", emoji: "🌐", reward: 80, check: (s) => s.onlineWins >= 1 },
  { id: "online_win_10", name: "対人戦の猛者", desc: "オンライン対戦で10勝する", emoji: "⚔️", reward: 300, check: (s) => s.onlineWins >= 10 },

  // ----- 総合力 -----
  { id: "power_500", name: "頼れる編成", desc: "総合戦力が500に到達", emoji: "⚡", reward: 100, check: (s) => s.totalPowerPeak >= 500 },
  { id: "power_2000", name: "最強編成", desc: "総合戦力が2000に到達", emoji: "🔥", reward: 400, check: (s) => s.totalPowerPeak >= 2000 },

  // ----- エンドレス/討伐戦 -----
  { id: "endless_wave_10", name: "エンドレスの挑戦者", desc: "エンドレスモードで10ウェーブ生き延びる", emoji: "♾️", reward: 100, check: (s) => (s.endlessBestWave || 0) >= 10 },
  { id: "endless_wave_30", name: "終わりなき守護者", desc: "エンドレスモードで30ウェーブ生き延びる", emoji: "🌌", reward: 350, check: (s) => (s.endlessBestWave || 0) >= 30 },
  { id: "bossrush_clear_1", name: "討伐戦制覇", desc: "討伐戦(ボスラッシュ)を1回クリアする", emoji: "👹", reward: 200, check: (s) => (s.bossRushClears || 0) >= 1 },
];

const ACHIEVEMENT_TOTAL_COUNT = ACHIEVEMENTS.length;
