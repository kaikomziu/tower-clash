// ===== キャンペーンモード: ウェーブ制タワーディフェンス シミュレーション =====
"use strict";

function buildPathData(cells) {
  const points = cells.map(([c, r]) => ({ x: c * CCELL + CCELL / 2, y: r * CCELL + CCELL / 2 }));
  const segLens = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    segLens.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  const totalLen = segLens.reduce((a, b) => a + b, 0);
  const cellSet = new Set(cells.map(([c, r]) => c + "," + r));
  return { points, segLens, totalLen, cellSet, cells };
}

class CampaignSim {
  constructor(stage, diffKey, equippedDefs) {
    this.stage = stage;
    this.diff = DIFFICULTIES[diffKey];
    this.diffKey = diffKey;
    this.path = buildPathData(stage.path);
    this.charDefs = equippedDefs; // { charId: effectiveDef(ランク反映済) }

    this.hpMax = 20 + stage.id * 2;
    this.hp = this.hpMax;
    this.gold = 220;

    this.waveIndex = -1;
    this.waveState = "prep"; // 'prep' | 'spawning' | 'combat'
    this.prepTimer = 6;
    this.spawnQueue = [];
    this.spawnTimer = 0;

    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.events = [];
    this._nextId = 1;

    this.over = false;
    this.victory = null;
    this.reason = null;
    this.wavesCleared = 0;
    this.time = 0;
  }

  pointOnPath(dist) {
    const { points, segLens, totalLen } = this.path;
    if (dist <= 0) return { ...points[0] };
    if (dist >= totalLen) return { ...points[points.length - 1] };
    let d = dist;
    for (let i = 0; i < segLens.length; i++) {
      const segLen = segLens[i];
      if (d <= segLen) {
        const t = segLen > 0 ? d / segLen : 1;
        const a = points[i], b = points[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      d -= segLen;
    }
    return { ...points[points.length - 1] };
  }

  cellFree(col, row) {
    if (col < 0 || row < 0 || col >= CCOLS || row >= CROWS) return false;
    if (this.path.cellSet.has(col + "," + row)) return false;
    return !this.towers.some((t) => t.col === col && t.row === row);
  }

  instDef(t) {
    const base = this.charDefs[t.charId];
    const li = t.level - 1;
    return Object.assign({}, base, {
      dmg: base.dmg * BATTLE_LEVEL_DMG_MUL[li],
      range: base.range * BATTLE_LEVEL_RANGE_MUL[li],
    });
  }

  applyPlaceTower(col, row, charId) {
    if (this.over) return false;
    const def = this.charDefs[charId];
    if (!def) return false;
    if (this.gold < def.cost) return false;
    if (!this.cellFree(col, row)) return false;
    this.gold -= def.cost;
    this.towers.push({ id: this._nextId++, col, row, charId, level: 1, invested: def.cost, cd: 0 });
    return true;
  }
  applyLevelUp(id) {
    if (this.over) return false;
    const t = this.towers.find((x) => x.id === id);
    if (!t || t.level >= BATTLE_MAX_LEVEL) return false;
    const base = this.charDefs[t.charId];
    const cost = battleLevelUpCost(base.cost, t.level);
    if (this.gold < cost) return false;
    this.gold -= cost;
    t.invested += cost;
    t.level++;
    return true;
  }
  applySellTower(id) {
    if (this.over) return false;
    const idx = this.towers.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    this.gold += Math.round(this.towers[idx].invested * 0.6);
    this.towers.splice(idx, 1);
    return true;
  }
  applySkipPrep() {
    if (this.over || this.waveState !== "prep") return false;
    this.prepTimer = 0;
    return true;
  }

  _spawnEnemy(entry) {
    const md = MONSTER_DEFS[entry.type];
    this.enemies.push({
      id: this._nextId++, type: entry.type, dist: 0,
      hp: md.hp * entry.hpMul, hpMax: md.hp * entry.hpMul,
      speed: md.speed * entry.spdMul, dmg: md.dmg, gold: md.gold, coin: md.coin,
      slow: null, burn: null,
    });
  }

  tick(dt) {
    if (this.over) { this.events = []; return; }
    this.events = [];
    this.time += dt;
    this.gold = Math.min(9999, this.gold + 4.5 * dt);

    // ウェーブ進行
    if (this.waveState === "prep") {
      this.prepTimer -= dt;
      if (this.prepTimer <= 0) {
        this.waveIndex++;
        this.spawnQueue = buildWave(this.stage, this.diff, this.waveIndex);
        this.spawnTimer = 0;
        this.waveState = "spawning";
        this.events.push({ k: "waveStart", wave: this.waveIndex + 1 });
      }
    } else if (this.waveState === "spawning") {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.spawnQueue.length > 0) {
        const entry = this.spawnQueue.shift();
        this._spawnEnemy(entry);
        this.spawnTimer = entry.interval;
      }
      if (this.spawnQueue.length === 0) this.waveState = "combat";
    } else if (this.waveState === "combat") {
      if (this.enemies.length === 0) {
        this.wavesCleared = this.waveIndex + 1;
        this.events.push({ k: "waveClear", wave: this.wavesCleared });
        if (this.waveIndex >= this.stage.waveCount - 1) {
          this.over = true; this.victory = true; this.reason = "cleared";
        } else {
          this.waveState = "prep"; this.prepTimer = 6;
        }
      }
    }

    // 敵の移動
    for (const e of this.enemies) {
      let slowMul = 1;
      if (e.slow) { e.slow.t -= dt; if (e.slow.t <= 0) e.slow = null; else slowMul = 1 - e.slow.factor; }
      e.dist += e.speed * slowMul * dt;
      if (e.burn) { e.hp -= e.burn.dps * dt; e.burn.t -= dt; if (e.burn.t <= 0) e.burn = null; }
    }
    // 拠点到達
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dist >= this.path.totalLen) {
        this.hp -= e.dmg;
        this.events.push({ k: "leak", type: e.type });
        this.enemies.splice(i, 1);
      }
    }

    // 支援(buff)キャラの効果を先に集計
    const buffMap = {};
    for (const t of this.towers) {
      const def = this.charDefs[t.charId];
      if (def.kind !== "buff") continue;
      const inst = this.instDef(t);
      const tx = t.col * CCELL + CCELL / 2, ty = t.row * CCELL + CCELL / 2;
      for (const o of this.towers) {
        if (o === t) continue;
        const ox = o.col * CCELL + CCELL / 2, oy = o.row * CCELL + CCELL / 2;
        if (Math.hypot(ox - tx, oy - ty) <= inst.range) {
          if (!buffMap[o.id]) buffMap[o.id] = { dmgBonus: 0, cdBonus: 0 };
          buffMap[o.id].dmgBonus += inst.buffDmg;
          buffMap[o.id].cdBonus += inst.buffRate;
        }
      }
    }

    // タワーの攻撃
    for (const t of this.towers) {
      const def = this.charDefs[t.charId];
      if (def.kind === "buff") continue;
      t.cd -= dt;
      if (t.cd > 0) continue;
      const inst = this.instDef(t);
      const buff = buffMap[t.id] || { dmgBonus: 0, cdBonus: 0 };
      const dmg = inst.dmg * (1 + buff.dmgBonus);
      const cdTime = inst.cooldown * (1 - Math.min(0.7, buff.cdBonus));
      const tx = t.col * CCELL + CCELL / 2, ty = t.row * CCELL + CCELL / 2;

      let target = null;
      for (const e of this.enemies) {
        const p = this.pointOnPath(e.dist);
        if (Math.hypot(p.x - tx, p.y - ty) <= inst.range) { if (!target || e.dist > target.dist) target = e; }
      }
      if (!target) continue;
      t.cd = cdTime;
      const tp = this.pointOnPath(target.dist);
      this.projectiles.push({ id: this._nextId++, x: tx, y: ty, tx: tp.x, ty: tp.y, color: def.color, t: 0, life: 0.18 });

      if (inst.kind === "splash") {
        for (const e of this.enemies) {
          const ep = this.pointOnPath(e.dist);
          if (Math.hypot(ep.x - tp.x, ep.y - tp.y) <= inst.splash) {
            e.hp -= dmg;
            if (inst.dotDmg) e.burn = { dps: inst.dotDmg, t: inst.dotDur };
          }
        }
      } else if (inst.kind === "chain") {
        target.hp -= dmg;
        const hit = new Set([target.id]);
        let lastPoint = tp, curDmg = dmg;
        for (let i = 1; i < inst.chainCount; i++) {
          let next = null, bestD = Infinity;
          for (const e of this.enemies) {
            if (hit.has(e.id)) continue;
            const ep = this.pointOnPath(e.dist);
            const d = Math.hypot(ep.x - lastPoint.x, ep.y - lastPoint.y);
            if (d <= inst.chainRange && d < bestD) { bestD = d; next = e; }
          }
          if (!next) break;
          curDmg *= inst.chainFalloff;
          next.hp -= curDmg;
          hit.add(next.id);
          const np = this.pointOnPath(next.dist);
          this.projectiles.push({ id: this._nextId++, x: lastPoint.x, y: lastPoint.y, tx: np.x, ty: np.y, color: def.color, t: 0, life: 0.16 });
          lastPoint = np;
        }
      } else if (inst.kind === "slow") {
        target.hp -= dmg;
        if (!target.slow || target.slow.factor <= inst.slow) target.slow = { factor: inst.slow, t: inst.slowDur };
      } else if (inst.kind === "dot") {
        target.hp -= dmg;
        target.burn = { dps: inst.dotDmg * (1 + buff.dmgBonus), t: inst.dotDur };
      } else if (inst.kind === "pull") {
        target.hp -= dmg;
        target.dist = Math.max(0, target.dist - inst.pullDist);
      } else {
        target.hp -= dmg;
      }
    }

    // 死亡処理
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].hp <= 0) {
        this.gold += this.enemies[i].gold;
        this.events.push({ k: "kill", type: this.enemies[i].type });
        this.enemies.splice(i, 1);
      }
    }
    // 飛翔体の寿命
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].t += dt;
      if (this.projectiles[i].t >= this.projectiles[i].life) this.projectiles.splice(i, 1);
    }

    if (this.hp <= 0 && !this.over) {
      this.hp = 0; this.over = true; this.victory = false; this.reason = "hp0";
    }
  }
}
