// ===== TOWER CLASH: UI/描画/入力/通信の結合(オンライン対戦) =====
"use strict";

const $ = (id) => document.getElementById(id);
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("on", s.id === id));
}

const G = {
  myRole: null, // 'defender' | 'attacker'
  isHost: false,
  online: null,
  sim: null,
  localCharDefs: {}, // 自分が防衛側のときの編成キャラdefs(ランク反映済み)
  selectedShopType: null,
  hoverXY: null,
  peerDisconnected: false,
  resultShown: false,
  // ゲストが受け取る最新スナップショット(補間用に2枚保持)
  snapPrev: null, snapCur: null, snapPrevT: 0, snapCurT: 0,
  lastBroadcast: 0,
  rafId: null,
  lastTs: 0,
  speedMul: 1,
};

$("ver-tag").textContent = "v" + TOWERCLASH_VERSION;

// ===== 倍速コントロール(ホスト権威: オンライン対戦ではホストのみ変更可) =====
document.querySelectorAll("#speed-ctrl .speed-btn").forEach((btn) => {
  btn.onclick = () => {
    if (!G.isHost) return;
    G.speedMul = Number(btn.dataset.speed);
    G.online.send("speed", { mul: G.speedMul });
    updateSpeedButtons();
  };
});
function updateSpeedButtons() {
  document.querySelectorAll("#speed-ctrl .speed-btn").forEach((b) => {
    b.classList.toggle("sel", Number(b.dataset.speed) === G.speedMul);
  });
  $("speed-ctrl").classList.toggle("readonly", !G.isHost);
}

// ===== タイトル =====
$("btn-help").onclick = () => showScreen("s-help");
$("btn-help-back").onclick = () => showScreen("s-title");

// ===== オンライン対戦セットアップ(ホーム画面のサブ要素) =====
$("tab-create").onclick = () => switchOnlineTab("create");
$("tab-join").onclick = () => switchOnlineTab("join");
function switchOnlineTab(which) {
  $("tab-create").classList.toggle("on", which === "create");
  $("tab-join").classList.toggle("on", which === "join");
  $("pane-create").hidden = which !== "create";
  $("pane-join").hidden = which !== "join";
}
let onlineSetupRole = null;
document.querySelectorAll("#pane-create .role-card").forEach((card) => {
  card.onclick = () => {
    onlineSetupRole = card.dataset.role;
    document.querySelectorAll("#pane-create .role-card").forEach((c) => c.classList.toggle("sel", c === card));
    $("btn-create-room").disabled = false;
    updateLoadoutNote();
  };
});
function updateLoadoutNote() {
  const note = $("loadout-note");
  if (onlineSetupRole === "defender") {
    note.hidden = false;
    $("loadout-note-count").textContent = Meta.getLoadout().length;
  } else {
    note.hidden = true;
  }
}
$("btn-edit-loadout-from-online").onclick = () => {
  ROSTER_RETURN_SCREEN = "s-online";
  renderRoster();
  showScreen("s-camp-roster");
};

$("btn-online").onclick = () => {
  onlineSetupRole = null;
  document.querySelectorAll("#pane-create .role-card").forEach((c) => c.classList.remove("sel"));
  $("btn-create-room").disabled = true;
  $("btn-join-room").disabled = false;
  $("loadout-note").hidden = true;
  $("room-wait").hidden = true;
  $("join-code-input").value = "";
  $("join-status").textContent = "";
  switchOnlineTab("create");
  showScreen("s-online");
};
$("btn-online-back").onclick = () => {
  if (G.online) { G.online.leave(); G.online = null; }
  showScreen("s-camp-home");
  updateCoinDisplays();
};

// ホストは「自分が防衛側→自分の編成」「相手が防衛側→相手から届く編成」が揃うまで待って対戦開始する
let hostRoleChosen = null, hostGuestLoadout = null, hostPeerReady = false, hostMatchBegun = false;
$("btn-create-room").onclick = async () => {
  if (!onlineSetupRole) return;
  $("btn-create-room").disabled = true;
  hostRoleChosen = onlineSetupRole; hostGuestLoadout = null; hostPeerReady = false; hostMatchBegun = false;
  const session = new OnlineSession();
  G.online = session;
  try {
    const code = await session.createRoom();
    $("room-code-display").textContent = code;
    $("room-wait").hidden = false;
    $("waiting-msg").textContent = "相手の参加を待っています…";
    session.on("peerJoined", () => {
      if (hostPeerReady) return;
      hostPeerReady = true;
      session.send("start", { hostRole: onlineSetupRole });
      tryBeginHostMatch(session);
    });
    session.on("loadout", (data) => {
      hostGuestLoadout = data.list;
      tryBeginHostMatch(session);
    });
    session.startPing();
  } catch (e) {
    $("waiting-msg").textContent = "接続に失敗しました。通信環境を確認してもう一度お試しください。";
    $("btn-create-room").disabled = false;
  }
};
function tryBeginHostMatch(session) {
  if (hostMatchBegun || !hostPeerReady) return;
  let charDefs;
  if (hostRoleChosen === "defender") {
    charDefs = defsFromLoadoutPayload(Meta.buildLoadoutPayload());
  } else {
    if (!hostGuestLoadout) { $("waiting-msg").textContent = "対戦相手の編成を確認しています…"; return; }
    charDefs = defsFromLoadoutPayload(hostGuestLoadout);
  }
  hostMatchBegun = true;
  startMatch({ myRole: hostRoleChosen, isHost: true, session, charDefs });
}

$("join-code-input").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
});
$("btn-join-room").onclick = async () => {
  const code = $("join-code-input").value.trim();
  if (code.length < 5) { $("join-status").textContent = "5桁のコードを入力してください"; return; }
  $("join-status").textContent = "接続中…";
  $("btn-join-room").disabled = true;
  const session = new OnlineSession();
  G.online = session;
  let guestMatchBegun = false;
  session.on("start", (data) => {
    if (guestMatchBegun) return;
    guestMatchBegun = true;
    const myRole = data.hostRole === "defender" ? "attacker" : "defender";
    startMatch({ myRole, isHost: false, session });
  });
  try {
    await session.joinRoom(code);
    $("join-status").textContent = "ホストの開始を待っています…";
    session.send("loadout", { list: Meta.buildLoadoutPayload() });
    session.startPing();
  } catch (e) {
    $("join-status").textContent = "接続できませんでした。コードを確認してください。";
    $("btn-join-room").disabled = false;
  }
};

// ===== 対戦開始 =====
function startMatch(opts) {
  G.myRole = opts.myRole;
  G.isHost = !!opts.isHost;
  G.selectedShopType = null;
  G.peerDisconnected = false;
  G.resultShown = false;
  G.snapPrev = null; G.snapCur = null;
  G.speedMul = 1;
  updateSpeedButtons();

  G.sim = G.isHost ? new TowerClashSim(opts.charDefs) : null;

  const session = opts.session;
  session.on("action", (data) => { if (G.sim) applyAction(G.sim, data); });
  session.on("state", (data) => {
    G.snapPrev = G.snapCur; G.snapPrevT = G.snapCurT;
    G.snapCur = data; G.snapCurT = performance.now();
  });
  session.on("peerLeft", () => {
    G.peerDisconnected = true;
    $("hud-net-status").hidden = false;
    $("hud-net-status").textContent = "⚠️ 相手が切断しました";
    showDisconnectResult();
  });
  session.on("speed", (data) => { G.speedMul = data.mul; updateSpeedButtons(); });
  $("hud-net-status").hidden = false;
  $("hud-net-status").textContent = "🌐 接続中";

  $("hud-role-tag").textContent = G.myRole === "defender" ? "🛡️防衛側" : "⚔️侵略側";
  buildShopRow();
  $("sell-panel").hidden = true;
  $("place-hint").hidden = true;
  showScreen("s-game");
  simAcc = 0;
  G.lastTs = performance.now();
  if (!G.rafId) G.rafId = requestAnimationFrame(loop);
}

function applyAction(sim, data) {
  if (data.kind === "place") sim.applyPlaceTower(data.col, data.row, data.type);
  else if (data.kind === "sell") sim.applySellTower(data.id);
  else if (data.kind === "spawn") sim.applySpawnEnemy(data.type);
}

function doPlaceTower(col, row, type) {
  if (!G.isHost) G.online.send("action", { kind: "place", col, row, type });
  else if (G.sim) G.sim.applyPlaceTower(col, row, type);
}
function doSellTower(id) {
  if (!G.isHost) G.online.send("action", { kind: "sell", id });
  else if (G.sim) G.sim.applySellTower(id);
}
function doSpawnEnemy(type) {
  if (!G.isHost) G.online.send("action", { kind: "spawn", type });
  else if (G.sim) G.sim.applySpawnEnemy(type);
}

// ===== ショップUI =====
function buildShopRow() {
  const row = $("shop-row");
  row.innerHTML = "";
  if (G.myRole === "defender") {
    $("hud-resource-label").textContent = "💰ゴールド";
    const loadout = Meta.getLoadout();
    G.localCharDefs = {};
    loadout.forEach((id) => { G.localCharDefs[id] = effectiveCharDef(id, Meta.rankOf(id)); });
    loadout.forEach((id) => {
      const def = G.localCharDefs[id];
      const b = document.createElement("button");
      b.className = "shop-btn";
      b.dataset.type = id;
      b.innerHTML = `<span class="sb-icon">${def.emoji}</span><span>${def.name}</span><span class="sb-cost">${def.cost}</span>`;
      b.onclick = () => onShopClick(id, b);
      row.appendChild(b);
    });
  } else {
    $("hud-resource-label").textContent = "🔷マナ";
    Object.keys(ENEMY_DEFS).forEach((key) => {
      const def = ENEMY_DEFS[key];
      const b = document.createElement("button");
      b.className = "shop-btn";
      b.dataset.type = key;
      b.innerHTML = `<span class="sb-icon">${def.emoji}</span><span>${def.name}</span><span class="sb-cost">${def.cost}</span>`;
      b.onclick = () => onShopClick(key, b);
      row.appendChild(b);
    });
  }
}
function onShopClick(type, btn) {
  if (G.myRole === "defender") {
    if (G.selectedShopType === type) {
      G.selectedShopType = null; $("place-hint").hidden = true;
      document.querySelectorAll(".shop-btn").forEach((x) => x.classList.remove("sel"));
      return;
    }
    G.selectedShopType = type;
    document.querySelectorAll(".shop-btn").forEach((x) => x.classList.toggle("sel", x === btn));
    $("sell-panel").hidden = true;
    $("place-hint").hidden = false;
    const def = G.localCharDefs[type];
    $("place-hint").textContent = def.emoji + " " + def.name + "を置く場所をタップ";
  } else {
    doSpawnEnemy(type);
    btn.classList.add("sel");
    setTimeout(() => btn.classList.remove("sel"), 150);
  }
}

// ===== 盤面クリック =====
const canvas = $("board");
function getCanvasXY(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  const cx = (evt.clientX - rect.left) * scaleX, cy = (evt.clientY - rect.top) * scaleY;
  return { x: cx, y: cy };
}
canvas.addEventListener("mousemove", (e) => { G.hoverXY = getCanvasXY(e); });
canvas.addEventListener("click", (e) => {
  const { x, y } = getCanvasXY(e);
  if (G.myRole !== "defender") return;
  const data = getCurrentData();
  if (!data) return;
  if (G.selectedShopType) {
    const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
    if (col >= 0 && row >= 0 && col < COLS && row < ROWS) doPlaceTower(col, row, G.selectedShopType);
    G.selectedShopType = null;
    document.querySelectorAll(".shop-btn").forEach((b) => b.classList.remove("sel"));
    $("place-hint").hidden = true;
    return;
  }
  // 既存タワーのタップ判定
  const hit = (data.towers || []).find((t) => {
    const cx = t.col * CELL + CELL / 2, cy = t.row * CELL + CELL / 2;
    return Math.hypot(cx - x, cy - y) <= 20;
  });
  if (hit) {
    const def = G.localCharDefs[hit.type];
    $("sell-info").textContent = `${def.emoji}${def.name} (売却:+${Math.round(def.cost * 0.6)})`;
    $("sell-panel").hidden = false;
    $("btn-sell").onclick = () => { doSellTower(hit.id); $("sell-panel").hidden = true; };
  } else {
    $("sell-panel").hidden = true;
  }
});
$("btn-sell-cancel").onclick = () => { $("sell-panel").hidden = true; };

$("btn-quit").onclick = () => { endToHome(); };

function getCurrentData() {
  if (G.sim) return G.sim.serialize();
  return G.snapCur;
}

// ===== メインループ =====
// tabが非アクティブ化されてrAFが間引かれても、経過時間を固定刻みで消化して追いつく(取りこぼし防止)
const FIXED_DT = 1 / 60;
const MAX_CATCHUP_STEPS = 270;
let simAcc = 0;
function loop(ts) {
  const frameDt = Math.min(1.5, Math.max(0, (ts - G.lastTs) / 1000));
  G.lastTs = ts;

  if (G.sim && !G.peerDisconnected) {
    simAcc += frameDt * G.speedMul;
    let steps = 0;
    while (simAcc >= FIXED_DT && steps < MAX_CATCHUP_STEPS && !G.sim.over) {
      G.sim.tick(FIXED_DT);
      simAcc -= FIXED_DT;
      steps++;
    }
    if (G.sim.over) simAcc = 0;
    if (G.isHost) {
      G.lastBroadcast += frameDt;
      if (G.lastBroadcast > 0.06) { G.lastBroadcast = 0; G.online.send("state", G.sim.serialize()); }
    }
    renderAll(G.sim.serialize());
    if (G.sim.over && !G.resultShown) { G.resultShown = true; setTimeout(() => showResult(G.sim.winner, G.sim.reason), 400); }
  } else if (!G.isHost && G.snapCur) {
    const data = interpolatedSnapshot();
    renderAll(data);
    if (G.snapCur.over && !G.resultShown) { G.resultShown = true; setTimeout(() => showResult(G.snapCur.winner, G.snapCur.reason), 400); }
  }
  G.rafId = requestAnimationFrame(loop);
}

function interpolatedSnapshot() {
  if (!G.snapPrev) return G.snapCur;
  const span = G.snapCurT - G.snapPrevT || 1;
  const t = Math.min(1, Math.max(0, (performance.now() - G.snapCurT) / span + 1));
  const lerp = (a, b) => a + (b - a) * t;
  const prevEnemies = {}; G.snapPrev.enemies.forEach((e) => (prevEnemies[e.id] = e));
  const enemies = G.snapCur.enemies.map((e) => {
    const p = prevEnemies[e.id];
    return p ? { ...e, dist: lerp(p.dist, e.dist) } : e;
  });
  return { ...G.snapCur, enemies };
}

// ===== 描画 =====
const ctx = canvas.getContext("2d");
function renderAll(data) {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  ctx.fillStyle = "#0f1830";
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  // グリッド
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, BOARD_H); ctx.stroke(); }
  for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(BOARD_W, r * CELL); ctx.stroke(); }

  // 道
  ctx.fillStyle = "#2a3357";
  PATH_CELLS.forEach(([c, r]) => ctx.fillRect(c * CELL + 3, r * CELL + 3, CELL - 6, CELL - 6));
  // スポーン/拠点
  ctx.font = "26px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("⚔️", PATH_POINTS[0].x, PATH_POINTS[0].y);
  ctx.fillText("🏯", PATH_POINTS[PATH_POINTS.length - 1].x, PATH_POINTS[PATH_POINTS.length - 1].y);

  const charDefs = data.charDefs || {};

  // 設置可能セルのハイライト(防衛側が配置中)
  if (G.myRole === "defender" && G.selectedShopType) {
    ctx.fillStyle = "rgba(58,107,255,0.12)";
    BUILDABLE_CELLS.forEach(([c, r]) => {
      if (!(data.towers || []).some((t) => t.col === c && t.row === r)) ctx.fillRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
    });
    if (G.hoverXY && G.localCharDefs[G.selectedShopType]) {
      const def = G.localCharDefs[G.selectedShopType];
      ctx.beginPath(); ctx.arc(G.hoverXY.x, G.hoverXY.y, def.range, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.stroke();
    }
  }

  // タワー
  (data.towers || []).forEach((t) => {
    const def = charDefs[t.type];
    if (!def) return;
    const cx = t.col * CELL + CELL / 2, cy = t.row * CELL + CELL / 2;
    ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = def.color; ctx.fill();
    ctx.font = "18px sans-serif"; ctx.fillText(def.emoji, cx, cy - 1);
  });

  // 飛翔体
  ctx.lineWidth = 3;
  (data.projectiles || []).forEach((p) => {
    ctx.strokeStyle = p.color;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.tx, p.ty); ctx.stroke();
  });
  ctx.lineWidth = 1;

  // 敵
  (data.enemies || []).forEach((e) => {
    const def = ENEMY_DEFS[e.type];
    const p = pointOnPath(e.dist);
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = e.slow ? "#7dd3fc" : (e.burn ? "#fb923c" : def.color); ctx.fill();
    ctx.font = "16px sans-serif"; ctx.fillText(def.emoji, p.x, p.y - 1);
    // HPバー
    const w = 26, hpr = Math.max(0, e.hp / e.hpMax);
    ctx.fillStyle = "#000a"; ctx.fillRect(p.x - w / 2, p.y - 24, w, 5);
    ctx.fillStyle = hpr > 0.5 ? "#4ade80" : hpr > 0.25 ? "#facc15" : "#f87171";
    ctx.fillRect(p.x - w / 2, p.y - 24, w * hpr, 5);
  });

  updateHud(data);
}

function updateHud(data) {
  const remain = Math.max(0, Math.ceil(MATCH_TIME - data.time));
  const mm = Math.floor(remain / 60), ss = remain % 60;
  $("hud-timer").textContent = mm + ":" + String(ss).padStart(2, "0");
  const hpPct = Math.max(0, (data.defenderHp / data.defenderHpMax) * 100);
  $("hud-hp-fill").style.width = hpPct + "%";
  $("hud-hp-text").textContent = Math.max(0, Math.round(data.defenderHp));

  const myGold = G.myRole === "defender" ? data.gold : data.mana;
  $("hud-resource-val").textContent = G.myRole === "defender" ? Math.floor(data.gold) : Math.floor(data.mana) + "/" + data.manaMax;
  document.querySelectorAll(".shop-btn").forEach((b) => {
    const type = b.dataset.type;
    const def = G.myRole === "defender" ? G.localCharDefs[type] : ENEMY_DEFS[type];
    b.disabled = !def || myGold < def.cost;
  });
}

// ===== 結果 =====
function showResult(winner, reason) {
  const iWin = winner === G.myRole;
  $("result-title").textContent = iWin ? "🎉 勝利!" : "💥 敗北…";
  const reasonText = reason === "hp0"
    ? (winner === "attacker" ? "拠点のHPが0になりました" : "拠点を守り切りました")
    : "制限時間終了(拠点は無事でした)";
  $("result-reason").textContent = reasonText;
  showScreen("s-result");
}
function showDisconnectResult() {
  if (G.resultShown) return;
  G.resultShown = true;
  $("result-title").textContent = "⚠️ 通信切断";
  $("result-reason").textContent = "相手との通信が切れました";
  showScreen("s-result");
}

$("btn-to-title").onclick = () => endToHome();

function endToHome() {
  if (G.online) { G.online.leave(); G.online = null; }
  G.sim = null;
  showScreen("s-camp-home");
  updateCoinDisplays();
}
