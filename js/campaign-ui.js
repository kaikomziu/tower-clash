// ===== キャンペーンモード: UI/描画/入力の結合(main.jsの $ / showScreen を再利用) =====
"use strict";

function updateCoinDisplays() {
  const v = Meta.data.coins;
  ["camp-coin-val", "stages-coin-val", "roster-coin-val", "gacha-coin-val", "bonus-coin-val", "missions-coin-val", "dailystage-coin-val"].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = v;
  });
}

// ===== タイトル→キャンペーンホーム =====
$("btn-campaign").onclick = () => { updateCoinDisplays(); updateDailyBadges(); updatePowerDisplays(); showScreen("s-camp-home"); };
$("btn-camp-home-back").onclick = () => showScreen("s-title");
$("btn-camp-stages").onclick = () => { renderStageGrid(); $("stage-detail").hidden = true; showScreen("s-camp-stages"); };
$("btn-camp-roster").onclick = () => { renderRoster(); showScreen("s-camp-roster"); };
$("btn-camp-gacha").onclick = () => { renderGachaScreen(); showScreen("s-camp-gacha"); };
$("roster-max").textContent = MAX_LOADOUT;

// ===== ステージ選択 =====
$("btn-stages-back").onclick = () => showScreen("s-camp-home");
let CG_selectedStage = null, CG_selectedDiff = "normal";

function renderStageGrid() {
  updateCoinDisplays();
  const grid = $("stage-grid");
  grid.innerHTML = "";
  STAGES.forEach((st) => {
    const unlocked = Meta.isStageUnlocked(st.id);
    const card = document.createElement("button");
    card.className = "stage-card" + (unlocked ? "" : " locked");
    const badges = ["easy", "normal", "hard"].map((k) =>
      Meta.isCleared(st.id, k) ? `<span class="clear-badge ${k}">${DIFFICULTIES[k].label}✓</span>` : ""
    ).join("");
    card.innerHTML = `
      <div class="stage-emoji">${unlocked ? st.emoji : "🔒"}</div>
      <div class="stage-name">${unlocked ? st.name : "？？？"}</div>
      <div class="stage-badges">${unlocked ? badges : ""}</div>
    `;
    if (unlocked) card.onclick = () => openStageDetail(st);
    else card.disabled = true;
    grid.appendChild(card);
  });
}
function openStageDetail(st) {
  CG_selectedStage = st;
  $("sd-title").textContent = st.emoji + " " + st.name;
  $("sd-desc").textContent = st.desc;
  renderDiffPick();
  $("stage-detail").hidden = false;
}
function renderDiffPick() {
  const wrap = $("diff-pick");
  wrap.innerHTML = "";
  Object.values(DIFFICULTIES).filter((d) => d.key !== "daily").forEach((d) => {
    const b = document.createElement("button");
    b.className = "diff-btn" + (d.key === CG_selectedDiff ? " sel" : "");
    b.style.setProperty("--dc", d.color);
    const cleared = Meta.isCleared(CG_selectedStage.id, d.key);
    b.innerHTML = d.label + (cleared ? " ✓" : "");
    b.onclick = () => { CG_selectedDiff = d.key; renderDiffPick(); };
    wrap.appendChild(b);
  });
}
$("btn-stage-detail-close").onclick = () => { $("stage-detail").hidden = true; };
$("btn-stage-launch").onclick = () => {
  if (Meta.getLoadout().length === 0) { alert("キャラ編成で出撃するキャラを選んでください"); return; }
  startCampaignBattle(CG_selectedStage, CG_selectedDiff);
};

// ===== キャラ編成 =====
let ROSTER_RETURN_SCREEN = "s-camp-home";
$("btn-roster-back").onclick = () => {
  showScreen(ROSTER_RETURN_SCREEN);
  ROSTER_RETURN_SCREEN = "s-camp-home";
  if (typeof updateLoadoutNote === "function") updateLoadoutNote();
};
// 現在の実効ステータス(ランク・レベル反映済み)からキャラ詳細の表示用ラベルを組み立てる
function round1(x) { return Math.round(x * 10) / 10; }
function formatCharStats(effDef) {
  const lines = [`💰コスト ${effDef.cost}`, `🎯射程 ${Math.round(effDef.range)}`];
  if (effDef.kind !== "buff") {
    lines.push(`⚔️攻撃力 ${round1(effDef.dmg)}`, `⏱${effDef.cooldown}秒間隔`, `📈DPS ${round1(effDef.dmg / effDef.cooldown)}`);
  }
  if (effDef.kind === "splash") {
    lines.push(`💥範囲半径 ${Math.round(effDef.splash)}`);
    if (effDef.dotDmg) lines.push(`🔥継続 ${round1(effDef.dotDmg)}/秒`);
  } else if (effDef.kind === "chain") {
    lines.push(`🔗連鎖 ${effDef.chainCount}体`, `減衰 ${Math.round((1 - effDef.chainFalloff) * 100)}%/体`);
  } else if (effDef.kind === "slow") {
    lines.push(`❄️減速 ${Math.round(effDef.slow * 100)}%`, `持続 ${effDef.slowDur}秒`);
  } else if (effDef.kind === "dot") {
    lines.push(`🔥継続 ${round1(effDef.dotDmg)}/秒`, `持続 ${effDef.dotDur}秒`);
  } else if (effDef.kind === "pull") {
    lines.push(`⬅️後退 ${effDef.pullDist}px`);
  } else if (effDef.kind === "buff") {
    lines.push(`🛡️攻撃力+${Math.round(effDef.buffDmg * 100)}%`, `攻撃速度+${Math.round(effDef.buffRate * 100)}%`);
  }
  return lines;
}

function renderRoster() {
  updateCoinDisplays();
  updatePowerDisplays();
  const grid = $("char-grid");
  grid.innerHTML = "";
  const loadout = Meta.getLoadout();
  CHAR_ORDER.forEach((id) => {
    const def = CHAR_DEFS[id];
    const owned = Meta.isOwned(id);
    const rank = Meta.rankOf(id);
    const level = Meta.levelOf(id);
    const effDef = owned ? effectiveCharDef(id, rank, level) : null;
    const inLoadout = loadout.includes(id);
    // レベルアップボタンを内包するためbutton要素ではなくdivを使う(button内button回避)
    const card = document.createElement("div");
    card.className = "char-card" + (owned ? "" : " locked") + (inLoadout ? " sel" : "");
    card.style.setProperty("--rc", RARITY_COLOR[def.rarity]);
    card.innerHTML = `
      <div class="char-emoji">${owned ? def.emoji : "❔"}</div>
      <div class="char-name">${owned ? def.name : "？？？"}</div>
      <div class="char-rarity">${RARITY_LABEL[def.rarity]}${owned ? ` Rk${rank} Lv${level}` : ""}</div>
      ${owned ? `<div class="char-desc">${def.desc}</div>` : ""}
      ${owned && def.specialDesc ? `<div class="char-special">${def.specialDesc}</div>` : ""}
      ${owned ? `<div class="char-stats">${formatCharStats(effDef).map((l) => `<span>${l}</span>`).join("")}</div>` : ""}
    `;
    if (owned) {
      card.onclick = () => {
        let cur = Meta.getLoadout();
        if (cur.includes(id)) { cur = cur.filter((x) => x !== id); }
        else {
          if (cur.length >= MAX_LOADOUT) { card.classList.add("warn"); setTimeout(() => card.classList.remove("warn"), 300); return; }
          cur.push(id);
        }
        Meta.setLoadout(cur);
        renderRoster();
      };
      const cost = Meta.levelUpCost(id);
      const lvBtn = document.createElement("button");
      lvBtn.className = "char-lvup-btn";
      lvBtn.textContent = cost === null ? "Lv MAX" : `⬆Lv (${cost}🪙)`;
      lvBtn.disabled = cost === null || Meta.data.coins < cost;
      lvBtn.onclick = (e) => {
        e.stopPropagation(); // カード本体のクリック(編成選択)に伝播させない
        if (Meta.levelUpWithCoins(id)) { checkAndToastAchievements(); renderRoster(); }
      };
      card.appendChild(lvBtn);
    }
    grid.appendChild(card);
  });
}

// ===== ガチャ =====
$("btn-gacha-back").onclick = () => showScreen("s-camp-home");
function renderGachaScreen() {
  updateCoinDisplays();
  $("gacha-cost-1").textContent = GACHA_COST_SINGLE + "🪙";
  $("gacha-cost-10").textContent = GACHA_COST_TEN + "🪙";
  $("gacha-result").hidden = true;
  $("btn-gacha-1").disabled = Meta.data.coins < GACHA_COST_SINGLE;
  $("btn-gacha-10").disabled = Meta.data.coins < GACHA_COST_TEN;
}
// ガチャ演出: 結果はすぐに表示せず、いったんベールで隠してタップで開封させる(ソシャゲでおなじみの「もったいぶり」)
let pendingGachaResults = null;
$("btn-gacha-1").onclick = () => { const r = Meta.pullOnce(); if (r) openGachaVeil([r]); };
$("btn-gacha-10").onclick = () => { const rs = Meta.pullTen(); if (rs) openGachaVeil(rs); };
function openGachaVeil(results) {
  pendingGachaResults = results;
  $("gacha-result").hidden = true;
  $("gacha-veil").hidden = false;
}
$("gacha-veil").onclick = () => {
  $("gacha-veil").hidden = true;
  if (pendingGachaResults) { showGachaResults(pendingGachaResults); pendingGachaResults = null; }
};
function showGachaResults(results) {
  checkAndToastAchievements();
  updateCoinDisplays();
  $("btn-gacha-1").disabled = Meta.data.coins < GACHA_COST_SINGLE;
  $("btn-gacha-10").disabled = Meta.data.coins < GACHA_COST_TEN;

  // ★4以上が含まれていたら開封の瞬間に画面フラッシュ(一番レア度が高いものの色を使う)
  const bestRarity = results.reduce((m, r) => Math.max(m, r.rarity), 0);
  if (bestRarity >= 4) {
    const flash = $("gacha-flash");
    flash.style.background = `radial-gradient(circle, ${RARITY_COLOR[bestRarity]} 0%, transparent 70%)`;
    flash.classList.remove("on"); void flash.offsetWidth; // アニメーションを再生させるための強制リフロー
    flash.classList.add("on");
  }

  const wrap = $("gacha-result");
  wrap.innerHTML = "";
  results.forEach((r, i) => {
    const def = CHAR_DEFS[r.id];
    const card = document.createElement("div");
    card.className = "gacha-card" + (r.rarity >= 4 ? ` rarity-${r.rarity}` : "");
    card.style.setProperty("--rc", RARITY_COLOR[r.rarity]);
    card.style.animationDelay = (i * 0.12) + "s, " + (i * 0.12 + 0.4) + "s";
    const tag = r.refund ? `+${r.refund}🪙還元` : (r.isNew ? "NEW!" : "Rank Up→" + r.rank);
    card.innerHTML = `<div class="gc-emoji">${def.emoji}</div><div class="gc-name">${def.name}</div><div class="gc-rarity">${RARITY_LABEL[r.rarity]}</div><div class="gc-tag">${tag}</div>`;
    wrap.appendChild(card);
  });
  wrap.hidden = false;
}

// ===== バトル =====
const CG = { sim: null, rafId: null, lastTs: 0, simAcc: 0, placingChar: null, resultShown: false, stage: null, diffKey: null };
// 攻撃演出(与ダメージ数値・撃破エフェクト・タワー発射反動・凍結演出・古竜ノヴァのフラッシュ)。表示専用でsimの状態には影響しない
function freshFx() { return { damageTexts: [], killBursts: [], freezeBursts: [], towerFlash: {}, novaFlash: 0, novaColor: "#fff" }; }
CG.fx = freshFx();
const CFIXED_DT = 1 / 60, CMAX_STEPS = 240;
let campHoverXY = null;
const cCanvas = $("c-board");
const cCtx = cCanvas.getContext("2d");

function startCampaignBattle(stage, diffKey, opts) {
  const loadout = Meta.getLoadout();
  const equippedDefs = {};
  loadout.forEach((id) => { equippedDefs[id] = effectiveCharDef(id, Meta.rankOf(id), Meta.levelOf(id)); });
  CG.sim = new CampaignSim(stage, diffKey, equippedDefs);
  CG.stage = stage; CG.diffKey = diffKey;
  CG.isDaily = !!(opts && opts.isDaily);
  CG.resultShown = false;
  CG.placingChar = null;
  CG.fx = freshFx();
  $("camp-sell-panel").hidden = true;
  $("camp-place-hint").hidden = true;
  buildCampShopRow(loadout);
  updateAutoSkipBtn();
  showScreen("s-camp-battle");
  CG.simAcc = 0; CG.lastTs = performance.now();
  if (!CG.rafId) CG.rafId = requestAnimationFrame(campLoop);
}

function buildCampShopRow(loadout) {
  const row = $("camp-shop-row");
  row.innerHTML = "";
  loadout.forEach((id) => {
    const def = CG.sim.charDefs[id];
    const b = document.createElement("button");
    b.className = "shop-btn";
    b.dataset.charId = id;
    b.innerHTML = `<span class="sb-icon">${def.emoji}</span><span>${def.name}</span><span class="sb-cost">${def.cost}</span>`;
    b.onclick = () => onCampShopClick(id, b);
    row.appendChild(b);
  });
}
function onCampShopClick(id, btn) {
  if (CG.placingChar === id) {
    CG.placingChar = null; $("camp-place-hint").hidden = true;
    document.querySelectorAll("#camp-shop-row .shop-btn").forEach((b) => b.classList.remove("sel"));
    return;
  }
  CG.placingChar = id;
  document.querySelectorAll("#camp-shop-row .shop-btn").forEach((b) => b.classList.toggle("sel", b === btn));
  $("camp-sell-panel").hidden = true;
  $("camp-place-hint").hidden = false;
  const def = CG.sim.charDefs[id];
  $("camp-place-hint").textContent = def.emoji + " " + def.name + "を置く場所をタップ";
}

function getCBoardXY(evt) {
  const rect = cCanvas.getBoundingClientRect();
  const scaleX = cCanvas.width / rect.width, scaleY = cCanvas.height / rect.height;
  return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
}
cCanvas.addEventListener("mousemove", (e) => { campHoverXY = getCBoardXY(e); });
cCanvas.addEventListener("click", (e) => {
  if (!CG.sim) return;
  const { x, y } = getCBoardXY(e);
  if (CG.placingChar) {
    const col = Math.floor(x / CCELL), row = Math.floor(y / CCELL);
    if (col >= 0 && row >= 0 && col < CCOLS && row < CROWS) {
      if (CG.sim.applyPlaceTower(col, row, CG.placingChar)) { Meta.trackMission("placeTower", 1); Meta.trackStat("towersPlaced", 1); }
    }
    CG.placingChar = null;
    document.querySelectorAll("#camp-shop-row .shop-btn").forEach((b) => b.classList.remove("sel"));
    $("camp-place-hint").hidden = true;
    return;
  }
  const hit = CG.sim.towers.find((t) => {
    const cx = t.col * CCELL + CCELL / 2, cy = t.row * CCELL + CCELL / 2;
    return Math.hypot(cx - x, cy - y) <= 20;
  });
  if (hit) openCampSellPanel(hit);
  else $("camp-sell-panel").hidden = true;
});
function openCampSellPanel(t) {
  const def = CG.sim.charDefs[t.charId];
  const canLevel = t.level < BATTLE_MAX_LEVEL;
  const levelCost = canLevel ? battleLevelUpCost(def.cost, t.level) : null;
  $("camp-sell-info").textContent = `${def.emoji}${def.name} Lv${t.level}` + (canLevel ? ` (強化:${levelCost}🪙)` : "(MAX)");
  $("btn-camp-levelup").disabled = !canLevel;
  $("btn-camp-levelup").onclick = () => { CG.sim.applyLevelUp(t.id); openCampSellPanel(t); };
  $("btn-camp-sell").onclick = () => { CG.sim.applySellTower(t.id); $("camp-sell-panel").hidden = true; };
  $("camp-sell-panel").hidden = false;
}
$("btn-camp-sell-cancel").onclick = () => { $("camp-sell-panel").hidden = true; };
$("btn-camp-skip").onclick = () => { if (CG.sim) CG.sim.applySkipPrep(); };

// ===== 自動スキップ(ウェーブ間の準備時間を自動で飛ばす。設定はlocalStorageに保存) =====
let campAutoSkip = localStorage.getItem("towerclash_autoskip") === "1";
function updateAutoSkipBtn() {
  const b = $("btn-camp-autoskip");
  b.textContent = "🔁自動スキップ:" + (campAutoSkip ? "ON" : "OFF");
  b.classList.toggle("on", campAutoSkip);
}
$("btn-camp-autoskip").onclick = () => {
  campAutoSkip = !campAutoSkip;
  try { localStorage.setItem("towerclash_autoskip", campAutoSkip ? "1" : "0"); } catch (e) { /* ignore */ }
  updateAutoSkipBtn();
  if (campAutoSkip && CG.sim && CG.sim.waveState === "prep") CG.sim.applySkipPrep();
};
updateAutoSkipBtn();

// ===== 倍速(バトル全体の進行速度。設定はlocalStorageに保存) =====
let campSpeedMul = Number(localStorage.getItem("towerclash_campspeed")) || 1;
function updateCampSpeedButtons() {
  document.querySelectorAll("#camp-speed-ctrl .speed-btn").forEach((b) => {
    b.classList.toggle("sel", Number(b.dataset.speed) === campSpeedMul);
  });
}
document.querySelectorAll("#camp-speed-ctrl .speed-btn").forEach((btn) => {
  btn.onclick = () => {
    campSpeedMul = Number(btn.dataset.speed);
    try { localStorage.setItem("towerclash_campspeed", String(campSpeedMul)); } catch (e) { /* ignore */ }
    updateCampSpeedButtons();
  };
});
updateCampSpeedButtons();

$("btn-camp-quit").onclick = () => { CG.sim = null; showScreen("s-camp-home"); updateCoinDisplays(); };

function campLoop(ts) {
  const frameDt = Math.min(1.5, Math.max(0, (ts - CG.lastTs) / 1000));
  CG.lastTs = ts;
  if (CG.sim) {
    if (campAutoSkip && CG.sim.waveState === "prep") CG.sim.applySkipPrep();
    CG.simAcc += frameDt * campSpeedMul;
    let steps = 0;
    const frameEvents = [];
    while (CG.simAcc >= CFIXED_DT && steps < CMAX_STEPS && !CG.sim.over) {
      CG.sim.tick(CFIXED_DT);
      frameEvents.push(...CG.sim.events); // tick()は毎回events配列を作り直すので、フレーム内は蓄積しておく
      CG.simAcc -= CFIXED_DT;
      steps++;
    }
    if (CG.sim.over) CG.simAcc = 0;
    let killCount = 0, waveClearCount = 0;
    frameEvents.forEach((ev) => {
      if (ev.k === "kill") {
        killCount++;
        CG.fx.killBursts.push({ x: ev.x || 0, y: ev.y || 0, t: 0, life: 0.35 });
      } else if (ev.k === "waveClear") {
        waveClearCount++;
      } else if (ev.k === "hit") {
        const jitterX = (Math.random() - 0.5) * 14;
        CG.fx.damageTexts.push({ x: ev.x + jitterX, y: ev.y - 10, text: "-" + ev.amount, color: ev.crit ? "#fff" : ev.color, t: 0, life: 0.7, crit: !!ev.crit });
      } else if (ev.k === "fire") {
        CG.fx.towerFlash[ev.towerId] = 0.15;
      } else if (ev.k === "nova") {
        CG.fx.novaFlash = 0.4; CG.fx.novaColor = ev.color;
      } else if (ev.k === "freeze") {
        CG.fx.freezeBursts.push({ x: ev.x, y: ev.y, t: 0, life: 0.4 });
      }
    });
    if (killCount) { Meta.trackMission("kill", killCount); Meta.trackStat("enemiesKilled", killCount); }
    if (waveClearCount) { Meta.trackMission("waveClear", waveClearCount); Meta.trackStat("wavesCleared", waveClearCount); }

    // 演出タイマーの経過(実時間ベース。倍速設定の影響を受けず一定の速さで再生する)
    const fx = CG.fx;
    fx.damageTexts = fx.damageTexts.filter((d) => (d.t += frameDt) < d.life);
    fx.killBursts = fx.killBursts.filter((b) => (b.t += frameDt) < b.life);
    fx.freezeBursts = fx.freezeBursts.filter((b) => (b.t += frameDt) < b.life);
    if (fx.novaFlash > 0) fx.novaFlash = Math.max(0, fx.novaFlash - frameDt);
    Object.keys(fx.towerFlash).forEach((id) => {
      fx.towerFlash[id] -= frameDt;
      if (fx.towerFlash[id] <= 0) delete fx.towerFlash[id];
    });

    campRenderAll(CG.sim);
    if (CG.sim.over && !CG.resultShown) {
      CG.resultShown = true;
      setTimeout(() => showCampResult(CG.sim), 500);
    }
  }
  CG.rafId = requestAnimationFrame(campLoop);
}

function campRenderAll(sim) {
  cCtx.clearRect(0, 0, CBOARD_W, CBOARD_H);
  cCtx.fillStyle = "#0f1830"; cCtx.fillRect(0, 0, CBOARD_W, CBOARD_H);

  cCtx.strokeStyle = "rgba(255,255,255,0.04)";
  for (let c = 0; c <= CCOLS; c++) { cCtx.beginPath(); cCtx.moveTo(c * CCELL, 0); cCtx.lineTo(c * CCELL, CBOARD_H); cCtx.stroke(); }
  for (let r = 0; r <= CROWS; r++) { cCtx.beginPath(); cCtx.moveTo(0, r * CCELL); cCtx.lineTo(CBOARD_W, r * CCELL); cCtx.stroke(); }

  cCtx.fillStyle = "#2a3357";
  sim.stage.path.forEach(([c, r]) => cCtx.fillRect(c * CCELL + 3, r * CCELL + 3, CCELL - 6, CCELL - 6));

  cCtx.font = "26px sans-serif"; cCtx.textAlign = "center"; cCtx.textBaseline = "middle";
  const pts = sim.path.points;
  cCtx.fillText("🚩", pts[0].x, pts[0].y);
  cCtx.fillText("🏯", pts[pts.length - 1].x, pts[pts.length - 1].y);

  if (CG.placingChar) {
    const def = sim.charDefs[CG.placingChar];
    cCtx.fillStyle = "rgba(58,107,255,0.12)";
    for (let r = 0; r < CROWS; r++) for (let c = 0; c < CCOLS; c++) if (sim.cellFree(c, r)) cCtx.fillRect(c * CCELL + 2, r * CCELL + 2, CCELL - 4, CCELL - 4);
    if (campHoverXY) {
      cCtx.beginPath(); cCtx.arc(campHoverXY.x, campHoverXY.y, def.range, 0, Math.PI * 2);
      cCtx.strokeStyle = "rgba(255,255,255,0.35)"; cCtx.stroke();
    }
  }

  sim.towers.forEach((t) => {
    const def = sim.charDefs[t.charId];
    const cx = t.col * CCELL + CCELL / 2, cy = t.row * CCELL + CCELL / 2;
    // 発射反動: 撃った直後だけ一瞬大きくなる
    const flash = CG.fx.towerFlash[t.id] || 0;
    const pulse = flash > 0 ? 1 + (flash / 0.15) * 0.35 : 1;
    cCtx.beginPath(); cCtx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
    cCtx.fillStyle = def.color; cCtx.fill();
    if (flash > 0) { cCtx.strokeStyle = "#fff"; cCtx.lineWidth = 2; cCtx.stroke(); cCtx.lineWidth = 1; }
    cCtx.font = (18 * (flash > 0 ? 1.15 : 1)) + "px sans-serif"; cCtx.fillText(def.emoji, cx, cy - 1);
    if (t.level > 1) { cCtx.font = "11px sans-serif"; cCtx.fillStyle = "#fff"; cCtx.fillText("Lv" + t.level, cx, cy + 21); }
  });

  // 飛翔体: 進捗に応じて弾が飛んでいく軌跡+先端の光る弾頭
  sim.projectiles.forEach((p) => {
    const frac = Math.min(1, p.t / p.life);
    const hx = p.x + (p.tx - p.x) * frac, hy = p.y + (p.ty - p.y) * frac;
    cCtx.strokeStyle = p.color; cCtx.globalAlpha = 0.5; cCtx.lineWidth = 2;
    cCtx.beginPath(); cCtx.moveTo(p.x, p.y); cCtx.lineTo(hx, hy); cCtx.stroke();
    cCtx.globalAlpha = 1; cCtx.lineWidth = 1;
    cCtx.beginPath(); cCtx.arc(hx, hy, p.kind === "splash" ? 6 : 4, 0, Math.PI * 2);
    cCtx.fillStyle = "#fff"; cCtx.fill();
    cCtx.beginPath(); cCtx.arc(hx, hy, p.kind === "splash" ? 4 : 2.5, 0, Math.PI * 2);
    cCtx.fillStyle = p.color; cCtx.fill();
  });

  sim.enemies.forEach((e) => {
    const md = MONSTER_DEFS[e.type];
    const p = sim.pointOnPath(e.dist);
    const isBoss = e.type === "boss";
    cCtx.beginPath(); cCtx.arc(p.x, p.y, isBoss ? 20 : 14, 0, Math.PI * 2);
    cCtx.fillStyle = e.slow ? "#7dd3fc" : (e.burn ? "#fb923c" : md.color); cCtx.fill();
    cCtx.font = (isBoss ? "24px" : "16px") + " sans-serif"; cCtx.fillText(md.emoji, p.x, p.y - 1);
    const w = isBoss ? 36 : 26, barY = p.y - (isBoss ? 30 : 24), hpr = Math.max(0, e.hp / e.hpMax);
    cCtx.fillStyle = "#000a"; cCtx.fillRect(p.x - w / 2, barY, w, 5);
    cCtx.fillStyle = hpr > 0.5 ? "#4ade80" : hpr > 0.25 ? "#facc15" : "#f87171";
    cCtx.fillRect(p.x - w / 2, barY, w * hpr, 5);
  });

  // 撃破エフェクト(広がって消えるリング)
  cCtx.lineWidth = 3;
  CG.fx.killBursts.forEach((b) => {
    const frac = b.t / b.life;
    cCtx.globalAlpha = 1 - frac;
    cCtx.strokeStyle = "#fde047";
    cCtx.beginPath(); cCtx.arc(b.x, b.y, 10 + frac * 22, 0, Math.PI * 2); cCtx.stroke();
  });
  // 完全凍結エフェクト
  CG.fx.freezeBursts.forEach((b) => {
    const frac = b.t / b.life;
    cCtx.globalAlpha = 1 - frac;
    cCtx.font = (16 + frac * 14) + "px sans-serif";
    cCtx.fillText("❄️", b.x, b.y);
  });
  cCtx.globalAlpha = 1; cCtx.lineWidth = 1;

  // 与ダメージ数値(上に浮かびながらフェードアウト)
  CG.fx.damageTexts.forEach((d) => {
    const frac = d.t / d.life;
    cCtx.globalAlpha = 1 - frac;
    cCtx.font = (d.crit ? "bold 17px" : "13px") + " sans-serif";
    cCtx.fillStyle = "#000a";
    cCtx.fillText(d.text, d.x + 1, d.y - frac * 26 + 1);
    cCtx.fillStyle = d.color;
    cCtx.fillText(d.text, d.x, d.y - frac * 26);
  });
  cCtx.globalAlpha = 1;

  // 古竜のノヴァ: 画面全体を巻き込むフラッシュ
  if (CG.fx.novaFlash > 0) {
    cCtx.globalAlpha = Math.min(0.6, (CG.fx.novaFlash / 0.4) * 0.6);
    cCtx.fillStyle = CG.fx.novaColor;
    cCtx.fillRect(0, 0, CBOARD_W, CBOARD_H);
    cCtx.globalAlpha = 1;
  }

  campUpdateHud(sim);
}

function campUpdateHud(sim) {
  $("camp-wave-tag").textContent = `Wave ${Math.min(sim.waveIndex + 1, sim.stage.waveCount)}/${sim.stage.waveCount}`;
  const hpPct = Math.max(0, (sim.hp / sim.hpMax) * 100);
  $("camp-hp-fill").style.width = hpPct + "%";
  $("camp-hp-text").textContent = Math.max(0, Math.round(sim.hp));
  $("camp-gold-val").textContent = Math.floor(sim.gold);
  const prepWrap = $("camp-prep-wrap");
  if (sim.waveState === "prep") {
    prepWrap.hidden = false;
    $("camp-prep-text").textContent = `次のウェーブまで ${Math.ceil(Math.max(0, sim.prepTimer))}`;
  } else prepWrap.hidden = true;
  document.querySelectorAll("#camp-shop-row .shop-btn").forEach((b) => {
    const def = sim.charDefs[b.dataset.charId];
    b.disabled = sim.gold < def.cost;
  });
}

function showCampResult(sim) {
  const stage = CG.stage, diffKey = CG.diffKey, isDaily = CG.isDaily;
  let total = sim.wavesCleared * 5;
  let firstClear = false, dailyGranted = false, dailyReward = 0;

  if (sim.victory) {
    Meta.trackMission("stageClear", 1);
    if (diffKey === "hard") Meta.trackMission("hardClear", 1);
    Meta.trackStat("stagesCleared", 1);

    if (isDaily) {
      Meta.trackStat("dailyStageClears", 1);
      dailyReward = Math.round(stage.baseCoin * 2.5);
      dailyGranted = Meta.claimDailyStageReward();
      if (dailyGranted) total += dailyReward;
    } else {
      const diff = DIFFICULTIES[diffKey];
      total += Math.round(stage.baseCoin * diff.coinMul);
      firstClear = Meta.markCleared(stage.id, diffKey);
      if (firstClear) total += 50;
    }
  }
  Meta.addCoins(total);
  checkAndToastAchievements();
  Meta.grantMatchXp(Meta.getLoadout(), sim.victory ? MATCH_XP_WIN : MATCH_XP_LOSE);
  updateDailyBadges();

  $("camp-result-title").textContent = sim.victory ? "🎉 ステージクリア!" : "💥 敗北…";
  $("camp-result-detail").textContent = sim.victory
    ? `全${stage.waveCount}ウェーブを突破しました`
    : `Wave ${sim.wavesCleared}/${stage.waveCount}まで到達`;
  let coinText = `🪙 +${total} コイン獲得`;
  if (firstClear) coinText += "(初クリアボーナス+50含む)";
  else if (isDaily && sim.victory) coinText += dailyGranted ? "(本日のデイリー報酬を含む)" : "(デイリー報酬は本日受け取り済み)";
  $("camp-coin-earn").textContent = coinText;

  const nextStage = !isDaily ? STAGES[stage.id + 1] : null;
  $("btn-camp-next").hidden = !(sim.victory && nextStage);
  if (sim.victory && nextStage) $("btn-camp-next").onclick = () => startCampaignBattle(nextStage, diffKey);
  $("btn-camp-retry").onclick = () => startCampaignBattle(stage, diffKey, { isDaily });
  $("btn-camp-result-back").textContent = isDaily ? "デイリーへ戻る" : "ステージ選択に戻る";
  $("btn-camp-result-back").onclick = () => {
    CG.sim = null;
    if (isDaily) { renderDailyStageScreen(); showScreen("s-daily-stage"); }
    else { showScreen("s-camp-stages"); renderStageGrid(); }
  };

  showScreen("s-camp-result");
}

// ===== デイリー要素(ボーナス/ミッション/ステージ) =====
function updateDailyBadges() {
  Meta.ensureDaily();
  $("badge-bonus").hidden = Meta.data.daily.bonusClaimed;
  $("badge-missions").hidden = !Meta.hasClaimableMission();
  $("badge-dailystage").hidden = Meta.isDailyStageClearedToday();
  const prog = Meta.achievementProgress();
  const achLabel = $("ach-btn-label");
  if (achLabel) achLabel.textContent = `実績(${prog.unlocked}/${prog.total})`;
}

// ===== 総合戦力(編成の強さをひと目でわかる数値に) =====
function updatePowerDisplays() {
  const power = totalPowerOf(Meta.getLoadout());
  Meta.updatePowerPeak(power);
  ["home-power", "roster-power"].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = "⚡総合戦力 " + power.toLocaleString();
  });
}

// ===== 実績解除トースト =====
function showAchievementToasts(list) {
  const container = $("achievement-toast-container");
  list.forEach((a, i) => {
    const el = document.createElement("div");
    el.className = "ach-toast";
    el.innerHTML = `<span class="at-emoji">${a.emoji}</span><div><div class="at-title">🏆実績解除!</div><div class="at-name">${a.name}</div></div><span class="at-reward">+${a.reward}🪙</span>`;
    container.appendChild(el);
    setTimeout(() => el.classList.add("show"), 30 + i * 150);
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 400);
    }, 3200 + i * 150);
  });
  updateDailyBadges();
}
function checkAndToastAchievements() {
  const newly = Meta.checkAchievements();
  if (newly.length) showAchievementToasts(newly);
}

// ===== 実績画面 =====
$("btn-achievements").onclick = () => { renderAchievementsScreen(); showScreen("s-achievements"); };
$("btn-achievements-back").onclick = () => { showScreen("s-camp-home"); updateCoinDisplays(); updateDailyBadges(); };
function renderAchievementsScreen() {
  updateCoinDisplays();
  const prog = Meta.achievementProgress();
  $("ach-progress-text").textContent = `解除済み ${prog.unlocked} / ${prog.total}`;
  const list = $("ach-list");
  list.innerHTML = "";
  ACHIEVEMENTS.forEach((a) => {
    const unlocked = !!Meta.data.achievements[a.id];
    const card = document.createElement("div");
    card.className = "ach-card" + (unlocked ? " unlocked" : "");
    card.innerHTML = `
      <div class="ach-emoji">${unlocked ? a.emoji : "🔒"}</div>
      <div class="ach-body">
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>
      <div class="ach-reward">🪙${a.reward}</div>
    `;
    list.appendChild(card);
  });
}

// ---- デイリーボーナス ----
$("btn-daily-bonus").onclick = () => { renderDailyBonusScreen(); showScreen("s-daily-bonus"); };
$("btn-daily-bonus-back").onclick = () => { showScreen("s-camp-home"); updateCoinDisplays(); updateDailyBadges(); };
function renderDailyBonusScreen() {
  Meta.ensureDaily();
  updateCoinDisplays();
  const d = Meta.data.daily;
  const nextDay = (d.bonusStreak % DAILY_BONUS_TABLE.length) + 1;
  $("bonus-coin-val").textContent = Meta.data.coins;
  $("bonus-streak-text").textContent = d.bonusClaimed
    ? `Day${d.bonusStreak} 受け取り済み。また明日!`
    : `Day${nextDay}の報酬を受け取れます`;
  const cal = $("bonus-calendar");
  cal.innerHTML = "";
  DAILY_BONUS_TABLE.forEach((coin, i) => {
    const dayNum = i + 1;
    let state = "future";
    if (dayNum < nextDay || (dayNum === nextDay && d.bonusClaimed)) state = "done";
    else if (dayNum === nextDay) state = "today";
    const cell = document.createElement("div");
    cell.className = "bonus-day " + state;
    cell.innerHTML = `<div class="bd-day">Day${dayNum}</div><div class="bd-coin">🪙${coin}</div>`;
    cal.appendChild(cell);
  });
  $("btn-claim-bonus").disabled = d.bonusClaimed;
  $("btn-claim-bonus").textContent = d.bonusClaimed ? "受け取り済み" : "受け取る";
}
$("btn-claim-bonus").onclick = () => {
  if (Meta.claimDailyBonus()) { checkAndToastAchievements(); renderDailyBonusScreen(); updateDailyBadges(); }
};

// ---- デイリーミッション ----
$("btn-daily-missions").onclick = () => { renderDailyMissionsScreen(); showScreen("s-daily-missions"); };
$("btn-daily-missions-back").onclick = () => { showScreen("s-camp-home"); updateCoinDisplays(); updateDailyBadges(); };
function renderDailyMissionsScreen() {
  Meta.ensureDaily();
  updateCoinDisplays();
  const list = $("mission-list");
  list.innerHTML = "";
  Meta.data.daily.missions.forEach((m, idx) => {
    const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
    const card = document.createElement("div");
    card.className = "mission-card" + (m.claimed ? " claimed" : "");
    card.innerHTML = `
      <div class="mission-desc">${m.desc}</div>
      <div class="mission-bar-wrap"><div class="mission-bar" style="width:${pct}%"></div></div>
      <div class="mission-foot">
        <span class="mission-progress">${m.progress}/${m.target}</span>
        <span class="mission-reward">🪙${m.reward}</span>
      </div>
    `;
    const btn = document.createElement("button");
    const ready = !m.claimed && m.progress >= m.target;
    btn.className = "btn small" + (ready ? "" : " ghost");
    btn.textContent = m.claimed ? "受取済み" : (ready ? "受け取る" : "挑戦中");
    btn.disabled = !ready;
    btn.onclick = () => { Meta.claimMission(idx); checkAndToastAchievements(); renderDailyMissionsScreen(); updateDailyBadges(); };
    card.appendChild(btn);
    list.appendChild(card);
  });
}

// ---- デイリーステージ ----
$("btn-daily-stage").onclick = () => { renderDailyStageScreen(); showScreen("s-daily-stage"); };
$("btn-daily-stage-back").onclick = () => { showScreen("s-camp-home"); updateCoinDisplays(); updateDailyBadges(); };
function renderDailyStageScreen() {
  Meta.ensureDaily();
  updateCoinDisplays();
  const stage = Meta.getDailyStage();
  const cleared = Meta.isDailyStageClearedToday();
  const reward = Math.round(stage.baseCoin * 2.5);
  $("daily-stage-card").innerHTML = `
    <div class="stage-emoji" style="font-size:3rem">${stage.emoji}</div>
    <div class="stage-name" style="font-size:1.1rem">${stage.name}</div>
    <p class="sub">${stage.desc}</p>
    <p class="sub">難易度: デイリー(通常よりやや強化)</p>
    <p class="sub">報酬: 🪙${reward}${cleared ? "(本日は受け取り済み)" : ""}</p>
  `;
  $("btn-daily-stage-launch").textContent = cleared ? "もう一度遊ぶ(報酬なし)" : "挑戦する";
}
$("btn-daily-stage-launch").onclick = () => {
  if (Meta.getLoadout().length === 0) { alert("キャラ編成で出撃するキャラを選んでください"); return; }
  startCampaignBattle(Meta.getDailyStage(), "daily", { isDaily: true });
};
