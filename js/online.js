// ===== オンライン対戦: Supabase Realtime (Broadcast/Presence) によるホスト権威型通信 =====
"use strict";

const SUPABASE_URL = "https://kifnzvktwbomxthzvvgy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZm56dmt0d2JvbXh0aHp2dmd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzgxMzgsImV4cCI6MjA5MzQxNDEzOH0.M7nXP-u--6J_6rRpgz1cJj21_7KX6MtfTmZy77Xf_IE";
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい 0/O/1/I を除外

function genRoomCode(len = 5) {
  let s = "";
  for (let i = 0; i < len; i++) s += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return s;
}

class OnlineSession {
  constructor() {
    this.client = null;
    this.channel = null;
    this.role = null; // 'host' | 'guest'
    this.roomCode = null;
    this.myId = Math.random().toString(36).slice(2, 10);
    this.peerPresent = false;
    this.handlers = {};
    this.latencyMs = null;
    this._pingTimer = null;
  }

  _ensureClient() {
    if (!this.client) {
      if (!window.supabase) throw new Error("通信ライブラリの読み込みに失敗しました。通信環境を確認してください。");
      this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }

  on(type, cb) { this.handlers[type] = cb; }

  createRoom(prefix) {
    this._ensureClient();
    this.role = "host";
    this.roomCode = genRoomCode();
    return this._joinChannel(this.roomCode, prefix).then(() => this.roomCode);
  }

  joinRoom(code, prefix) {
    this._ensureClient();
    this.role = "guest";
    this.roomCode = (code || "").toUpperCase().trim();
    return this._joinChannel(this.roomCode, prefix);
  }

  _joinChannel(code, prefix) {
    return new Promise((resolve, reject) => {
      const ch = this.client.channel((prefix || "towerclash-room-") + code, {
        config: { broadcast: { self: false }, presence: { key: this.myId } },
      });
      this.channel = ch;
      ch.on("broadcast", { event: "msg" }, ({ payload }) => this._handleMessage(payload));
      ch.on("presence", { event: "sync" }, () => this._handlePresence());
      let settled = false;
      const timeout = setTimeout(() => { if (!settled) { settled = true; reject(new Error("TIMEOUT")); } }, 9000);
      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try { await ch.track({ role: this.role }); } catch (e) { /* ignore */ }
          if (!settled) { settled = true; clearTimeout(timeout); resolve(); }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (!settled) { settled = true; clearTimeout(timeout); reject(new Error(status)); }
        }
      });
    });
  }

  _handlePresence() {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    const others = Object.keys(state).filter((k) => k !== this.myId);
    const wasPresent = this.peerPresent;
    this.peerPresent = others.length > 0;
    if (this.peerPresent && !wasPresent && this.handlers.peerJoined) this.handlers.peerJoined();
    if (!this.peerPresent && wasPresent && this.handlers.peerLeft) this.handlers.peerLeft();
  }

  _handleMessage(payload) {
    const { type, data } = payload || {};
    if (!type) return;
    if (type === "ping") { this.send("pong", { t: data.t }); return; }
    if (type === "pong") { this.latencyMs = Date.now() - data.t; return; }
    if (this.handlers[type]) this.handlers[type](data);
  }

  send(type, data) {
    if (!this.channel) return;
    this.channel.send({ type: "broadcast", event: "msg", payload: { type, data } });
  }

  startPing() {
    if (this._pingTimer) return;
    this._pingTimer = setInterval(() => this.send("ping", { t: Date.now() }), 2500);
  }

  leave() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (this.channel) { this.channel.unsubscribe(); this.channel = null; }
    this.peerPresent = false;
  }
}
