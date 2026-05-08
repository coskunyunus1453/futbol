// Sevimli Futbol — entry. Menü, mod seçimi, oyun döngüsü, online eşleşme.

import { Sfx } from "./audio.js";
import { InputManager } from "./input.js";
import { MatchScene } from "./match.js";
import { PenaltyScene } from "./penalty.js";
import { Network } from "./network.js";
import { TEAMS, teamById } from "./render.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const screens = {
  menu: $("#menu"),
  online: $("#online-screen"),
  game: $("#game-screen"),
  result: $("#result-screen"),
};

function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle("active", k === name);
}

const state = {
  homeTeam: "red",
  awayTeam: "blue",
  scene: null,
  input: new InputManager(),
  network: null,
  rafId: 0,
  lastT: 0,
};

// ---------- MENU ----------
function renderTeamPicker() {
  const wrap = $("#team-picks");
  wrap.innerHTML = "";
  TEAMS.forEach(t => {
    const b = document.createElement("button");
    b.className = "team-pick" + (t.id === state.homeTeam ? " selected" : "");
    b.style.background = t.primary;
    b.title = t.name;
    b.addEventListener("click", () => {
      Sfx.click();
      state.homeTeam = t.id;
      // rakip otomatik olarak farklı bir takım
      const others = TEAMS.filter(x=>x.id!==t.id);
      state.awayTeam = others[Math.floor(Math.random()*others.length)].id;
      renderTeamPicker();
    });
    wrap.appendChild(b);
  });
}

function setupMenu() {
  renderTeamPicker();
  $$("#menu .mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      Sfx.resume();
      Sfx.click();
      const mode = btn.dataset.mode;
      handleMode(mode);
    });
  });
  // Geri butonları
  $$(".back-btn").forEach(b => {
    b.addEventListener("click", () => {
      Sfx.click();
      const tgt = b.dataset.target || "menu";
      if (state.network) { state.network.close(); state.network = null; }
      showScreen(tgt);
    });
  });
}

function handleMode(mode) {
  if (mode === "match-ai")      startScene("match", { ai:true });
  else if (mode === "match-online") openOnline("match");
  else if (mode === "penalty-ai")   startScene("penalty", { ai:true });
  else if (mode === "penalty-online") openOnline("penalty");
}

// ---------- ONLINE EŞLEŞME ----------
function setupOnlineScreen() {
  $$("#online-screen .tab").forEach(t => {
    t.addEventListener("click", () => {
      Sfx.click();
      const k = t.dataset.tab;
      $$("#online-screen .tab").forEach(x => x.classList.toggle("active", x === t));
      $$("#online-screen .tab-pane").forEach(p => p.classList.toggle("active", p.dataset.pane === k));
    });
  });

  $("#host-create").addEventListener("click", async () => {
    Sfx.click();
    $("#host-status").textContent = "Sunucuya bağlanılıyor…";
    $("#host-create").disabled = true;
    state.network = new Network();
    try {
      const code = await state.network.host();
      $("#host-code").textContent = code;
      $("#host-code-box").classList.remove("hidden");
      $("#host-status").textContent = "Rakip bekleniyor…";
      state.network.onOpen = () => {
        $("#host-status").textContent = "Bağlandı! Maç başlıyor…";
        Sfx.click();
        setTimeout(() => startScene(state._pendingMode, { ai:false, online:true, network:state.network, role:"host" }), 600);
      };
      state.network.onClose = () => {
        $("#host-status").textContent = "Bağlantı kapandı.";
      };
    } catch (e) {
      console.error(e);
      $("#host-status").textContent = "Hata: " + (e.message || e);
      $("#host-create").disabled = false;
    }
  });

  $("#join-btn").addEventListener("click", async () => {
    Sfx.click();
    const code = $("#join-code").value.toUpperCase();
    $("#join-status").textContent = "Bağlanılıyor…";
    state.network = new Network();
    try {
      await state.network.join(code);
      $("#join-status").textContent = "Bağlandı!";
      setTimeout(() => startScene(state._pendingMode, { ai:false, online:true, network:state.network, role:"client" }), 400);
    } catch (e) {
      console.error(e);
      $("#join-status").textContent = "Hata: " + (e.message || e);
    }
  });
}

function openOnline(mode) {
  state._pendingMode = mode;
  $("#online-title").textContent = mode === "match" ? "Online Maç (1v1)" : "Online Penaltı (Kaleci & Şutör)";
  $("#host-code-box").classList.add("hidden");
  $("#host-create").disabled = false;
  $("#host-status").textContent = "";
  $("#join-status").textContent = "";
  $("#join-code").value = "";
  showScreen("online");
}

// ---------- OYUN DÖNGÜSÜ ----------
let pausedFlag = false;

function startScene(kind, opts) {
  state._pendingMode = kind;
  showScreen("game");
  Sfx.resume();

  const canvas = $("#game");
  // Yatay ekran yönlendirme dene
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(()=>{});
    }
    // Tam ekran (mobil)
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(()=>{});
    }
  } catch (_) {}

  const sceneOpts = {
    homeTeamId: state.homeTeam,
    awayTeamId: state.awayTeam,
    online: !!opts.online,
    role: opts.role || null,
    network: opts.network || null,
    difficulty: 0.85,
    duration: 90,
  };

  if (kind === "match") {
    state.scene = new MatchScene(canvas, sceneOpts, makeUI());
  } else {
    state.scene = new PenaltyScene(canvas, sceneOpts, makeUI());
  }
  setupPenaltyPointerControls(canvas);

  // HUD
  $("#home-name").textContent = teamById(state.homeTeam).name.slice(0,3).toUpperCase();
  $("#away-name").textContent = teamById(state.awayTeam).name.slice(0,3).toUpperCase();
  $("#home-score").textContent = "0";
  $("#away-score").textContent = "0";
  $("#match-clock").textContent = sceneOpts.duration;

  state.scene.begin();
  pausedFlag = false;
  state.lastT = performance.now();
  cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(loop);
}

let penaltyPointerBound = false;
function setupPenaltyPointerControls(canvas) {
  if (penaltyPointerBound) return;
  penaltyPointerBound = true;
  const onPointer = (type, e) => {
    const sc = state.scene;
    if (!sc || !(sc instanceof PenaltyScene)) return;
    if (!sc.renderer || !sc.pointerAim) return;
    const p = sc.renderer.screenToWorld(e.clientX, e.clientY);
    sc.pointerAim(type, p.x, p.y);
  };
  canvas.addEventListener("pointerdown", (e) => {
    onPointer("down", e);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => onPointer("move", e));
  canvas.addEventListener("pointerup", (e) => onPointer("up", e));
  canvas.addEventListener("pointercancel", (e) => onPointer("up", e));
}

function makeUI() {
  return {
    toast(msg, t = 1.5) {
      const el = $("#toast");
      el.textContent = msg;
      el.classList.remove("hidden");
      clearTimeout(makeUI._tt);
      makeUI._tt = setTimeout(() => el.classList.add("hidden"), t * 1000);
    },
    showGoal() {
      const el = $("#goal-overlay");
      el.classList.remove("hidden");
      clearTimeout(makeUI._gt);
      makeUI._gt = setTimeout(() => el.classList.add("hidden"), 1800);
    },
    onMatchEnd(score) {
      // PenaltyScene end aktif → result ekranı
      setTimeout(() => endToResult(), 600);
    },
  };
}

function loop(now) {
  state.rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - state.lastT) / 1000);
  state.lastT = now;
  if (pausedFlag) { return; }
  const sc = state.scene;
  if (!sc) return;

  // Input snapshot
  const input = {
    dir: state.input.getDir(),
    just: {
      pass: state.input.consumeJust("pass"),
      cross: state.input.consumeJust("cross"),
      shoot: state.input.consumeJust("shoot"),
    },
    shootCharge: state.input.consumeShootCharge(),
  };

  sc.step(dt, input);
  sc.draw();

  // HUD güncelle
  if (sc.score) {
    $("#home-score").textContent = sc.score.home;
    $("#away-score").textContent = sc.score.away;
  }
  if (sc.clock != null) {
    $("#match-clock").textContent = Math.ceil(sc.clock);
  } else if (sc.attempts) {
    $("#match-clock").textContent = `${sc.attempts.home + sc.attempts.away}/${sc.rounds*2}`;
  }

  if (sc.state === "over") {
    cancelAnimationFrame(state.rafId);
    setTimeout(endToResult, 800);
  }
}

function endToResult() {
  const sc = state.scene;
  if (!sc) return;
  $("#result-home-name").textContent = teamById(state.homeTeam).name;
  $("#result-away-name").textContent = teamById(state.awayTeam).name;
  $("#result-home").textContent = sc.score.home;
  $("#result-away").textContent = sc.score.away;
  let msg = "Berabere — fena değil!";
  if (sc.score.home > sc.score.away) msg = "Kazandın! 🏆";
  else if (sc.score.home < sc.score.away) msg = "Bu sefer olmadı, tekrar dene!";
  $("#result-msg").textContent = msg;
  showScreen("result");
}

// HUD butonları
function setupHud() {
  $("#pause-btn").addEventListener("click", () => {
    Sfx.click();
    if (!state.scene) return;
    pausedFlag = true;
    state.scene.pause();
    $("#pause-overlay").classList.remove("hidden");
  });
  $("#resume-btn").addEventListener("click", () => {
    Sfx.click();
    pausedFlag = false;
    if (state.scene) state.scene.resume();
    $("#pause-overlay").classList.add("hidden");
    state.lastT = performance.now();
  });
  $("#end-btn").addEventListener("click", () => {
    Sfx.click();
    pausedFlag = false;
    if (state.scene) state.scene.end();
    $("#pause-overlay").classList.add("hidden");
    setTimeout(endToResult, 200);
  });
  $("#exit-btn").addEventListener("click", () => {
    Sfx.click();
    if (state.scene) state.scene.end();
    cancelAnimationFrame(state.rafId);
    if (state.network) { state.network.close(); state.network = null; }
    showScreen("menu");
  });

  $("#rematch-btn").addEventListener("click", () => {
    Sfx.click();
    // Aynı modu offline tekrar başlat (online ise menüye dön)
    const wasOnline = !!(state.scene && state.scene.opts && state.scene.opts.online);
    if (wasOnline) { showScreen("menu"); return; }
    const mode = state._pendingMode;
    handleMode(mode === "match" ? "match-ai" : "penalty-ai");
  });
}

function init() {
  state.input.attach();
  setupMenu();
  setupOnlineScreen();
  setupHud();
  // İlk dokunuşta sesi etkinleştir
  const enable = () => { Sfx.resume(); document.removeEventListener("pointerdown", enable); };
  document.addEventListener("pointerdown", enable, { once:true });
  // Service worker yok ama PWA için manifest yeterli
}

init();
