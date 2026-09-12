// ===== CPU AI (防衛/侵略どちらの役割も担当できる簡易AI) =====
"use strict";

const CPU_LEVELS = ["よわい", "ふつう", "つよい", "激つよ"];

class CpuController {
  // role: 相手が担当する側('defender' か 'attacker')。sim: TowerClashSim。level: 0-3
  constructor(sim, role, level) {
    this.sim = sim;
    this.role = role;
    this.level = level;
    this.timer = 0;
    this.interval = [1.6, 1.2, 0.85, 0.55][level];
  }

  update(dt) {
    if (this.sim.over) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.interval * (0.8 + Math.random() * 0.4);
    if (this.role === "defender") this._defenderMove();
    else this._attackerMove();
  }

  _defenderMove() {
    const sim = this.sim;
    const affordable = Object.keys(TOWER_DEFS).filter((t) => TOWER_DEFS[t].cost <= sim.gold);
    if (affordable.length === 0) return;
    // レベルが高いほど混成(キャノン/フロストも積極採用)、低いほどアロー偏重
    let type;
    const r = Math.random();
    if (this.level === 0) type = affordable.includes("arrow") ? "arrow" : affordable[0];
    else {
      const weights = { arrow: 0.4, cannon: 0.3, frost: 0.3 };
      const pool = affordable.filter((t) => Math.random() < weights[t] + 0.15 * this.level);
      type = pool.length ? pool[Math.floor(Math.random() * pool.length)] : affordable[Math.floor(Math.random() * affordable.length)];
    }
    void r;
    // 拠点に近いほど優先度を上げつつ、既存タワーが少ないセルを選ぶ
    const cands = BUILDABLE_CELLS.filter(([c, r2]) => cellFree(c, r2, sim.towers));
    if (cands.length === 0) return;
    let best = null, bestScore = -Infinity;
    for (const [c, r2] of cands) {
      const cx = c * CELL + CELL / 2, cy = r2 * CELL + CELL / 2;
      let minPathDist = Infinity;
      for (const p of PATH_POINTS) minPathDist = Math.min(minPathDist, Math.hypot(p.x - cx, p.y - cy));
      let score = -minPathDist + Math.random() * 40 * (1 - this.level * 0.15);
      if (this.level >= 2) score += (COLS - c) * 2; // 強いCPUは拠点寄りを少し優先
      if (score > bestScore) { bestScore = score; best = [c, r2]; }
    }
    if (best) sim.applyPlaceTower(best[0], best[1], type);
  }

  _attackerMove() {
    const sim = this.sim;
    const affordable = Object.keys(ENEMY_DEFS).filter((t) => ENEMY_DEFS[t].cost <= sim.mana);
    if (affordable.length === 0) return;
    let type;
    if (this.level === 0) type = affordable[Math.floor(Math.random() * affordable.length)];
    else if (this.level === 1) type = affordable.includes("grunt") ? "grunt" : affordable[0];
    else {
      // 強いCPUはマナを溜めてタンクを混ぜたり、ランナーで畳みかけたりする
      if (sim.mana > sim.manaMax * 0.7 && affordable.includes("tank")) type = "tank";
      else if (Math.random() < 0.5 && affordable.includes("runner")) type = "runner";
      else type = affordable[Math.floor(Math.random() * affordable.length)];
    }
    sim.applySpawnEnemy(type);
  }
}
