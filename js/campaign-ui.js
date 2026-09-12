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
$("btn-campaign").onclick = () => { updateCoinDisplays(); updateDailyBadges(); showScreen("s-camp-home"); };
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
function renderRoster() {
  updateCoinDisplays();
  const grid = $("char-grid");
  grid.innerHTML = "";
  const loadout = Meta.getLoadout();
  CHAR_ORDER.forEach((id) => {
    const def = CHAR_DEFS[id];
    const owned = Meta.isOwned(id);
    const rank = Meta.rankOf(id);
    const inLoadout = loadout.includes(id);
    const card = document.createElement("button");
    card.className = "char-card" + (owned ? "" : " locked") + (inLoadout ? " sel" : "");
    card.style.setProperty("--rc", RARITY_COLOR[def.rarity]);
    card.innerHTML = `
      <div class="char-emoji">${owned ? def.emoji : "❔"}</div>
      <div class="char-name">${owned ? def.name : "？？？"}</div>
      <div class="char-rarity">${RARITY_LABEL[def.rarity]}${owned ? " Rk" + rank : ""}</div>
      ${owned ? `<div class="char-desc">${def.desc}</div>` : ""}
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
    } else card.disabled = true;
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
$("btn-gacha-1").onclick = () => { const r = Meta.pullOnce(); if (r) showGachaResults([r]); };
$("btn-gacha-10").onclick = () => { const rs = Meta.pullTen(); if (rs) showGachaResults(rs); };
function showGachaResults(results) {
  updateCoinDisplays();
  $("btn-gacha-1").disabled = Meta.data.coins < GACHA_COST_SINGLE;
  $("btn-gacha-10").disabled = Meta.data.coins < GACHA_COST_TEN;
  const wrap = $("gacha-result");
  wrap.innerHTML = "";
  results.forEach((r) => {
    const def = CHAR_DEFS[r.id];
    const card = document.createElement("div");
    card.className = "gacha-card";
    card.style.setProperty("--rc", RARITY_COLOR[r.rarity]);
    const tag = r.refund ? `+${r.refund}🪙還元` : (r.isNew ? "NEW!" : "Rank Up→" + r.rank);
    card.innerHTML = `<div class="gc-emoji">${def.emoji}</div><div class="gc-name">${def.name}</div><div class="gc-rarity">${RARITY_LABEL[r.rarity]}</div><div class="gc-tag">${tag}</div>`;
    wrap.appendChild(card);
  });
  wrap.hidden = false;
}

// ===== バトル =====
const CG = { sim: null, rafId: null, lastTs: 0, simAcc: 0, placingChar: null, resultShown: false, stage: null, diffKey: null };
const CFIXED_DT = 1 / 60, CMAX_STEPS = 240;
let campHoverXY = null;
const cCanvas = $("c-board");
const cCtx = cCanvas.getContext("2d");

function startCampaignBattle(stage, diffKey, opts) {
  const loadout = Meta.getLoadout();
  const equippedDefs = {};
  loadout.forEach((id) => { equippedDefs[id] = effectiveCharDef(id, Meta.rankOf(id)); });
  CG.sim = new CampaignSim(stage, diffKey, equippedDefs);
  CG.stage = stage; CG.diffKey = diffKey;
  CG.isDaily = !!(opts && opts.isDaily);
  CG.resultShown = false;
  CG.placingChar = null;
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
      if (CG.sim.applyPlaceTower(col, row, CG.placingChar)) Meta.trackMission("placeTower", 1);
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
$("btn-camp-quit").onclick = () => { CG.sim = null; showScreen("s-camp-home"); updateCoinDisplays(); };

function campLoop(ts) {
  const frameDt = Math.min(1.5, Math.max(0, (ts - CG.lastTs) / 1000));
  CG.lastTs = ts;
  if (CG.sim) {
    if (campAutoSkip && CG.sim.waveState === "prep") CG.sim.applySkipPrep();
    CG.simAcc += frameDt;
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
      if (ev.k === "kill") killCount++;
      else if (ev.k === "waveClear") waveClearCount++;
    });
    if (killCount) Meta.trackMission("kill", killCount);
    if (waveClearCount) Meta.trackMission("waveClear", waveClearCount);
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
    cCtx.beginPath(); cCtx.arc(cx, cy, 16, 0, Math.PI * 2);
    cCtx.fillStyle = def.color; cCtx.fill();
    cCtx.font = "18px sans-serif"; cCtx.fillText(def.emoji, cx, cy - 1);
    if (t.level > 1) { cCtx.font = "11px sans-serif"; cCtx.fillStyle = "#fff"; cCtx.fillText("Lv" + t.level, cx, cy + 21); }
  });

  cCtx.lineWidth = 3;
  sim.projectiles.forEach((p) => { cCtx.strokeStyle = p.color; cCtx.beginPath(); cCtx.moveTo(p.x, p.y); cCtx.lineTo(p.tx, p.ty); cCtx.stroke(); });
  cCtx.lineWidth = 1;

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

    if (isDaily) {
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
  if (Meta.claimDailyBonus()) { renderDailyBonusScreen(); updateDailyBadges(); }
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
    btn.onclick = () => { Meta.claimMission(idx); renderDailyMissionsScreen(); updateDailyBadges(); };
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
