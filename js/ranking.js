// ===== 世界ランキング: Supabase(towerclash_ranking テーブル)への登録/取得 =====
// SUPABASE_URL / SUPABASE_ANON_KEY は online.js で定義済み(スクリプト間で共有)
"use strict";

const Ranking = {
  client: null,
  _ensureClient() {
    if (!this.client) {
      if (!window.supabase) throw new Error("通信ライブラリの読み込みに失敗しました。通信環境を確認してください。");
      this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return this.client;
  },

  // 現在の指揮官の記録をランキングへ新規登録(1回の登録につき1レコード追加。既存レコードは残る)
  async submit(name) {
    const client = this._ensureClient();
    const payload = {
      name: (name || "名無しの指揮官").toString().trim().slice(0, 12) || "名無しの指揮官",
      power: Math.max(0, Math.min(999999, Math.round(totalPowerOf(Meta.getLoadout())))),
      endless_wave: Math.max(0, Math.min(9999, Math.round((Meta.data.stats && Meta.data.stats.endlessBestWave) || 0))),
      boss_clears: Math.max(0, Math.min(99999, Math.round((Meta.data.stats && Meta.data.stats.bossRushClears) || 0))),
      player_level: Math.max(1, Math.min(9999, Math.round(Meta.data.playerLevel || 1))),
    };
    const { error } = await client.from("towerclash_ranking").insert(payload);
    if (error) throw error;
    return payload;
  },

  // orderBy: 'power' | 'endless_wave' | 'boss_clears'
  async fetchTop(orderBy, limit) {
    const client = this._ensureClient();
    const { data, error } = await client
      .from("towerclash_ranking")
      .select("name, power, endless_wave, boss_clears, player_level, created_at")
      .order(orderBy, { ascending: false })
      .limit(limit || 50);
    if (error) throw error;
    return data || [];
  },
};
