// ===== TOWER CLASH: オンライン対戦シミュレーション本体(ホスト権威) =====
"use strict";

const CELL = 50;
const COLS = 16;
const ROWS = 9;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const MATCH_TIME = 180; // 秒

// 敵の通り道 (グリッド座標、蛇行)
const PATH_CELLS = [
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [5, 2], [6, 2], [7, 2],
  [7, 3], [7, 4], [7, 5], [7, 6], [8, 6], [9, 6], [10, 6], [10, 5], [10, 4], [10, 3],
  [11, 3], [12, 3], [13, 3], [14, 3], [15, 3],
];
const PATH_SET = new Set(PATH_CELLS.map(([c, r]) => c + "," + r));
const PATH_POINTS = PATH_CELLS.map(([c, r]) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 }));
// 経路の累積長さ(px)
const PATH_SEG_LEN = [];
for (let i = 1; i < PATH_POINTS.length; i++) {
  const a = PATH_POINTS[i - 1], b = PATH_POINTS[i];
  PATH_SEG_LEN.push(Math.hypot(b.x - a.x, b.y - a.y));
}
const PATH_TOTAL_LEN = PATH_SEG_LEN.reduce((a, b) => a + b, 0);

function pointOnPath(dist) {
  if (dist <= 0) return { ...PATH_POINTS[0] };
  let d = dist;
  for (let i = 0; i < PATH_SEG_LEN.length; i++) {
    const segLen = PATH_SEG_LEN[i];
    if (d <= segLen || i === PATH_SEG_LEN.length - 1) {
      const t = segLen > 0 ? Math.min(1, d / segLen) : 1;
      const a = PATH_POINTS[i], b = PATH_POINTS[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= segLen;
  }
  return { ...PATH_POINTS[PATH_POINTS.length - 1] };
}

// 防衛側は自分の編成キャラ(CHAR_DEFS由来、ランク反映済み)を持ち込む。TOWER_DEFSは未編成時の保険用フォールバック。
const TOWER_DEFS = {
  arrow: { name: "アロー弓兵", cost: 50, dmg: 9, cooldown: 0.9, range: 135, kind: "single", color: "#7dd3fc", emoji: "🏹" },
  cannon: { name: "キャノン砲兵", cost: 100, dmg: 26, cooldown: 1.6, range: 115, kind: "splash", splash: 55, color: "#fca5a5", emoji: "💣" },
  frost: { name: "フロスト氷術師", cost: 80, dmg: 4, cooldown: 1.0, range: 125, kind: "slow", slow: 0.5, slowDur: 2.5, color: "#a5f3fc", emoji: "❄️" },
};

const ENEMY_DEFS = {
  grunt: { name: "グラント", cost: 20, hp: 32, speed: 72, dmg: 1, gold: 6, color: "#facc15", emoji: "👾" },
  runner: { name: "ランナー", cost: 30, hp: 20, speed: 135, dmg: 1, gold: 7, color: "#4ade80", emoji: "⚡" },
  tank: { name: "タンク", cost: 58, hp: 150, speed: 42, dmg: 2, gold: 16, color: "#f472b6", emoji: "🛡️" },
};

function cellFree(col, row, towers) {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
  if (PATH_SET.has(col + "," + row)) return false;
  return !towers.some((t) => t.col === col && t.row === row);
}

class TowerClashSim {
  constructor(charDefs) {
    this.charDefs = charDefs || TOWER_DEFS;
    this.time = 0;
    this.over = false;
    this.winner = null; // 'defender' | 'attacker'
    this.reason = null; // 'hp0' | 'timeup'
    this.defenderHp = 20;
    this.defenderHpMax = 20;
    this.gold = 150;
    this.mana = 100;
    this.manaMax = 220;
    this.towers = []; // {id,col,row,type,cd}
    this.enemies = []; // {id,type,dist,hp,hpMax,slow,burn}
    this.projectiles = []; // {id,x,y,tx,ty,color,t,life}
    this._nextId = 1;
    this.events = []; // 直近ティックの演出イベント(着弾/撃破/到達)
  }

  serialize() {
    return {
      time: this.time, over: this.over, winner: this.winner, reason: this.reason,
      defenderHp: this.defenderHp, defenderHpMax: this.defenderHpMax,
      gold: this.gold, mana: this.mana, manaMax: this.manaMax,
      charDefs: this.charDefs,
      towers: this.towers.map((t) => ({ id: t.id, col: t.col, row: t.row, type: t.type })),
      enemies: this.enemies.map((e) => ({ id: e.id, type: e.type, dist: e.dist, hp: e.hp, hpMax: e.hpMax, slow: e.slow, burn: e.burn })),
      projectiles: this.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, tx: p.tx, ty: p.ty, color: p.color })),
      events: this.events,
    };
  }

  applyPlaceTower(col, row, type) {
    if (this.over) return false;
    const def = this.charDefs[type];
    if (!def || this.gold < def.cost) return false;
    if (!cellFree(col, row, this.towers)) return false;
    this.gold -= def.cost;
    this.towers.push({ id: this._nextId++, col, row, type, cd: 0, atkCount: 0 });
    return true;
  }

  applySellTower(id) {
    if (this.over) return false;
    const idx = this.towers.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    const def = this.charDefs[this.towers[idx].type];
    this.gold += Math.round(def.cost * 0.6);
    this.towers.splice(idx, 1);
    return true;
  }

  applySpawnEnemy(type) {
    if (this.over) return false;
    const def = ENEMY_DEFS[type];
    if (!def || this.mana < def.cost) return false;
    this.mana -= def.cost;
    this.enemies.push({ id: this._nextId++, type, dist: 0, hp: def.hp, hpMax: def.hp, slow: null, burn: null });
    return true;
  }

  tick(dt) {
    if (this.over) { this.events = []; return; }
    this.events = [];
    this.time += dt;
    this.gold += 4 * dt;
    this.mana = Math.min(this.manaMax, this.mana + 5 * dt);

    // 敵の移動+継続効果
    for (const e of this.enemies) {
      const def = ENEMY_DEFS[e.type];
      let slowMul = 1;
      if (e.slow) { e.slow.t -= dt; if (e.slow.t <= 0) e.slow = null; else slowMul = 1 - e.slow.factor; }
      e.dist += def.speed * slowMul * dt;
      if (e.burn) { e.hp -= e.burn.dps * dt; e.burn.t -= dt; if (e.burn.t <= 0) e.burn = null; }
    }
    // 拠点到達判定
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dist >= PATH_TOTAL_LEN) {
        const def = ENEMY_DEFS[e.type];
        this.defenderHp -= def.dmg;
        this.events.push({ k: "leak", type: e.type });
        this.enemies.splice(i, 1);
      }
    }

    // 支援(buff)キャラの効果を先に集計(騎士王の特殊で射程バフも追加)
    const buffMap = {};
    for (const t of this.towers) {
      const def = this.charDefs[t.type];
      if (!def || def.kind !== "buff") continue;
      const tx = t.col * CELL + CELL / 2, ty = t.row * CELL + CELL / 2;
      for (const o of this.towers) {
        if (o === t) continue;
        const ox = o.col * CELL + CELL / 2, oy = o.row * CELL + CELL / 2;
        if (Math.hypot(ox - tx, oy - ty) <= def.range) {
          if (!buffMap[o.id]) buffMap[o.id] = { dmgBonus: 0, cdBonus: 0, rangeBonus: 0 };
          buffMap[o.id].dmgBonus += def.buffDmg || 0;
          buffMap[o.id].cdBonus += def.buffRate || 0;
          if (def.special && def.special.kind === "rangeBuff") buffMap[o.id].rangeBonus += def.special.amount;
        }
      }
    }

    // タワー攻撃
    for (const t of this.towers) {
      const def = this.charDefs[t.type];
      if (!def || def.kind === "buff") continue;
      t.cd -= dt;
      if (t.cd > 0) continue;
      const buff = buffMap[t.id] || { dmgBonus: 0, cdBonus: 0, rangeBonus: 0 };
      const dmg = def.dmg * (1 + buff.dmgBonus);
      const cdTime = def.cooldown * (1 - Math.min(0.7, buff.cdBonus));
      const effRange = def.range * (1 + (buff.rangeBonus || 0));
      const tx = t.col * CELL + CELL / 2, ty = t.row * CELL + CELL / 2;

      // 射程内で最も拠点に近い(進んでいる)敵を狙う
      let target = null;
      for (const e of this.enemies) {
        const p = pointOnPath(e.dist);
        if (Math.hypot(p.x - tx, p.y - ty) <= effRange) { if (!target || e.dist > target.dist) target = e; }
      }
      if (!target) continue;
      t.cd = cdTime;
      t.atkCount = (t.atkCount || 0) + 1;
      const special = def.special;
      const tp = pointOnPath(target.dist);
      this.projectiles.push({ id: this._nextId++, x: tx, y: ty, tx: tp.x, ty: tp.y, color: def.color, t: 0, life: 0.18 });

      if (def.kind === "splash") {
        const isNova = special && special.kind === "novaEvery" && t.atkCount % special.n === 0;
        const radius = isNova ? Infinity : def.splash;
        for (const e of this.enemies) {
          const ep = pointOnPath(e.dist);
          if (Math.hypot(ep.x - tp.x, ep.y - tp.y) <= radius) {
            e.hp -= dmg;
            if (def.dotDmg) e.burn = { dps: def.dotDmg, t: def.dotDur };
          }
        }
      } else if (def.kind === "chain") {
        target.hp -= dmg;
        let lastHit = target, hitCount = 1;
        const hit = new Set([target.id]);
        let lastPoint = tp, curDmg = dmg;
        for (let i = 1; i < def.chainCount; i++) {
          let next = null, bestD = Infinity;
          for (const e of this.enemies) {
            if (hit.has(e.id)) continue;
            const ep = pointOnPath(e.dist);
            const d = Math.hypot(ep.x - lastPoint.x, ep.y - lastPoint.y);
            if (d <= def.chainRange && d < bestD) { bestD = d; next = e; }
          }
          if (!next) break;
          curDmg *= def.chainFalloff;
          next.hp -= curDmg;
          hit.add(next.id); hitCount++;
          lastHit = next;
          const np = pointOnPath(next.dist);
          this.projectiles.push({ id: this._nextId++, x: lastPoint.x, y: lastPoint.y, tx: np.x, ty: np.y, color: def.color, t: 0, life: 0.16 });
          lastPoint = np;
        }
        if (special && special.kind === "chainOverload" && hitCount >= special.minHits) lastHit.hp -= dmg * special.bonusMult;
      } else if (def.kind === "slow") {
        target.hp -= dmg;
        if (special && special.kind === "freezeEvery" && t.atkCount % special.n === 0) {
          target.slow = { factor: 1, t: special.dur };
        } else if (!target.slow || target.slow.factor <= def.slow) {
          target.slow = { factor: def.slow, t: def.slowDur };
        }
      } else if (def.kind === "dot") {
        target.hp -= dmg;
        const spreadRadius = special && special.kind === "burnSpread" ? special.radius : 0;
        target.burn = { dps: def.dotDmg * (1 + buff.dmgBonus), t: def.dotDur, spreadRadius };
      } else if (def.kind === "pull") {
        target.hp -= dmg;
        target.dist = Math.max(0, target.dist - def.pullDist);
        if (special && special.kind === "stunOnPull") target.slow = { factor: 1, t: special.dur };
      } else {
        let finalDmg = dmg;
        if (special && special.kind === "execute" && target.hp / target.hpMax <= special.threshold) finalDmg *= (1 + special.mult);
        target.hp -= finalDmg;
        if (special && special.kind === "doubleAttack" && Math.random() < special.chance) {
          let target2 = null;
          for (const e of this.enemies) {
            const p = pointOnPath(e.dist);
            if (Math.hypot(p.x - tx, p.y - ty) <= effRange) { if (!target2 || e.dist > target2.dist) target2 = e; }
          }
          if (target2) {
            const tp2 = pointOnPath(target2.dist);
            this.projectiles.push({ id: this._nextId++, x: tx, y: ty, tx: tp2.x, ty: tp2.y, color: def.color, t: 0, life: 0.18 });
            target2.hp -= dmg;
          }
        }
      }
    }

    // 死亡処理(業火の魔道士の特殊: 炎上中の敵が死ぬと周囲へ延焼)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const dead = this.enemies[i];
      if (dead.hp <= 0) {
        if (dead.burn && dead.burn.spreadRadius) {
          const dp = pointOnPath(dead.dist);
          for (const e of this.enemies) {
            if (e === dead || e.burn) continue;
            const ep = pointOnPath(e.dist);
            if (Math.hypot(ep.x - dp.x, ep.y - dp.y) <= dead.burn.spreadRadius) {
              e.burn = { dps: dead.burn.dps, t: dead.burn.t, spreadRadius: dead.burn.spreadRadius };
            }
          }
        }
        const def = ENEMY_DEFS[dead.type];
        this.gold += def.gold;
        this.events.push({ k: "kill", type: dead.type });
        this.enemies.splice(i, 1);
      }
    }
    // 演出用の飛翔体寿命処理
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].t += dt;
      if (this.projectiles[i].t >= this.projectiles[i].life) this.projectiles.splice(i, 1);
    }
    // 決着判定
    if (this.defenderHp <= 0 && !this.over) {
      this.defenderHp = 0; this.over = true; this.winner = "attacker"; this.reason = "hp0";
    } else if (this.time >= MATCH_TIME && !this.over) {
      this.over = true; this.winner = "defender"; this.reason = "timeup";
    }
  }
}

// 配置可能セル一覧(パス以外)
const BUILDABLE_CELLS = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!PATH_SET.has(c + "," + r)) BUILDABLE_CELLS.push([c, r]);
