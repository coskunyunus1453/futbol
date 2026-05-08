// Maç modu — alan oyunu. 1 oyuncu (sen) + 3 takım arkadaşı (AI) vs 4 rakip (AI).
// Online'da: host ev takımı için 1 oyuncu kontrol eder, client deplasman için 1 oyuncu.

import { FIELD, Ball, tryPickup, resolvePlayerCollisions } from "./physics.js";
import { Renderer, teamById } from "./render.js";
import { Sfx } from "./audio.js";
import { fieldPlayerAI, goalkeeperAI } from "./ai.js";

const HAIRS = ["#3a2615","#2b2b2b","#a0522d","#d4a373","#1a1a1a","#7a4a26"];

function makePlayer(team, side, role, x, y, lane, seed) {
  return {
    team, side, role, x, y,
    vx: 0, vy: 0, facing: side === "home" ? 0 : Math.PI,
    maxSpeed: role === "gk" ? 220 : 320,
    canControl: true,
    userControlled: false,
    lane: lane || 0,
    seed: seed || 0,
    hairColor: HAIRS[(seed||0) % HAIRS.length],
    cooldown: 0,
  };
}

export class MatchScene {
  // ctx: { ai: bool, online: bool, network, role:"host"|"client"|null,
  //        homeTeamId, awayTeamId, duration }
  constructor(canvas, opts, ui) {
    this.opts = opts;
    this.ui = ui;
    this.renderer = new Renderer(canvas);
    this.canvas = canvas;
    this.ball = new Ball();
    this.players = [];
    this.home = teamById(opts.homeTeamId || "red");
    this.away = teamById(opts.awayTeamId || "blue");
    this.score = { home: 0, away: 0 };
    this.duration = opts.duration || 90;
    this.clock = this.duration;
    this.state = "kickoff"; // kickoff|play|goal|paused|over
    this.toastTimer = 0;
    this.userIdx = 0; // hangi oyuncuyu kontrol ediyorsun
    this.kickCooldown = 0;
    this.spawn();

    // Online state
    this.netSendAcc = 0;
    this.netRole = opts.role || null;     // "host" | "client" | null
    this.network = opts.network || null;
    this.lastRemoteInput = { dx:0, dy:0, pass:false, cross:false, shoot:false, shootCharge:0 };
    if (this.network) this.network.onMessage = (m) => this._onNetMsg(m);
  }

  spawn() {
    this.players = [];
    // Ev takımı (sol kale, sağa atak)
    this.players.push(makePlayer(this.home, "home", "gk", FIELD.left + 32, FIELD.cy, 0, 1));
    this.players.push(makePlayer(this.home, "home", "fw", FIELD.cx - 100, FIELD.cy - 80, -1, 2));
    this.players.push(makePlayer(this.home, "home", "fw", FIELD.cx - 100, FIELD.cy + 80, 1, 3));
    this.players.push(makePlayer(this.home, "home", "mf", FIELD.cx - 200, FIELD.cy, 0, 4));
    // Deplasman (sağ kale, sola atak)
    this.players.push(makePlayer(this.away, "away", "gk", FIELD.right - 32, FIELD.cy, 0, 5));
    this.players.push(makePlayer(this.away, "away", "fw", FIELD.cx + 100, FIELD.cy - 80, -1, 6));
    this.players.push(makePlayer(this.away, "away", "fw", FIELD.cx + 100, FIELD.cy + 80, 1, 7));
    this.players.push(makePlayer(this.away, "away", "mf", FIELD.cx + 200, FIELD.cy, 0, 8));

    // Yerel kullanıcının kontrol edeceği oyuncu (offline veya host)
    if (this.opts.online && this.netRole === "client") {
      // Client = deplasman tarafı (varsayılan ön sağ orta)
      this.userIdx = 7; // away mf
    } else {
      this.userIdx = 3; // home mf
    }
    this.players[this.userIdx].userControlled = true;

    this.ball.x = FIELD.cx;
    this.ball.y = FIELD.cy;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;
    this.ball.setOwner(null);
  }

  _userPlayer() { return this.players[this.userIdx]; }

  // En yakın saha oyuncusunu seç (kullanıcı için)
  switchToNearestToBall() {
    let bestI = -1, bestD = Infinity;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.role === "gk") continue;
      if (p.side !== this._userSide()) continue;
      const d = Math.hypot(p.x - this.ball.x, p.y - this.ball.y);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI >= 0 && bestI !== this.userIdx) {
      this.players[this.userIdx].userControlled = false;
      this.userIdx = bestI;
      this.players[this.userIdx].userControlled = true;
    }
  }

  _userSide() {
    if (this.opts.online && this.netRole === "client") return "away";
    return "home";
  }

  toast(msg, time = 1.6) {
    this.ui.toast(msg, time);
  }

  startKickoff() {
    this.state = "kickoff";
    this.ball.x = FIELD.cx; this.ball.y = FIELD.cy;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;
    this.ball.setOwner(null);
    this.toast("Hazır mısın?", 1.2);
    Sfx.whistle(false);
    setTimeout(() => {
      if (this.state === "kickoff") {
        this.state = "play";
        Sfx.whistle(false);
      }
    }, 1300);
  }

  begin() {
    Sfx.setCrowdLevel(0.45, 1.2);
    this.startKickoff();
  }

  pause() { if (this.state !== "over") this.state = "paused"; }
  resume() {
    if (this.state === "paused") this.state = "play";
  }
  end() {
    this.state = "over";
    Sfx.whistle(true);
    Sfx.setCrowdLevel(0.0, 1.5);
    if (this.network) this.network.send({ t:"end", score:this.score });
  }

  _onNetMsg(m) {
    if (!m) return;
    if (m.t === "input" && this.netRole === "host") {
      this.lastRemoteInput = m.input || this.lastRemoteInput;
    } else if (m.t === "state" && this.netRole === "client") {
      // host snapshot uygula
      const s = m.s;
      for (let i = 0; i < s.p.length && i < this.players.length; i++) {
        const sp = s.p[i], pp = this.players[i];
        // Kendi oyuncumuzu sert overwrite'tan koru — host yine de yetkili
        pp.x = sp.x; pp.y = sp.y;
        pp.vx = sp.vx; pp.vy = sp.vy;
        pp.facing = sp.f;
      }
      this.ball.x = s.b.x; this.ball.y = s.b.y; this.ball.z = s.b.z;
      this.ball.vx = s.b.vx; this.ball.vy = s.b.vy; this.ball.vz = s.b.vz;
      this.ball.netImpulse = s.b.n || 0;
      this.ball.owner = s.b.o != null ? this.players[s.b.o] : null;
      this.score = s.sc;
      this.clock = s.t;
      if (s.gst && s.gst !== this.state) {
        const prev = this.state;
        this.state = s.gst;
        if (s.gst === "goal" && prev !== "goal") {
          Sfx.goal(); this.ui.showGoal();
        }
      }
    } else if (m.t === "end") {
      this.score = m.score || this.score;
      this.end();
    }
  }

  _broadcastState() {
    if (this.netRole !== "host" || !this.network) return;
    this.netSendAcc += 1;
    if (this.netSendAcc < 2) return; // ~30Hz
    this.netSendAcc = 0;
    const ownerIdx = this.ball.owner ? this.players.indexOf(this.ball.owner) : -1;
    const s = {
      p: this.players.map(p => ({ x:p.x|0, y:p.y|0, vx:p.vx|0, vy:p.vy|0, f:Math.round(p.facing*100)/100 })),
      b: { x:this.ball.x|0, y:this.ball.y|0, z:this.ball.z|0,
           vx:this.ball.vx|0, vy:this.ball.vy|0, vz:this.ball.vz|0,
           o: ownerIdx >= 0 ? ownerIdx : null,
           n: Math.round((this.ball.netImpulse||0)*100)/100 },
      sc: this.score,
      t: Math.max(0, this.clock|0),
      gst: this.state,
    };
    this.network.send({ t:"state", s });
  }

  _doAction(player, kind, input, dt) {
    if (player.cooldown > 0) return;
    const ball = this.ball;
    if (ball.owner !== player) return;
    let angle = player.facing;
    let power = 0.5;
    let lift = 0;
    if (kind === "shoot") {
      power = 0.8 + 0.2 * (input.shootCharge ?? 0.5);
      // Şut otomatik kaleye yönlendir (hafif)
      const targetX = player.side === "home" ? FIELD.right - 24 : FIELD.left + 24;
      const targetY = FIELD.cy;
      const aim = Math.atan2(targetY - player.y, targetX - player.x);
      // %70 aim + %30 yön
      angle = lerpAngle(player.facing, aim, 0.7);
      lift = 0.35 + Math.random()*0.2;
      Sfx.shoot(power);
    } else if (kind === "pass") {
      // En yakın takım arkadaşına pasla
      const ally = this._closestAlly(player);
      if (ally) angle = Math.atan2(ally.y - player.y, ally.x - player.x);
      power = 0.45;
      lift = 0.05;
      Sfx.pass();
    } else if (kind === "cross") {
      // Ortala — kalenin önüne, hafif lift ile
      const tx = player.side === "home" ? FIELD.right - 80 : FIELD.left + 80;
      const ty = FIELD.cy + (Math.random()*120 - 60);
      angle = Math.atan2(ty - player.y, tx - player.x);
      power = 0.7;
      lift = 0.65;
      Sfx.cross();
    }
    ball.kick(angle, power, lift);
    player.cooldown = 0.3;
  }

  _closestAlly(self) {
    let best = null, bestD = Infinity;
    for (const p of this.players) {
      if (p === self) continue;
      if (p.side !== self.side) continue;
      if (p.role === "gk") continue;
      const d = Math.hypot(p.x - self.x, p.y - self.y);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  // dt: saniye, input: { dir:{x,y}, just:{pass,cross,shoot}, shootCharge }
  step(dt, input) {
    if (this.state === "paused" || this.state === "over") return;

    if (this.state === "play") {
      this.clock = Math.max(0, this.clock - dt);
      if (this.clock <= 0) {
        this.end();
        return;
      }
    }

    // Host yetkili simulasyon
    const isAuthoritative = !this.opts.online || this.netRole === "host";

    if (isAuthoritative) {
      // Kullanıcı kontrol etti
      const me = this._userPlayer();
      if (this.state === "play") {
        const d = input.dir;
        const sp = me.maxSpeed;
        me.vx += ((d.x*sp) - me.vx) * Math.min(1, dt*8);
        me.vy += ((d.y*sp) - me.vy) * Math.min(1, dt*8);
        if (Math.hypot(d.x,d.y) > 0.1) me.facing = Math.atan2(d.y, d.x);
        if (input.just.shoot) this._doAction(me, "shoot", input, dt);
        if (input.just.pass)  this._doAction(me, "pass", input, dt);
        if (input.just.cross) this._doAction(me, "cross", input, dt);
      }

      // Uzaktan oyuncu (online clientten gelen input) — varsa
      if (this.opts.online && this.netRole === "host") {
        const remoteIdx = 7; // client'in kontrol ettiği oyuncu (away mf)
        const rp = this.players[remoteIdx];
        const ri = this.lastRemoteInput;
        const sp = rp.maxSpeed;
        rp.vx += (((ri.dx||0)*sp) - rp.vx) * Math.min(1, dt*8);
        rp.vy += (((ri.dy||0)*sp) - rp.vy) * Math.min(1, dt*8);
        if (Math.hypot(ri.dx||0, ri.dy||0) > 0.1) rp.facing = Math.atan2(ri.dy, ri.dx);
        // Aksiyonlar tek seferlik: input içerisinde just_* 
        if (ri.justShoot) { this._doAction(rp, "shoot", { shootCharge:ri.shootCharge||0.5 }); ri.justShoot=false; }
        if (ri.justPass)  { this._doAction(rp, "pass", {}); ri.justPass=false; }
        if (ri.justCross) { this._doAction(rp, "cross", {}); ri.justCross=false; }
      }

      // AI oyuncuları
      for (const p of this.players) {
        if (p.userControlled) continue;
        if (this.opts.online && this.netRole === "host" && p === this.players[7]) continue; // client kontrolü
        const allies = this.players.filter(q => q.side === p.side && q !== p);
        const opponents = this.players.filter(q => q.side !== p.side);
        if (p.role === "gk") {
          goalkeeperAI(p, this.ball, dt, this.opts.difficulty || 0.85);
        } else {
          const action = fieldPlayerAI(p, this.ball, allies, opponents, dt, this.opts.difficulty || 0.85);
          // Aksiyonu sadece topla ise yap
          if (action && this.ball.owner === p && p.cooldown <= 0) {
            this._doAction(p, action, { shootCharge: 0.7 + Math.random()*0.3 });
          }
        }
        if (p.cooldown > 0) p.cooldown -= dt;
      }

      // Pozisyon entegrasyonu
      for (const p of this.players) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.x = Math.max(FIELD.left + 8, Math.min(FIELD.right - 8, p.x));
        p.y = Math.max(FIELD.top + 8, Math.min(FIELD.bottom - 8, p.y));
      }
      // Çarpışma
      resolvePlayerCollisions(this.players);

      // Top
      let goalSide = null;
      this.ball.update(dt,
        (side) => { goalSide = side; },
        () => { Sfx.post(); },
        () => { Sfx.net(); this.renderer.emitParticles(this.ball.x, this.ball.y, 8, "#ffffff", 80, 0.4); },
        (b, p) => { Sfx.bounce(p); }
      );

      if (this.state === "play") tryPickup(this.ball, this.players, dt);

      if (goalSide && this.state === "play") {
        // sol kaleye giren = home gol yedi → away skor; sağ kale = home skor
        if (goalSide === "home") this.score.away++;
        else this.score.home++;
        this.state = "goal";
        this.toast("GOL!", 1.6);
        Sfx.goal();
        Sfx.setCrowdLevel(0.85, 0.2);
        this.renderer.spawnConfetti(goalSide === "home" ? FIELD.left + 40 : FIELD.right - 40, FIELD.cy);
        this.ui.showGoal();
        setTimeout(() => Sfx.setCrowdLevel(0.45, 1.5), 2200);
        setTimeout(() => {
          if (this.clock > 0) this.startKickoff();
          else this.end();
        }, 2400);
      }

      // Otomatik oyuncu değişimi: top kullanıcının yakınında değilse
      if (!this.opts.online || this.netRole === "host") {
        const me = this._userPlayer();
        const dball = Math.hypot(me.x - this.ball.x, me.y - this.ball.y);
        if (dball > 240 && this.ball.owner !== me) {
          this.switchToNearestToBall();
        }
      }
    }

    // Client: input gönder
    if (this.opts.online && this.netRole === "client" && this.network) {
      this.netSendAcc += 1;
      if (this.netSendAcc >= 1) {
        this.netSendAcc = 0;
        this.network.send({
          t:"input",
          input:{
            dx: input.dir.x, dy: input.dir.y,
            justShoot: input.just.shoot,
            justPass: input.just.pass,
            justCross: input.just.cross,
            shootCharge: input.shootCharge,
          }
        });
      }
    }

    // Host: state yayınla
    this._broadcastState();

    this.renderer.updateParticles(dt);
  }

  draw() {
    const r = this.renderer;
    r.beginFrame();
    r.drawField();
    r.drawCrowd();
    r.drawPlayers(this.players);
    r.drawBall(this.ball);
    r.drawGoals(this.ball);
    r.drawParticles();
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI*2;
  while (d < -Math.PI) d += Math.PI*2;
  return a + d * t;
}
