// ===== TOWER CLASH: ゲームシミュレーション本体(ホスト権威) =====
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

const TOWER_DEFS = {
  arrow: { name: "アロー塔", cost: 50, dmg: 9, cooldown: 0.9, range: 135, splash: 0, slow: 0, color: "#7dd3fc", emoji: "🏹" },
  cannon: { name: "キャノン塔", cost: 100, dmg: 28, cooldown: 1.6, range: 115, splash: 55, slow: 0, color: "#fca5a5", emoji: "💣" },
  frost: { name: "フロスト塔", cost: 80, dmg: 4, cooldown: 1.0, range: 125, splash: 0, slow: 0.5, slowDur: 2.5, color: "#a5f3fc", emoji: "❄️" },
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
  constructor() {
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
    this.enemies = []; // {id,type,dist,hp,hpMax,slowT}
    this.projectiles = []; // {id,x,y,tx,ty,targetId,color,t}
    this._nextId = 1;
    this.events = []; // 直近ティックの演出イベント(着弾/撃破/到達)
  }

  serialize() {
    return {
      time: this.time, over: this.over, winner: this.winner, reason: this.reason,
      defenderHp: this.defenderHp, defenderHpMax: this.defenderHpMax,
      gold: this.gold, mana: this.mana, manaMax: this.manaMax,
      towers: this.towers.map((t) => ({ id: t.id, col: t.col, row: t.row, type: t.type })),
      enemies: this.enemies.map((e) => ({ id: e.id, type: e.type, dist: e.dist, hp: e.hp, hpMax: e.hpMax, slowT: e.slowT })),
      projectiles: this.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, tx: p.tx, ty: p.ty, color: p.color })),
      events: this.events,
    };
  }

  applyPlaceTower(col, row, type) {
    if (this.over) return false;
    const def = TOWER_DEFS[type];
    if (!def || this.gold < def.cost) return false;
    if (!cellFree(col, row, this.towers)) return false;
    this.gold -= def.cost;
    this.towers.push({ id: this._nextId++, col, row, type, cd: 0 });
    return true;
  }

  applySellTower(id) {
    if (this.over) return false;
    const idx = this.towers.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    const def = TOWER_DEFS[this.towers[idx].type];
    this.gold += Math.round(def.cost * 0.6);
    this.towers.splice(idx, 1);
    return true;
  }

  applySpawnEnemy(type) {
    if (this.over) return false;
    const def = ENEMY_DEFS[type];
    if (!def || this.mana < def.cost) return false;
    this.mana -= def.cost;
    this.enemies.push({ id: this._nextId++, type, dist: 0, hp: def.hp, hpMax: def.hp, slowT: 0 });
    return true;
  }

  tick(dt) {
    if (this.over) { this.events = []; return; }
    this.events = [];
    this.time += dt;
    this.gold += 4 * dt;
    this.mana = Math.min(this.manaMax, this.mana + 5 * dt);

    // 敵の移動
    for (const e of this.enemies) {
      const def = ENEMY_DEFS[e.type];
      const slowMul = e.slowT > 0 ? (1 - TOWER_DEFS.frost.slow) : 1;
      e.slowT = Math.max(0, e.slowT - dt);
      e.dist += def.speed * slowMul * dt;
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
    // タワー攻撃
    for (const t of this.towers) {
      t.cd -= dt;
      if (t.cd > 0) continue;
      const def = TOWER_DEFS[t.type];
      const tx = t.col * CELL + CELL / 2, ty = t.row * CELL + CELL / 2;
      // 射程内で最も拠点に近い(進んでいる)敵を狙う
      let target = null;
      for (const e of this.enemies) {
        const p = pointOnPath(e.dist);
        const d = Math.hypot(p.x - tx, p.y - ty);
        if (d <= def.range) { if (!target || e.dist > target.dist) target = e; }
      }
      if (!target) continue;
      t.cd = def.cooldown;
      const p = pointOnPath(target.dist);
      this.projectiles.push({ id: this._nextId++, x: tx, y: ty, tx: p.x, ty: p.y, color: def.color, t: 0, life: 0.18 });
      if (def.splash > 0) {
        for (const e of this.enemies) {
          const ep = pointOnPath(e.dist);
          if (Math.hypot(ep.x - p.x, ep.y - p.y) <= def.splash) this._damage(e, def.dmg);
        }
      } else {
        this._damage(target, def.dmg);
        if (def.slow > 0) target.slowT = def.slowDur;
      }
    }
    // 死亡処理
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].hp <= 0) {
        const def = ENEMY_DEFS[this.enemies[i].type];
        this.gold += def.gold;
        this.events.push({ k: "kill", type: this.enemies[i].type });
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

  _damage(e, dmg) { e.hp -= dmg; }
}

// 配置可能セル一覧(パス以外)
const BUILDABLE_CELLS = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!PATH_SET.has(c + "," + r)) BUILDABLE_CELLS.push([c, r]);
