// ===== サウンド演出(WebAudio合成、音声ファイル不要) =====
"use strict";

let audioCtx = null;
let sfxVolume = 0.6;
let sfxMuted = localStorage.getItem("towerclash_sfxmuted") === "1";

function ensureAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}
// ブラウザの自動再生制限対策: 最初のユーザー操作でAudioContextを起動しておく
["click", "touchstart", "keydown"].forEach((evt) => document.addEventListener(evt, () => ensureAudioCtx(), { once: true, passive: true }));

function playTone(freq, dur, type, vol) {
  if (sfxMuted) return;
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.value = freq;
  gain.gain.value = (vol === undefined ? 1 : vol) * sfxVolume;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}
function playSeq(freqs, dur, type, vol, gap) {
  freqs.forEach((f, i) => setTimeout(() => playTone(f, dur, type, vol), i * gap));
}

const SFX = {
  fire() { playTone(880, 0.05, "square", 0.12); },
  hit() { playTone(220, 0.07, "sawtooth", 0.1); },
  kill() { playTone(140, 0.14, "triangle", 0.18); },
  place() { playTone(660, 0.1, "sine", 0.22); },
  sell() { playTone(330, 0.12, "sine", 0.18); },
  levelup() { playSeq([523, 659, 784], 0.15, "sine", 0.22, 90); },
  waveStart() { playTone(392, 0.2, "square", 0.18); },
  victory() { playSeq([523, 659, 784, 1047], 0.3, "sine", 0.28, 130); },
  defeat() { playSeq([392, 349, 311, 261], 0.35, "sawtooth", 0.22, 150); },
  gacha() { playSeq([440, 554, 659, 880], 0.2, "sine", 0.22, 100); },
  achievement() { playSeq([659, 880, 1047], 0.2, "sine", 0.28, 100); },
  coin() { playTone(988, 0.07, "square", 0.13); },
  levelUpPlayer() { playSeq([392, 523, 659, 880, 1047], 0.18, "sine", 0.26, 90); },
};

function isSfxMuted() { return sfxMuted; }
function setSfxMuted(v) {
  sfxMuted = v;
  try { localStorage.setItem("towerclash_sfxmuted", v ? "1" : "0"); } catch (e) { /* ignore */ }
}
