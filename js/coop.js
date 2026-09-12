// ===== 協力プレイ(オンライン2人同時防衛): OnlineSessionの通信基盤を再利用したホスト権威型の共同キャンペーン =====
// 設計: ホストは通常のCampaignSimを普通にtickし続け、毎フレームその状態をブロードキャストする。
// ゲストはCampaignSimの「入れ物」だけをローカルに持ち(tickはしない)、受信した状態で毎回上書きして
// 既存のcampRenderAll/campUpdateHudをそのまま流用して描画する。設置/強化/売却はゲスト→ホストへ要求を送り、
// ホストが唯一の正としてCampaignSimに適用する。
"use strict";

const COOP_GUEST_PREFIX = "g_";
const COOP_ROOM_PREFIX = "towerclash-coop-";
const COOP = {
  active: false,
  role: null, // 'host' | 'guest'
  session: null,
  guestLoadout: [], // ホスト側: ゲストから届いたbuildLoadoutPayload()の中身
  peerReady: false,
};

// ----- ロビー画面 -----
function switchCoopTab(which) {
  $("coop-tab-create").classList.toggle("on", which === "create");
  $("coop-tab-join").classList.toggle("on", which === "join");
  $("coop-pane-create").hidden = which !== "create";
  $("coop-pane-join").hidden = which !== "join";
}
$("coop-tab-create").onclick = () => switchCoopTab("create");
$("coop-tab-join").onclick = () => switchCoopTab("join");

function coopResetLobbyUI() {
  $("coop-room-wait").hidden = true;
  $("coop-room-code-display").textContent = "-----";
  $("btn-coop-goto-stage").hidden = true;
  $("btn-coop-create").disabled = false;
  $("coop-join-code-input").value = "";
  $("coop-join-status").textContent = "";
  $("btn-coop-join").disabled = false;
  switchCoopTab("create");
}

$("btn-coop").onclick = () => {
  if (Meta.getLoadout().length === 0) { alert("キャラ編成で出撃するキャラを選んでください"); return; }
  coopResetLobbyUI();
  showScreen("s-coop-lobby");
};
$("btn-coop-back").onclick = () => {
  if (!CG.sim) coopLeave(); // 戦闘中でなければ部屋を抜ける(戦闘中は⏸️ボタン側で処理)
  showScreen("s-camp-home");
};

$("btn-coop-create").onclick = async () => {
  $("btn-coop-create").disabled = true;
  const session = new OnlineSession();
  COOP.session = session;
  COOP.role = "host";
  COOP.guestLoadout = [];
  COOP.peerReady = false;
  try {
    const code = await session.createRoom(COOP_ROOM_PREFIX);
    $("coop-room-code-display").textContent = code;
    $("coop-room-wait").hidden = false;
    $("coop-lobby-status").textContent = "相手の参加を待っています…";
    session.on("peerJoined", () => {
      if (!COOP.peerReady) $("coop-lobby-status").textContent = "🤝相手が参加しました。編成を確認しています…";
    });
    session.on("peerLeft", () => {
      if (COOP.active) coopHandlePeerLeftMidMatch();
      else { $("coop-lobby-status").textContent = "相手が退出しました"; $("btn-coop-goto-stage").hidden = true; COOP.peerReady = false; }
    });
    session.on("coopHello", (data) => {
      COOP.guestLoadout = data.list || [];
      COOP.peerReady = true;
      $("coop-lobby-status").textContent = "✅相手の準備完了!ステージを選んで出撃してください";
      $("btn-coop-goto-stage").hidden = false;
    });
    session.on("coopPlace", (data) => {
      if (CG.sim && CG.sim.applyPlaceTower(data.col, data.row, data.charId)) {
        Meta.trackMission("placeTower", 1); Meta.trackStat("towersPlaced", 1); SFX.place();
      }
    });
    session.on("coopLevelUp", (data) => {
      if (CG.sim && CG.sim.applyLevelUp(data.towerId)) SFX.levelup();
    });
    session.on("coopSell", (data) => {
      if (CG.sim) { CG.sim.applySellTower(data.towerId); SFX.sell(); }
    });
    session.startPing();
  } catch (e) {
    $("coop-lobby-status").textContent = "接続に失敗しました。通信環境を確認してください";
    $("btn-coop-create").disabled = false;
  }
};

$("btn-coop-goto-stage").onclick = () => {
  if (!COOP.peerReady) return;
  COOP.active = true;
  renderStageGrid();
  $("stage-detail").hidden = true;
  showScreen("s-camp-stages");
};

$("coop-join-code-input").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
});
$("btn-coop-join").onclick = async () => {
  const code = $("coop-join-code-input").value.trim();
  if (code.length < 5) { $("coop-join-status").textContent = "5桁のコードを入力してください"; return; }
  $("coop-join-status").textContent = "接続中…";
  $("btn-coop-join").disabled = true;
  const session = new OnlineSession();
  COOP.session = session;
  COOP.role = "guest";
  let started = false;
  session.on("coopStart", (data) => {
    if (started) return;
    started = true;
    COOP.active = true;
    startCoopBattleGuest(data.stageId, data.diffKey, data.mode, data.charDefs);
  });
  session.on("coopState", (data) => coopApplyGuestState(data));
  session.on("peerLeft", () => {
    if (COOP.active) coopHandlePeerLeftMidMatch();
    else { $("coop-join-status").textContent = "ホストが退出しました"; $("btn-coop-join").disabled = false; }
  });
  try {
    await session.joinRoom(code, COOP_ROOM_PREFIX);
    $("coop-join-status").textContent = "ホストの開始を待っています…";
    session.send("coopHello", { list: Meta.buildLoadoutPayload() });
    session.startPing();
  } catch (e) {
    $("coop-join-status").textContent = "接続できませんでした。コードを確認してください。";
    $("btn-coop-join").disabled = false;
  }
};

// ----- 出撃(ホスト) -----
function startCoopBattleHost(stage, diffKey, mode) {
  mode = mode || "normal";
  const hostDefs = {};
  Meta.getLoadout().forEach((id) => { hostDefs[id] = applyEquipBonus(effectiveCharDef(id, Meta.rankOf(id), Meta.levelOf(id)), Meta.equippedOf(id)); });
  const guestDefs = {};
  (COOP.guestLoadout || []).forEach(({ id, rank, level, equip }) => {
    guestDefs[COOP_GUEST_PREFIX + id] = applyEquipBonus(effectiveCharDef(id, rank, level), equip);
  });
  const mergedDefs = Object.assign({}, hostDefs, guestDefs);

  CG.sim = new CampaignSim(stage, diffKey, mergedDefs, mode);
  CG.stage = stage; CG.diffKey = diffKey; CG.isDaily = false;
  CG.resultShown = false; CG.placingChar = null; CG.fx = freshFx(); CG.paused = false;
  $("pause-overlay").hidden = true; $("camp-sell-panel").hidden = true; $("camp-place-hint").hidden = true;
  buildCoopShopRow(Meta.getLoadout(), "");
  // 進行を実際にtickしているのはホストなので、倍速/自動スキップはホストのみ操作可能にする
  $("camp-speed-ctrl").hidden = false;
  $("btn-camp-autoskip").hidden = false;
  updateCampSpeedButtons();
  updateAutoSkipBtn();
  showScreen("s-camp-battle");
  CG.simAcc = 0; CG.lastTs = performance.now();
  if (!CG.rafId) CG.rafId = requestAnimationFrame(campLoop);

  COOP.session.send("coopStart", { stageId: stage.id, diffKey, mode, charDefs: mergedDefs });
}

// ----- 出撃(ゲスト): coopStart受信で開始 -----
function startCoopBattleGuest(stageId, diffKey, mode, mergedDefs) {
  const stage = STAGES.find((s) => s.id === stageId);
  CG.sim = new CampaignSim(stage, diffKey, mergedDefs, mode || "normal"); // tickは呼ばない「入れ物」として使う
  CG.stage = stage; CG.diffKey = diffKey; CG.isDaily = false;
  CG.resultShown = false; CG.placingChar = null; CG.fx = freshFx(); CG.paused = false;
  $("pause-overlay").hidden = true; $("camp-sell-panel").hidden = true; $("camp-place-hint").hidden = true;
  buildCoopShopRow(Meta.getLoadout(), COOP_GUEST_PREFIX);
  // ゲストは進行を操作できない(倍速/自動スキップの決定権はホストのみ)
  $("camp-speed-ctrl").hidden = true;
  $("btn-camp-autoskip").hidden = true;
  showScreen("s-camp-battle");

  CG.lastTs = performance.now();
  if (!CG.rafId) CG.rafId = requestAnimationFrame(coopGuestLoop);
}

function coopApplyGuestState(data) {
  if (!CG.sim) return;
  Object.assign(CG.sim, {
    hp: data.hp, hpMax: data.hpMax, gold: data.gold, waveIndex: data.waveIndex,
    waveState: data.waveState, prepTimer: data.prepTimer, wavesCleared: data.wavesCleared,
    over: data.over, victory: data.victory,
    towers: data.towers || [], enemies: data.enemies || [], projectiles: data.projectiles || [],
  });
  processCoopEvents(data.events || []);
  if (CG.sim.over && !CG.resultShown) {
    CG.resultShown = true;
    setTimeout(() => showCoopResult(CG.sim), 500);
  }
}

// ゲスト専用の描画ループ。ローカルではtickせず、受信済み状態をそのまま既存の描画関数に渡すだけ
function coopGuestLoop(ts) {
  const frameDt = Math.min(1.5, Math.max(0, (ts - CG.lastTs) / 1000));
  CG.lastTs = ts;
  if (CG.sim && !CG.paused) {
    const fx = CG.fx;
    fx.damageTexts = fx.damageTexts.filter((d) => (d.t += frameDt) < d.life);
    fx.killBursts = fx.killBursts.filter((b) => (b.t += frameDt) < b.life);
    fx.freezeBursts = fx.freezeBursts.filter((b) => (b.t += frameDt) < b.life);
    if (fx.novaFlash > 0) fx.novaFlash = Math.max(0, fx.novaFlash - frameDt);
    Object.keys(fx.towerFlash).forEach((id) => { fx.towerFlash[id] -= frameDt; if (fx.towerFlash[id] <= 0) delete fx.towerFlash[id]; });
    campRenderAll(CG.sim);
    campUpdateHud(CG.sim);
  }
  if (COOP.active && COOP.role === "guest") CG.rafId = requestAnimationFrame(coopGuestLoop);
  else CG.rafId = null;
}

// ホストのcampLoopから毎フレーム呼ばれ、状態をゲストへ送信する
function broadcastCoopState(events) {
  if (!COOP.session || !CG.sim) return;
  const sim = CG.sim;
  COOP.session.send("coopState", {
    hp: sim.hp, hpMax: sim.hpMax, gold: sim.gold, waveIndex: sim.waveIndex,
    waveState: sim.waveState, prepTimer: sim.prepTimer, wavesCleared: sim.wavesCleared,
    over: sim.over, victory: sim.victory,
    towers: sim.towers.map((t) => ({ id: t.id, col: t.col, row: t.row, charId: t.charId, level: t.level })),
    enemies: sim.enemies.map((e) => ({ id: e.id, type: e.type, dist: e.dist, hp: e.hp, hpMax: e.hpMax, slow: e.slow, burn: e.burn })),
    projectiles: sim.projectiles.map((p) => ({ x: p.x, y: p.y, tx: p.tx, ty: p.ty, t: p.t, life: p.life, color: p.color, kind: p.kind })),
    events,
  });
}

// campLoopのフレームイベント処理(kill/hit/fire/nova/freezeの見た目)をゲスト側でも再現する
function processCoopEvents(events) {
  let firedThisFrame = false, killedThisFrame = false;
  events.forEach((ev) => {
    if (ev.k === "kill") {
      killedThisFrame = true;
      CG.fx.killBursts.push({ x: ev.x || 0, y: ev.y || 0, t: 0, life: 0.35 });
    } else if (ev.k === "waveStart") {
      SFX.waveStart();
    } else if (ev.k === "hit") {
      const jitterX = (Math.random() - 0.5) * 14;
      CG.fx.damageTexts.push({ x: ev.x + jitterX, y: ev.y - 10, text: "-" + ev.amount, color: ev.crit ? "#fff" : ev.color, t: 0, life: 0.7, crit: !!ev.crit });
    } else if (ev.k === "fire") {
      CG.fx.towerFlash[ev.towerId] = 0.15;
      firedThisFrame = true;
    } else if (ev.k === "nova") {
      CG.fx.novaFlash = 0.4; CG.fx.novaColor = ev.color;
    } else if (ev.k === "freeze") {
      CG.fx.freezeBursts.push({ x: ev.x, y: ev.y, t: 0, life: 0.4 });
    }
  });
  if (firedThisFrame) SFX.fire();
  if (killedThisFrame) SFX.kill();
}

// prefix付きのcharIdでショップ列を構築(ホストは prefix=""、ゲストは prefix="g_")
function buildCoopShopRow(loadout, prefix) {
  const row = $("camp-shop-row");
  row.innerHTML = "";
  loadout.forEach((bareId) => {
    const charId = prefix + bareId;
    const def = CG.sim.charDefs[charId];
    if (!def) return;
    const b = document.createElement("button");
    b.className = "shop-btn";
    b.dataset.charId = charId;
    b.innerHTML = `<span class="sb-icon">${def.emoji}</span><span>${def.name}</span><span class="sb-cost">${def.cost}</span>`;
    b.onclick = () => onCampShopClick(charId, b);
    row.appendChild(b);
  });
}

function coopHandlePeerLeftMidMatch() {
  alert("相手が切断しました。ホームに戻ります");
  coopLeave();
  CG.sim = null;
  showScreen("s-camp-home");
  updateCoinDisplays();
  updateDailyBadges();
}

function coopLeave() {
  if (COOP.session) { try { COOP.session.leave(); } catch (e) { /* ignore */ } }
  COOP.active = false; COOP.role = null; COOP.session = null;
  COOP.guestLoadout = []; COOP.peerReady = false;
  $("camp-speed-ctrl").hidden = false;
  $("btn-camp-autoskip").hidden = false;
}

function showCoopResult(sim) {
  if (sim.victory) SFX.victory(); else SFX.defeat();
  const mode = sim.mode || "normal";
  const diff = DIFFICULTIES[CG.diffKey];
  let total;
  if (mode === "endless") {
    total = sim.wavesCleared * 10 + Math.floor(sim.wavesCleared / 10) * 120;
    Meta.trackStat("endlessRuns", 1);
    Meta.updateEndlessBestWave(sim.wavesCleared);
  } else if (mode === "bossrush") {
    total = sim.wavesCleared * 45;
    if (sim.victory) { total += Math.round(350 * diff.coinMul); Meta.trackStat("bossRushClears", 1); }
  } else {
    total = sim.victory
      ? sim.wavesCleared * 6 + Math.round(sim.stage.baseCoin * diff.coinMul)
      : sim.wavesCleared * 4;
  }
  Meta.addCoins(total);
  Meta.trackStat("coopMatches", 1);
  if (sim.victory) Meta.trackStat("coopWins", 1);
  checkAndToastAchievements();
  Meta.grantMatchXp(Meta.getLoadout(), sim.victory ? MATCH_XP_WIN : MATCH_XP_LOSE);
  updateDailyBadges();

  let droppedItem = null;
  if (sim.victory || mode === "endless") {
    const dropId = rollItemDrop();
    if (dropId) { Meta.addItem(dropId, 1); droppedItem = equipItemDef(dropId); }
  }

  if (mode === "endless") {
    $("camp-result-title").textContent = "💥 協力プレイ 力尽きた…";
    $("camp-result-detail").textContent = `2人で${sim.wavesCleared}ウェーブ生き延びた(自己ベスト: ${Meta.data.stats.endlessBestWave || 0}ウェーブ)`;
  } else if (mode === "bossrush") {
    $("camp-result-title").textContent = sim.victory ? "🎉 協力プレイ 討伐戦クリア!" : "💥 協力プレイ 討伐失敗…";
    $("camp-result-detail").textContent = `2人でボス ${sim.wavesCleared}/${BOSS_RUSH_COUNT} 体を撃破`;
  } else {
    $("camp-result-title").textContent = sim.victory ? "🎉 協力プレイ クリア!" : "💥 協力プレイ 敗北…";
    $("camp-result-detail").textContent = sim.victory
      ? `全${sim.stage.waveCount}ウェーブを2人で突破しました`
      : `Wave ${sim.wavesCleared}/${sim.stage.waveCount}まで到達`;
  }

  let coinText = `🪙 +${total} コイン獲得`;
  if (droppedItem) coinText += ` / 🎁${droppedItem.emoji}${droppedItem.name}を入手!`;

  // 二人分の貢献度(設置基数・投資ゴールド)を分けて表示。CharIdの"g_"接頭辞でホスト/ゲストの設置を判定
  let myTowers = 0, myInvested = 0, partnerTowers = 0, partnerInvested = 0;
  (sim.towers || []).forEach((t) => {
    const isGuestChar = (t.charId || "").indexOf(COOP_GUEST_PREFIX) === 0;
    const isMine = COOP.role === "guest" ? isGuestChar : !isGuestChar;
    if (isMine) { myTowers++; myInvested += t.invested || 0; }
    else { partnerTowers++; partnerInvested += t.invested || 0; }
  });
  const contribText = `🙋あなた: ${myTowers}基設置(${myInvested}🪙) ／ 🤝相方: ${partnerTowers}基設置(${partnerInvested}🪙)`;
  $("camp-coin-earn").innerHTML = `${coinText}<br><span class="coop-contrib">${contribText}</span>`;

  $("btn-camp-next").hidden = true;
  $("btn-camp-retry").hidden = true;
  $("btn-camp-result-back").textContent = "ホームに戻る";
  $("btn-camp-result-back").onclick = () => {
    coopLeave();
    CG.sim = null;
    showScreen("s-camp-home");
    updateCoinDisplays();
    updateDailyBadges();
  };

  showScreen("s-camp-result");
}
