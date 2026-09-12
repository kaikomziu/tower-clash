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

  // ダメージ適用+演出用のヒット情報をイベントに積む(与ダメージ数値の表示などに使う)
  _hit(e, amount, color, crit) {
    e.hp -= amount;
    const p = this.pointOnPath(e.dist);
    this.events.push({ k: "hit", x: p.x, y: p.y, amount: Math.round(amount), color, crit: !!crit });
  }

  applyPlaceTower(col, row, charId) {
    if (this.over) return false;
    const def = this.charDefs[charId];
    if (!def) return false;
    if (this.gold < def.cost) return false;
    if (!this.cellFree(col, row)) return false;
    this.gold -= def.cost;
    this.towers.push({ id: this._nextId++, col, row, charId, level: 1, invested: def.cost, cd: 0, atkCount: 0 });
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

    // 支援(buff)キャラの効果を先に集計(騎士王の特殊で射程バフも追加)
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
          if (!buffMap[o.id]) buffMap[o.id] = { dmgBonus: 0, cdBonus: 0, rangeBonus: 0 };
          buffMap[o.id].dmgBonus += inst.buffDmg;
          buffMap[o.id].cdBonus += inst.buffRate;
          if (def.special && def.special.kind === "rangeBuff") buffMap[o.id].rangeBonus += def.special.amount;
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
      const buff = buffMap[t.id] || { dmgBonus: 0, cdBonus: 0, rangeBonus: 0 };
      const dmg = inst.dmg * (1 + buff.dmgBonus);
      const cdTime = inst.cooldown * (1 - Math.min(0.7, buff.cdBonus));
      const effRange = inst.range * (1 + (buff.rangeBonus || 0));
      const tx = t.col * CCELL + CCELL / 2, ty = t.row * CCELL + CCELL / 2;

      let target = null;
      for (const e of this.enemies) {
        const p = this.pointOnPath(e.dist);
        if (Math.hypot(p.x - tx, p.y - ty) <= effRange) { if (!target || e.dist > target.dist) target = e; }
      }
      if (!target) continue;
      t.cd = cdTime;
      t.atkCount = (t.atkCount || 0) + 1;
      const special = def.special;
      const tp = this.pointOnPath(target.dist);
      this.projectiles.push({ id: this._nextId++, x: tx, y: ty, tx: tp.x, ty: tp.y, color: def.color, t: 0, life: 0.18, kind: inst.kind });
      this.events.push({ k: "fire", towerId: t.id, kind: inst.kind }); // タワーの発射反動アニメ用

      if (inst.kind === "splash") {
        // 古竜の特殊: 一定回数ごとに画面全体を巻き込む大爆発
        const isNova = special && special.kind === "novaEvery" && t.atkCount % special.n === 0;
        const radius = isNova ? Infinity : inst.splash;
        if (isNova) this.events.push({ k: "nova", x: tp.x, y: tp.y, color: def.color });
        for (const e of this.enemies) {
          const ep = this.pointOnPath(e.dist);
          if (Math.hypot(ep.x - tp.x, ep.y - tp.y) <= radius) {
            this._hit(e, dmg, def.color);
            if (inst.dotDmg) e.burn = { dps: inst.dotDmg, t: inst.dotDur };
          }
        }
      } else if (inst.kind === "chain") {
        this._hit(target, dmg, def.color);
        let lastHit = target, hitCount = 1;
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
          this._hit(next, curDmg, def.color);
          hit.add(next.id); hitCount++;
          lastHit = next;
          const np = this.pointOnPath(next.dist);
          this.projectiles.push({ id: this._nextId++, x: lastPoint.x, y: lastPoint.y, tx: np.x, ty: np.y, color: def.color, t: 0, life: 0.16, kind: "chain" });
          lastPoint = np;
        }
        // 雷撃の射手の特殊: 3体以上に連鎖したら最後の対象へ追加ダメージ
        if (special && special.kind === "chainOverload" && hitCount >= special.minHits) this._hit(lastHit, dmg * special.bonusMult, "#fff", true);
      } else if (inst.kind === "slow") {
        this._hit(target, dmg, def.color);
        // 星海の賢者の特殊: 一定回数ごとに完全凍結
        if (special && special.kind === "freezeEvery" && t.atkCount % special.n === 0) {
          target.slow = { factor: 1, t: special.dur };
          this.events.push({ k: "freeze", x: tp.x, y: tp.y });
        } else if (!target.slow || target.slow.factor <= inst.slow) {
          target.slow = { factor: inst.slow, t: inst.slowDur };
        }
      } else if (inst.kind === "dot") {
        this._hit(target, dmg, def.color);
        // 業火の魔道士の特殊: 炎上中の敵が死ぬと周囲に延焼(死亡処理側で使用)
        const spreadRadius = special && special.kind === "burnSpread" ? special.radius : 0;
        target.burn = { dps: inst.dotDmg * (1 + buff.dmgBonus), t: inst.dotDur, spreadRadius };
      } else if (inst.kind === "pull") {
        this._hit(target, dmg, def.color);
        target.dist = Math.max(0, target.dist - inst.pullDist);
        // 竜巻使いの特殊: 吹き飛ばした敵を一時的に完全停止
        if (special && special.kind === "stunOnPull") target.slow = { factor: 1, t: special.dur };
      } else {
        let finalDmg = dmg, isCrit = false;
        // 狙撃手の特殊: 瀕死の敵に追加ダメージ
        if (special && special.kind === "execute" && target.hp / target.hpMax <= special.threshold) { finalDmg *= (1 + special.mult); isCrit = true; }
        this._hit(target, finalDmg, def.color, isCrit);
        // 剣豪の特殊: 確率で即座にもう一度攻撃
        if (special && special.kind === "doubleAttack" && Math.random() < special.chance) {
          let target2 = null;
          for (const e of this.enemies) {
            const p = this.pointOnPath(e.dist);
            if (Math.hypot(p.x - tx, p.y - ty) <= effRange) { if (!target2 || e.dist > target2.dist) target2 = e; }
          }
          if (target2) {
            const tp2 = this.pointOnPath(target2.dist);
            this.projectiles.push({ id: this._nextId++, x: tx, y: ty, tx: tp2.x, ty: tp2.y, color: def.color, t: 0, life: 0.18, kind: "single" });
            this._hit(target2, dmg, def.color);
          }
        }
      }
    }

    // 死亡処理(業火の魔道士の特殊: 炎上中の敵が死ぬと周囲へ延焼)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const dead = this.enemies[i];
      if (dead.hp <= 0) {
        const dp = this.pointOnPath(dead.dist);
        if (dead.burn && dead.burn.spreadRadius) {
          for (const e of this.enemies) {
            if (e === dead || e.burn) continue;
            const ep = this.pointOnPath(e.dist);
            if (Math.hypot(ep.x - dp.x, ep.y - dp.y) <= dead.burn.spreadRadius) {
              e.burn = { dps: dead.burn.dps, t: dead.burn.t, spreadRadius: dead.burn.spreadRadius };
            }
          }
        }
        this.gold += dead.gold;
        this.events.push({ k: "kill", type: dead.type, x: dp.x, y: dp.y });
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
