// Top + oyuncu çarpışmaları, top fiziği (z yüksekliği, sekme, sürtünme),
// kale direği, ağ, gol algılama. Top "z" ekseninde de hareket eder.

import { Sfx } from "./audio.js";

export const FIELD = {
  W: 1280, H: 720,
  pad: 60,            // dış kenarlık (saha kenarı)
  goalW: 16,          // direk genişliği
  goalH: 180,         // kale ağzı (y-yönü)
  goalDepth: 36,      // kale derinliği (içeri)
  ballR: 12,
  playerR: 20,
};

FIELD.left   = FIELD.pad;
FIELD.right  = FIELD.W - FIELD.pad;
FIELD.top    = FIELD.pad;
FIELD.bottom = FIELD.H - FIELD.pad;
FIELD.cy     = FIELD.H / 2;
FIELD.cx     = FIELD.W / 2;
FIELD.goalTop    = FIELD.cy - FIELD.goalH/2;
FIELD.goalBottom = FIELD.cy + FIELD.goalH/2;

export class Ball {
  constructor() {
    this.x = FIELD.cx;
    this.y = FIELD.cy;
    this.z = 0;            // yükseklik
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.spin = 0;
    this.owner = null;     // şu anda topu süren oyuncu
    this.lastTouchTeam = null;
    this.netImpulse = 0;   // ağa carptıktan sonra ağ sallanması için
    this.r = FIELD.ballR;
  }

  setOwner(p) {
    this.owner = p;
    if (p) this.lastTouchTeam = p.team;
  }

  // Top fiziği — dt saniye cinsinden
  update(dt, onGoal, onPost, onNet, onBounce) {
    // Sahibi varsa ona kilitlen
    if (this.owner) {
      const p = this.owner;
      const off = 22; // önüne yerleşsin
      this.x = p.x + Math.cos(p.facing) * off;
      this.y = p.y + Math.sin(p.facing) * off;
      this.z *= 0.5;
      this.vx = p.vx; this.vy = p.vy; this.vz = 0;
      return;
    }

    // Yerçekimi
    this.vz -= 1500 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    if (this.z < 0) {
      this.z = 0;
      if (this.vz < -10) {
        this.vz = -this.vz * 0.55;       // sekme
        this.vx *= 0.92; this.vy *= 0.92; // yatay enerji kaybı
        if (Math.abs(this.vz) > 60 && onBounce) onBounce(this, Math.min(1, Math.abs(this.vz)/600));
      } else {
        this.vz = 0;
      }
    }

    // Sürtünme — yerdeyken daha fazla
    const onGround = this.z <= 0.5;
    const drag = onGround ? 0.78 : 0.18;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 0) {
      const k = Math.max(0, 1 - drag * dt);
      this.vx *= k; this.vy *= k;
      if (Math.hypot(this.vx, this.vy) < 6) { this.vx = 0; this.vy = 0; }
    }

    // Gol kontrolü (sol + sağ)
    if (this.z < 90) {
      if (this.x - this.r <= FIELD.left) {
        if (this.y > FIELD.goalTop && this.y < FIELD.goalBottom) {
          // Sol kale içine girdi
          if (this.x < FIELD.left - 6) {
            // Henüz arka ağa değmediyse: gol et + ağa savur
            if (onGoal) onGoal("home");  // sol = ev (ev sağa atak yapar — aslında sol kaleye ev TAKIMI gol yer)
            // Not: skor mantığını match.js belirler (hangi takıma gol)
            this._handleNetHit(onNet);
          }
        } else {
          // Direk veya yan duvar
          this._handleSideHit("left", onPost);
        }
      }
      if (this.x + this.r >= FIELD.right) {
        if (this.y > FIELD.goalTop && this.y < FIELD.goalBottom) {
          if (this.x > FIELD.right + 6) {
            if (onGoal) onGoal("away");
            this._handleNetHit(onNet);
          }
        } else {
          this._handleSideHit("right", onPost);
        }
      }
    } else {
      // Top havada ve direk yüksekliğinin üstünde — yan duvar gibi davransın
      if (this.x - this.r < FIELD.left)  { this.x = FIELD.left + this.r;  this.vx = -this.vx * 0.6; }
      if (this.x + this.r > FIELD.right) { this.x = FIELD.right - this.r; this.vx = -this.vx * 0.6; }
    }

    // Üst/alt kenarlar
    if (this.y - this.r < FIELD.top)    { this.y = FIELD.top + this.r;    this.vy = -this.vy * 0.6; if (onBounce) onBounce(this,.4); }
    if (this.y + this.r > FIELD.bottom) { this.y = FIELD.bottom - this.r; this.vy = -this.vy * 0.6; if (onBounce) onBounce(this,.4); }

    // Direk çarpışması (üst/alt direk yan yüzü)
    const goalPosts = [
      { x: FIELD.left,  y: FIELD.goalTop },
      { x: FIELD.left,  y: FIELD.goalBottom },
      { x: FIELD.right, y: FIELD.goalTop },
      { x: FIELD.right, y: FIELD.goalBottom },
    ];
    for (const gp of goalPosts) {
      const dx = this.x - gp.x, dy = this.y - gp.y;
      const d = Math.hypot(dx, dy);
      if (d < this.r + 6 && this.z < 90) {
        const nx = dx/d, ny = dy/d;
        this.x = gp.x + nx * (this.r + 6);
        this.y = gp.y + ny * (this.r + 6);
        const vn = this.vx*nx + this.vy*ny;
        this.vx -= 1.7 * vn * nx;
        this.vy -= 1.7 * vn * ny;
        this.vx *= 0.85; this.vy *= 0.85;
        if (onPost) onPost();
      }
    }

    if (this.netImpulse > 0) {
      this.netImpulse = Math.max(0, this.netImpulse - dt * 1.5);
    }
  }

  _handleNetHit(onNet) {
    // Topu kale içinde nazikçe yavaşlat ve ağı salla
    this.vx *= -0.15; this.vy *= 0.4; this.vz *= 0.2;
    this.netImpulse = 1.0;
    if (onNet) onNet(this);
  }
  _handleSideHit(side, onPost) {
    if (side === "left")  { this.x = FIELD.left + this.r;  this.vx = -this.vx * 0.65; }
    else                  { this.x = FIELD.right - this.r; this.vx = -this.vx * 0.65; }
    this.vy *= 0.9;
    if (Math.abs(this.vx) > 80 && onPost) onPost();
  }

  kick(angle, power, lift = 0) {
    // power: 0..1
    const maxV = 980;
    const v = 320 + 660 * power;
    this.vx = Math.cos(angle) * v;
    this.vy = Math.sin(angle) * v;
    this.vz = lift * (250 + 300 * power);
    this.owner = null;
  }

  applyImpulse(vx, vy, vz=0) {
    this.vx += vx; this.vy += vy; this.vz += vz;
    this.owner = null;
  }
}

// Oyuncu - top yakalama
export function tryPickup(ball, players, dt) {
  if (ball.owner) return;
  if (ball.z > 40) return; // havadaki topa süreklemez (kafa vuruşu sonra)
  let best = null, bestD = Infinity;
  for (const p of players) {
    if (!p.canControl) continue;
    const d = Math.hypot(p.x - ball.x, p.y - ball.y);
    if (d < FIELD.playerR + ball.r + 6 && d < bestD) {
      best = p; bestD = d;
    }
  }
  if (best) {
    // hafif çekim — topu hızla yakalama
    ball.setOwner(best);
  }
}

// Oyuncular birbirine de çarpsın (basit dairesel)
export function resolvePlayerCollisions(players) {
  for (let i = 0; i < players.length; i++) {
    for (let j = i+1; j < players.length; j++) {
      const a = players[i], b = players[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const min = FIELD.playerR * 2 - 4;
      if (d < min) {
        const nx = dx/d, ny = dy/d;
        const overlap = (min - d) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        // hız aktarımı çok az
        const va = a.vx*nx + a.vy*ny;
        const vb = b.vx*nx + b.vy*ny;
        const swap = (vb - va) * 0.2;
        a.vx += swap * nx; a.vy += swap * ny;
        b.vx -= swap * nx; b.vy -= swap * ny;
      }
    }
  }
}
