// Penaltı modu — kale önü perspektif görünümü.
// Kontroller:
//   - Şutör: joystick = nişan al (sol/orta/sağ + alt/üst), ŞUT = vur
//   - Kaleci: joystick = sola/sağa/yukarı kayma (atlama)
// 5 atış serisi; 2-2 berabere gibi durumlarda golden goal'a geçer.

import { Renderer, teamById } from "./render.js";
import { Sfx } from "./audio.js";
import { PenaltyKeeperAI, PenaltyShooterAI } from "./ai.js";
import { FIELD } from "./physics.js";

export class PenaltyScene {
  // opts: { ai:bool, online:bool, network, role, homeTeamId, awayTeamId, rounds }
  constructor(canvas, opts, ui) {
    this.opts = opts;
    this.ui = ui;
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.home = teamById(opts.homeTeamId || "red");
    this.away = teamById(opts.awayTeamId || "blue");
    this.score = { home:0, away:0 };
    this.attempts = { home:0, away:0 };
    this.rounds = opts.rounds || 5;
    this.state = "ready";   // ready|aiming|shot|result|over
    this.timer = 0;
    this.shotsLog = [];     // 'goal'|'save'|'miss' per shot
    this.currentShooter = "home"; // home or away atar
    this.network = opts.network || null;
    this.netRole = opts.role || null;

    // Kaleci/şutör nesneleri
    this.shooter = {
      x: FIELD.W/2, y: FIELD.H*0.86, team: this.home,
      facingCamera: false, hairColor: "#3a2615", number: "9",
    };
    this.goalRect = {
      left: FIELD.W * 0.30,
      right: FIELD.W * 0.70,
      top: FIELD.H * 0.24,
      bottom: FIELD.H * 0.56,
      lineY: FIELD.H * 0.52, // kalecinin ayak bastığı kale çizgisi
    };
    this.gk = {
      x: FIELD.W/2, y: this.goalRect.lineY, team: this.away,
      facingCamera: true, hairColor: "#a0522d", number: "1",
      diving: false, diveAngle: 0,
      baseY: this.goalRect.lineY,
    };

    // Top ekran koordinatlarında (sadece bu mod için)
    this.ball = {
      x: FIELD.W/2, y: FIELD.H*0.82,
      z: 0,
      vx: 0, vy: 0, vz: 0,
      r: 22,                           // daha büyük ve görünür top
      flying: false,
      netImpulse: 0,
      t: 0,
      duration: 0.8,
      startX: FIELD.W/2,
      startY: FIELD.H*0.82,
      targetX: FIELD.W/2,
      targetY: FIELD.H*0.40,
      arcHeight: 120,
    };

    // Aim için
    this.aim = { x: 0, y: 0 }; // -1..1
    this.charge = 0;

    this.keeperAI = new PenaltyKeeperAI(opts.difficulty ?? 0.7);
    this.shooterAI = new PenaltyShooterAI(opts.difficulty ?? 0.7);

    if (this.network) this.network.onMessage = (m)=>this._onNetMsg(m);

    this._userIsShooter = true;
    this._setupRoles();
  }

  _setupRoles() {
    if (this.opts.online) {
      // host = ev takımı sırası; client = deplasman
      // Kim atar / kim kurtarır, currentShooter'a göre belirlenir
      this._userIsShooter = (this.currentShooter === "home" && this.netRole === "host") ||
                            (this.currentShooter === "away" && this.netRole === "client");
    } else {
      // Tek oyunculu: kullanıcı her zaman ev takımı atar; deplasman sırasında kaleci olur
      this._userIsShooter = (this.currentShooter === "home");
    }
    // Renkler
    this.shooter.team = this.currentShooter === "home" ? this.home : this.away;
    this.gk.team = this.currentShooter === "home" ? this.away : this.home;
  }

  _onNetMsg(m) {
    if (!m) return;
    if (m.t === "shot") {
      // Karşı taraftan gelen şut komutu (uzak şutör)
      this._takeShot(m.dir, m.power, /*remote*/true);
    } else if (m.t === "kpos") {
      // Karşı tarafın kaleci pozisyon güncellemesi
      this.gk.x = m.x; this.gk.y = m.y;
      this._clampKeeper();
      if (m.dir != null) { this.gk.diving = true; this.gk.diveAngle = m.dir * 0.8; }
    } else if (m.t === "result") {
      this.score = m.score; this.attempts = m.attempts; this.shotsLog = m.shotsLog;
      this.currentShooter = m.next;
      this._setupRoles();
      this._reset();
    }
  }

  begin() {
    Sfx.setCrowdLevel(0.55, 1.0);
    this._reset();
  }

  pause() { if (this.state !== "over") this.state = "paused"; }
  resume() { if (this.state === "paused") this.state = "ready"; }
  end() {
    this.state = "over";
    Sfx.whistle(true);
    Sfx.setCrowdLevel(0.0, 1.5);
  }

  _reset() {
    this.timer = 0;
    this.state = "ready";
    this._resolved = false;
    this.ball.x = FIELD.W/2; this.ball.y = FIELD.H*0.83;
    this.ball.z = 0; this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;
    this.ball.flying = false; this.ball.netImpulse = 0;
    this.ball.t = 0;
    this.ball.duration = 0.82;
    this.shooter.x = FIELD.W/2; this.shooter.y = FIELD.H*0.85;
    this.gk.x = FIELD.W/2; this.gk.y = this.goalRect.lineY;
    this.gk.baseY = this.goalRect.lineY;
    this.gk.diving = false; this.gk.diveAngle = 0;
    this.aim.x = 0; this.aim.y = 0; this.charge = 0;
    this.keeperAI.reset();
    this.shooterAI.reset();
    this.ui.toast(this._sideName(this.currentShooter) + " atıyor", 1.4);
  }

  _sideName(s){ return (s === "home" ? this.home.name : this.away.name); }

  // Tek atışı başlat. dir: -1..1 (yatay), power: 0..1
  _takeShot(dir, power, remote = false) {
    if (this.ball.flying) return;
    this.ball.flying = true;
    this.state = "shot";
    this.ball.t = 0;
    this.ball.startX = FIELD.W / 2;
    this.ball.startY = FIELD.H * 0.82;
    const noise = (Math.random() - 0.5) * (1 - power) * 40;
    this.ball.targetX = FIELD.W / 2 + dir * (FIELD.W * 0.18) + noise;
    // Güce göre daha üst köşe hedefi
    const topBias = 0.30 - power * 0.09;
    this.ball.targetY = this.goalRect.top + (this.goalRect.bottom - this.goalRect.top) * (topBias + Math.random() * 0.30);
    this.ball.duration = 0.92 - power * 0.28;
    this.ball.arcHeight = 85 + power * 120;
    Sfx.shoot(power);
    // AI kaleci varsa: yön tahminini AI'ya da sağla
    this._predictedDir = dir < -0.25 ? -1 : dir > 0.25 ? 1 : 0;

    // Multiplayer: hostta veya tek oyunculuda yetkili — sonucu yayınla iz aşamasında
  }

  // Joystick + butonlar
  step(dt, input) {
    if (this.state === "paused" || this.state === "over") return;

    this.timer += dt;
    if (this.state === "ready" || this.state === "aiming") {
      if (this._userIsShooter) {
        // Aim'i joystick ile ayarla
        this.aim.x += (input.dir.x - this.aim.x) * Math.min(1, dt*8);
        this.aim.y += (input.dir.y - this.aim.y) * Math.min(1, dt*8);
        this.state = "aiming";
        if (input.just.shoot) {
          const power = Math.max(0.4, input.shootCharge || 0.6);
          this._takeShot(this.aim.x, power);
          if (this.opts.online) {
            this.network && this.network.send({ t:"shot", dir:this.aim.x, power });
          }
        }
      } else {
        // Kaleci: joystick ile pozisyon kaydır
        if (this.opts.online) {
          // İnsan kaleci: oyuncudan gelen yönle hareket
          const sx = FIELD.W/2 + input.dir.x * (FIELD.W*0.15);
          const sy = this.goalRect.lineY - Math.max(0, -input.dir.y) * 28;
          this.gk.x += (sx - this.gk.x) * Math.min(1, dt*6);
          this.gk.y += (sy - this.gk.y) * Math.min(1, dt*6);
          this._clampKeeper();
          this.network && this.network.send({ t:"kpos", x:this.gk.x|0, y:this.gk.y|0, dir:null });
        } else {
          // AI şutör — yumuşak hareket
          const cmd = this.shooterAI.update(this, dt, this.timer);
          if (cmd) this._takeShot(cmd.dir, cmd.power);
          // Kullanıcı kaleci olarak joystick ile yatay/dikey hareket eder
          const sx = FIELD.W/2 + input.dir.x * (FIELD.W*0.15);
          const sy = this.goalRect.lineY - Math.max(0, -input.dir.y) * 28;
          this.gk.x += (sx - this.gk.x) * Math.min(1, dt*6);
          this.gk.y += (sy - this.gk.y) * Math.min(1, dt*6);
          this._clampKeeper();
        }
      }
    }

    if (this.state === "shot" || this.ball.flying) {
      // Gerçekçi şut eğrisi: hedefe doğru ilerlerken parabolik yükselip iner.
      this.ball.t += dt / this.ball.duration;
      const p = Math.min(1.05, this.ball.t);
      const pClamped = Math.min(1, p);
      const baseX = lerp(this.ball.startX, this.ball.targetX, pClamped);
      const baseY = lerp(this.ball.startY, this.ball.targetY, pClamped);
      const arc = 4 * pClamped * (1 - pClamped); // 0..1..0
      this.ball.x = baseX;
      this.ball.y = baseY - arc * this.ball.arcHeight;
      this.ball.z = pClamped;

      // Kaleci AI (yapay zekaya karşı modda)
      if (!this.opts.online && this._userIsShooter) {
        // Kullanıcı atıcı, AI kaleci — atış sonrası tepki
        this.keeperAI.update(this.gk, this.ball, dt, this.timer, true, this._predictedDir);
        this._clampKeeper();
      }
      if (!this.opts.online && !this._userIsShooter) {
        // Kullanıcı kaleci — joystick ile hareket zaten sağlandı
      }

      // Çarpışma kontrolü — kale çerçevesi
      const goalLeft = this.goalRect.left, goalRight = this.goalRect.right;
      const goalTop = this.goalRect.top, goalBot = this.goalRect.bottom;
      // Kaleci kurtarması (basit dikdörtgen)
      const gkBox = { x: this.gk.x, y: this.gk.y - 12, w: 92, h: 112 };
      const pointInRect = (x,y, b) => x > b.x - b.w/2 && x < b.x + b.w/2 && y > b.y - b.h/2 && y < b.y + b.h/2;

      // Top kale derinliğine ulaştığında sonuç ver
      if (this.ball.t >= 1.0 && !this._resolved) {
        this._resolved = true;
        // Topun ekran konumu
        const bx = this.ball.x, by = this.ball.y;
        let result = "miss";
        if (pointInRect(bx, by, gkBox)) result = "save";
        else if (bx > goalLeft && bx < goalRight && by > goalTop && by < goalBot) result = "goal";

        if (result === "goal") {
          if (this.currentShooter === "home") this.score.home++;
          else this.score.away++;
          this.shotsLog.push("goal");
          Sfx.net();
          Sfx.goal();
          Sfx.setCrowdLevel(0.85, 0.2);
          this.ball.netImpulse = 1.0;
          this.renderer.spawnConfetti(bx, by);
          this.ui.showGoal();
          setTimeout(()=>Sfx.setCrowdLevel(0.55, 1.2), 2000);
        } else if (result === "save") {
          this.shotsLog.push("save");
          Sfx.bounce(0.8);
          this.renderer.emitParticles(bx, by, 10, "#d8ecff", 160, 0.45);
          this.ui.toast("KURTARDI!", 1.4);
        } else {
          this.shotsLog.push("miss");
          if (bx < goalLeft || bx > goalRight) Sfx.post();
          this.ui.toast("AUT!", 1.2);
        }

        if (this.currentShooter === "home") this.attempts.home++;
        else this.attempts.away++;

        setTimeout(() => this._nextShot(), 2400);
        this.state = "result";
      }

      if (this.ball.netImpulse > 0) this.ball.netImpulse -= dt * 1.5;
    }

    this.renderer.updateParticles(dt);
  }

  _nextShot() {
    this._resolved = false;
    // Berabere bozulmadıysa ve toplam atış 5'ten önce — sırayı değiştir
    const total = this.attempts.home + this.attempts.away;
    const shouldEnd = this._isSeriesOver();
    if (shouldEnd) { this.end(); this.ui.onMatchEnd(this.score); return; }
    this.currentShooter = this.currentShooter === "home" ? "away" : "home";
    this._setupRoles();
    if (this.netRole === "host" && this.network) {
      this.network.send({ t:"result", score:this.score, attempts:this.attempts, shotsLog:this.shotsLog, next:this.currentShooter });
    }
    this._reset();
  }

  _isSeriesOver() {
    const n = this.rounds;
    const ha = this.attempts.home, aa = this.attempts.away;
    const hs = this.score.home, as = this.score.away;
    // Her iki tarafın olası sona kadarki maksimum skoru
    const homeCanReach = hs + (n - ha);
    const awayCanReach = as + (n - aa);
    if (ha >= n && aa >= n) {
      if (hs !== as) return true;
      // Berabere → golden goal: her iki tarafın eşit atışı olduğunda fark varsa biter
      if (ha === aa && hs !== as && ha > n) return true;
      return false;
    }
    if (homeCanReach < as) return true;
    if (awayCanReach < hs) return true;
    return false;
  }

  draw() {
    const r = this.renderer;
    r.beginPenaltyView();
    const t = r.t || 0;

    // Kale (uzakta, perspektifli)
    // Topun ekran posizyonu (z'ye göre küçülür)
    const ballScale = 1 - this.ball.z * 0.45; // daha doğal küçülme
    const persX = (FIELD.W/2) + (this.ball.x - FIELD.W/2) * (1 - this.ball.z*0.3);
    const persY = this.ball.y - this.ball.z * (FIELD.H*0.30); // yukarı
    r.drawPenaltyGoal(this.ball.netImpulse || 0, persX, persY, t, this.goalRect);

    // Kaleci (kale çizgisinde, zeminde)
    r.drawPenaltyCharacter(this.gk, 1.15);

    // Top
    r.ctx.fillStyle = "rgba(0,0,0,0.35)";
    r.ctx.beginPath();
    r.ctx.ellipse(
      persX,
      FIELD.H * 0.86 - this.ball.z * 100,
      20 * Math.max(0.45, 1 - this.ball.z),
      7,
      0, 0, Math.PI * 2
    );
    r.ctx.fill();
    r.ctx.fillStyle = "#fff";
    r.ctx.beginPath();
    const visualR = this.ball.r * Math.max(0.45, ballScale);
    r.ctx.arc(persX, persY, visualR, 0, Math.PI*2);
    r.ctx.fill();
    r.ctx.fillStyle = "#1a1a1a";
    for (let i = 0; i < 5; i++) {
      const a = i*(Math.PI*2/5) + this.timer*5;
      const px = persX + Math.cos(a) * (visualR * 0.42);
      const py = persY + Math.sin(a) * (visualR * 0.42);
      r.ctx.beginPath(); r.ctx.arc(px, py, Math.max(1.6, visualR * 0.14), 0, Math.PI*2); r.ctx.fill();
    }

    // Şutör — kameraya yakın (büyük), arkadan görünür
    r.drawPenaltyCharacter(this.shooter, 1.75);

    // Aim göstergesi (kullanıcı şutör ise)
    if (this._userIsShooter && (this.state === "ready" || this.state === "aiming")) {
      r.ctx.strokeStyle = "rgba(255,216,77,0.85)";
      r.ctx.lineWidth = 3;
      r.ctx.setLineDash([8, 8]);
      const ax = FIELD.W/2 + this.aim.x * (FIELD.W*0.22);
      const ay = this.goalRect.top + (this.goalRect.bottom - this.goalRect.top) * 0.45 + this.aim.y * 40;
      r.ctx.beginPath();
      r.ctx.moveTo(FIELD.W/2, FIELD.H*0.82);
      r.ctx.lineTo(ax, ay);
      r.ctx.stroke();
      r.ctx.setLineDash([]);
      r.ctx.fillStyle = "rgba(255,216,77,0.85)";
      r.ctx.beginPath(); r.ctx.arc(ax, ay, 8, 0, Math.PI*2); r.ctx.fill();
    }

    // Skor mini panel
    r.ctx.fillStyle = "rgba(0,0,0,0.45)";
    r.ctx.fillRect(FIELD.W/2 - 200, 16, 400, 36);
    r.ctx.fillStyle = "#fff";
    r.ctx.font = "bold 18px system-ui";
    r.ctx.textAlign = "center";
    r.ctx.fillText(`${this.home.name}  ${this.score.home} : ${this.score.away}  ${this.away.name}`, FIELD.W/2, 40);

    // Atış noktaları (5)
    const drawDots = (side, baseX) => {
      const arr = this.shotsLog.filter((_,i)=> {
        // shotsLog sıralı — home/away kayıtsızdır; basit görünüm için son 5 atışı göster
        return true;
      });
      for (let i=0;i<this.rounds;i++) {
        r.ctx.fillStyle = "rgba(255,255,255,0.3)";
        r.ctx.beginPath(); r.ctx.arc(baseX + i*22, 76, 7, 0, Math.PI*2); r.ctx.fill();
      }
    };
    drawDots("home", FIELD.W/2 - 200);
    drawDots("away", FIELD.W/2 + 100);

    r.drawParticles();
  }

  _clampKeeper() {
    this.gk.x = Math.max(this.goalRect.left + 28, Math.min(this.goalRect.right - 28, this.gk.x));
    this.gk.y = Math.max(this.goalRect.lineY - 30, Math.min(this.goalRect.lineY + 8, this.gk.y));
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
