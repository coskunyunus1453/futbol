// Saha + sevimli karakter + top + kale + ağ + parçacık çizimleri.

import { FIELD } from "./physics.js";

export const TEAMS = [
  { id:"red",   primary:"#ff4d4d", secondary:"#ffe082", name:"Kırmızılar" },
  { id:"blue",  primary:"#4d8cff", secondary:"#ffffff", name:"Maviler"   },
  { id:"yellow",primary:"#ffd84d", secondary:"#1a1a1a", name:"Sarılar"   },
  { id:"green", primary:"#36c264", secondary:"#0c2c14", name:"Yeşiller"  },
  { id:"purple",primary:"#a974ff", secondary:"#ffffff", name:"Morlar"    },
  { id:"orange",primary:"#ff8a3d", secondary:"#222222", name:"Turuncular"},
];
export function teamById(id){ return TEAMS.find(t=>t.id===id) || TEAMS[0]; }

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fit();
    window.addEventListener("resize", () => this.fit());

    this.particles = [];
    this.netWaves = []; // ağ dalgalanma fazları
    this.t = 0;
  }

  fit() {
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    const w = Math.max(320, rect.width  * this.dpr);
    const h = Math.max(180, rect.height * this.dpr);
    c.width = w; c.height = h;
    // Sahayı 1280x720 mantıksal koordinatları kullanıp ekrana sığdır
    const sx = w / FIELD.W;
    const sy = h / FIELD.H;
    const s = Math.min(sx, sy);
    this.scale = s;
    this.offX = (w - FIELD.W * s) / 2;
    this.offY = (h - FIELD.H * s) / 2;
  }

  screenToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * this.dpr;
    const py = (clientY - r.top) * this.dpr;
    return {
      x: (px - this.offX) / this.scale,
      y: (py - this.offY) / this.scale,
    };
  }

  emitParticles(x, y, count, color, speed = 200, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * speed;
      this.particles.push({
        x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
        life, age: 0, color, size: 2 + Math.random() * 3
      });
    }
  }

  emitGrass(x, y) {
    this.emitParticles(x, y, 6, "#2faf52", 140, 0.35);
  }

  spawnConfetti(cx, cy) {
    const colors = ["#ffd84d","#ff7a59","#4d8cff","#ff4d4d","#36c264","#ffffff"];
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: cx + (Math.random()-0.5)*40,
        y: cy + (Math.random()-0.5)*20,
        vx: Math.cos(a) * (180 + Math.random()*200),
        vy: Math.sin(a) * (180 + Math.random()*200) - 200,
        life: 1.4, age: 0,
        color: colors[(Math.random()*colors.length)|0],
        size: 3 + Math.random()*4,
        gravity: 600,
      });
    }
  }

  updateParticles(dt) {
    this.t += dt;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) { this.particles.splice(i,1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      p.vx *= 0.96; p.vy *= 0.96;
    }
  }

  // ------------------- ÇİZİM -------------------
  beginFrame() {
    const ctx = this.ctx;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    ctx.setTransform(this.scale,0,0,this.scale,this.offX,this.offY);
  }

  drawField() {
    const ctx = this.ctx;
    // Çim — şeritli desen
    const stripeH = 60;
    for (let y = 0; y < FIELD.H; y += stripeH) {
      const dark = (y/stripeH) % 2 === 0;
      ctx.fillStyle = dark ? "#0e7a31" : "#10883a";
      ctx.fillRect(0, y, FIELD.W, stripeH);
    }
    // Dış kenar çimi (biraz daha koyu)
    ctx.fillStyle = "#0a4f1f";
    ctx.fillRect(0, 0, FIELD.W, FIELD.top);
    ctx.fillRect(0, FIELD.bottom, FIELD.W, FIELD.H - FIELD.bottom);
    ctx.fillRect(0, 0, FIELD.left, FIELD.H);
    ctx.fillRect(FIELD.right, 0, FIELD.W - FIELD.right, FIELD.H);

    // Çizgiler
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3;
    ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);

    // Orta çizgi
    ctx.beginPath();
    ctx.moveTo(FIELD.cx, FIELD.top);
    ctx.lineTo(FIELD.cx, FIELD.bottom);
    ctx.stroke();
    // Orta yuvarlak
    ctx.beginPath();
    ctx.arc(FIELD.cx, FIELD.cy, 80, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(FIELD.cx, FIELD.cy, 4, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();

    // Ceza sahası (sol/sağ)
    const boxW = 140, boxH = 280;
    ctx.strokeRect(FIELD.left, FIELD.cy - boxH/2, boxW, boxH);
    ctx.strokeRect(FIELD.right - boxW, FIELD.cy - boxH/2, boxW, boxH);
    // 5'lik kutu
    const box5W = 60, box5H = 160;
    ctx.strokeRect(FIELD.left, FIELD.cy - box5H/2, box5W, box5H);
    ctx.strokeRect(FIELD.right - box5W, FIELD.cy - box5H/2, box5W, box5H);
    // Penaltı noktası
    ctx.beginPath(); ctx.arc(FIELD.left + 100, FIELD.cy, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(FIELD.right - 100, FIELD.cy, 4, 0, Math.PI*2); ctx.fill();
    // Penaltı yayı
    ctx.beginPath();
    ctx.arc(FIELD.left + 100, FIELD.cy, 56, -Math.PI/3, Math.PI/3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(FIELD.right - 100, FIELD.cy, 56, Math.PI - Math.PI/3, Math.PI + Math.PI/3, true);
    ctx.stroke();
    // Korner yayları
    const cornerR = 14;
    const corners = [[FIELD.left,FIELD.top],[FIELD.right,FIELD.top],[FIELD.left,FIELD.bottom],[FIELD.right,FIELD.bottom]];
    for (const [cx,cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, cornerR, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // Kale çizimi (sol/sağ)
  drawGoals(ball) {
    const ctx = this.ctx;
    const wave = ball ? ball.netImpulse : 0;
    const lastX = ball ? ball.x : 0, lastY = ball ? ball.y : 0;
    // Sol kale (saha dışına doğru ağ)
    this._drawGoal(ctx, "left", wave, lastX, lastY);
    this._drawGoal(ctx, "right", wave, lastX, lastY);
  }

  _drawGoal(ctx, side, wave, ballX, ballY) {
    const t = this.t;
    const isLeft = side === "left";
    const x0 = isLeft ? FIELD.left : FIELD.right;
    const dir = isLeft ? -1 : 1;
    const depth = FIELD.goalDepth;
    const top = FIELD.goalTop, bot = FIELD.goalBottom;

    // Ağ alanı zemini (gölge)
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(isLeft ? x0 - depth : x0, top, depth, bot - top);

    // Ağ — perspektifli ızgara, dalgalanma
    ctx.strokeStyle = "rgba(255,255,255,0.78)";
    ctx.lineWidth = 1;
    const cellsX = 6, cellsY = 8;
    for (let i = 0; i <= cellsX; i++) {
      const u = i / cellsX;
      const x = x0 + dir * depth * u;
      ctx.beginPath();
      for (let j = 0; j <= cellsY; j++) {
        const v = j / cellsY;
        const yy = top + (bot - top) * v;
        // Dalgalanma — topa yakın olduğu yerde daha çok
        let dy = 0, dx = 0;
        if (wave > 0) {
          const dist = Math.hypot(x - ballX, yy - ballY);
          const w = Math.max(0, 1 - dist/220) * wave;
          dy = Math.sin(t*22 + j*0.6 + i*0.5) * 4 * w;
          dx = Math.sin(t*18 + j*0.4) * 3 * w * dir;
        }
        if (j === 0) ctx.moveTo(x + dx, yy + dy);
        else ctx.lineTo(x + dx, yy + dy);
      }
      ctx.stroke();
    }
    for (let j = 0; j <= cellsY; j++) {
      const v = j / cellsY;
      const yy = top + (bot - top) * v;
      ctx.beginPath();
      for (let i = 0; i <= cellsX; i++) {
        const u = i / cellsX;
        const x = x0 + dir * depth * u;
        let dy = 0, dx = 0;
        if (wave > 0) {
          const dist = Math.hypot(x - ballX, yy - ballY);
          const w = Math.max(0, 1 - dist/220) * wave;
          dy = Math.sin(t*22 + j*0.6 + i*0.5) * 4 * w;
          dx = Math.sin(t*18 + j*0.4) * 3 * w * dir;
        }
        if (i === 0) ctx.moveTo(x + dx, yy + dy);
        else ctx.lineTo(x + dx, yy + dy);
      }
      ctx.stroke();
    }

    // Direkler
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0 - 4, top - 6, 8, 12);
    ctx.fillRect(x0 - 4, bot - 6, 8, 12);
    // Üstten direği bağlayan çizgi (üst kalas)
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(isLeft ? x0 - depth : x0, top - 4, depth, 4);
    ctx.fillRect(isLeft ? x0 - depth : x0, bot, depth, 4);
  }

  drawPlayers(players) {
    // Sıralama: alttaki en sonra
    const list = [...players].sort((a,b)=>a.y - b.y);
    for (const p of list) this.drawPlayer(p);
  }

  drawPlayer(p) {
    const ctx = this.ctx;
    const t = this.t;
    const moving = (p.vx || p.vy) ? Math.hypot(p.vx, p.vy) : 0;
    const bob = moving > 30 ? Math.sin(t*16 + p.x*0.01) * 2 : 0;

    // Gölge
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 14, 18, 7, 0, 0, Math.PI*2);
    ctx.fill();

    // Gövde (yarı oval)
    const bodyY = p.y - 4 + bob;
    ctx.fillStyle = p.team.primary;
    ctx.beginPath();
    ctx.ellipse(p.x, bodyY, 16, 12, 0, 0, Math.PI*2);
    ctx.fill();

    // Sırt numarası kümesi (lekeler)
    ctx.fillStyle = p.team.secondary;
    ctx.fillRect(p.x - 3, bodyY - 2, 6, 4);

    // Kollar (yön vektörünün yan tarafları)
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
    const sx = -fy, sy = fx;
    ctx.fillStyle = "#ffd9b3"; // ten
    ctx.beginPath(); ctx.arc(p.x + sx*14, bodyY + sy*14, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x - sx*14, bodyY - sy*14, 5, 0, Math.PI*2); ctx.fill();

    // Bacak izi (koşma anim)
    if (moving > 30) {
      const phase = Math.sin(t*16 + p.x*0.01);
      ctx.fillStyle = "#222";
      ctx.beginPath(); ctx.ellipse(p.x + sx*5, p.y + 12 + phase*2, 3, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x - sx*5, p.y + 12 - phase*2, 3, 5, 0, 0, Math.PI*2); ctx.fill();
    }

    // Baş — büyük şirin yuvarlak
    const headX = p.x, headY = bodyY - 14;
    ctx.fillStyle = "#fcd9b6";
    ctx.beginPath(); ctx.arc(headX, headY, 13, 0, Math.PI*2); ctx.fill();
    // saç
    ctx.fillStyle = p.hairColor || "#3a2615";
    ctx.beginPath();
    ctx.arc(headX, headY - 4, 12, Math.PI, Math.PI*2);
    ctx.fill();
    // bandana takım rengi
    ctx.fillStyle = p.team.primary;
    ctx.fillRect(headX - 12, headY - 5, 24, 3);

    // Yüz — yöne göre konumlanır
    const fxF = Math.cos(p.facing), fyF = Math.sin(p.facing);
    // gözler
    ctx.fillStyle = "#fff";
    const eyeR = 3.5;
    const eOff = 4;
    const exL = headX + fxF*3 - sx*eOff;
    const eyL = headY + fyF*3 - sy*eOff;
    const exR = headX + fxF*3 + sx*eOff;
    const eyR = headY + fyF*3 + sy*eOff;
    ctx.beginPath(); ctx.arc(exL, eyL, eyeR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(exR, eyR, eyeR, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath(); ctx.arc(exL + fxF*1.5, eyL + fyF*1.5, 1.6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(exR + fxF*1.5, eyR + fyF*1.5, 1.6, 0, Math.PI*2); ctx.fill();
    // ağız (gülümseme)
    ctx.strokeStyle = "#7a3a26";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const mx = headX + fxF*5, my = headY + fyF*5;
    ctx.arc(mx, my, 3.2, 0.1, Math.PI - 0.1);
    ctx.stroke();
    // yanak
    ctx.fillStyle = "rgba(255,120,140,0.5)";
    ctx.beginPath(); ctx.arc(headX - 7, headY + 3, 2.4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(headX + 7, headY + 3, 2.4, 0, Math.PI*2); ctx.fill();

    // Etiket: GK ya da kontrolcü ok
    if (p.role === "gk") {
      ctx.fillStyle = "#ffd84d";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("K", headX, headY - 16);
    }
    if (p.userControlled) {
      ctx.fillStyle = "#ffd84d";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 36);
      ctx.lineTo(p.x - 6, p.y - 28);
      ctx.lineTo(p.x + 6, p.y - 28);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawBall(ball) {
    const ctx = this.ctx;
    // Gölge — z'ye göre büyür/küçülür
    const sScale = 1 - Math.min(0.6, ball.z / 220);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + 6, 11 * sScale, 4 * sScale, 0, 0, Math.PI*2);
    ctx.fill();

    const bx = ball.x, by = ball.y - ball.z * 0.6;
    // Top
    const r = ball.r;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI*2); ctx.fill();
    // Pentagonlar
    ctx.fillStyle = "#1a1a1a";
    const spin = Math.atan2(ball.vy, ball.vx);
    for (let i = 0; i < 5; i++) {
      const a = spin + i * (Math.PI*2/5) + this.t*4;
      const px = bx + Math.cos(a)*5;
      const py = by + Math.sin(a)*5;
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI*2); ctx.fill();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI*2); ctx.stroke();
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawCrowd() {
    const ctx = this.ctx;
    // Üst ve alt tribün şeritleri
    const draw = (y, h) => {
      for (let x = 0; x < FIELD.W; x += 12) {
        const c = ((x*7 + y) % 6);
        const colors = ["#ff4d4d","#ffd84d","#4d8cff","#36c264","#a974ff","#ff8a3d"];
        ctx.fillStyle = colors[c];
        const yy = y + ((x*13)%6) * (h/8);
        ctx.fillRect(x, yy, 8, 6);
      }
    };
    draw(8, 36);
    draw(FIELD.H - 30, 36);
  }

  // PENALTI MODU GÖRÜNÜM (oyuncunun arkasından)
  // Bu farklı bir görünüm; koordinatlar farklı.
  beginPenaltyView() {
    this.beginFrame();
    const ctx = this.ctx;
    // Zemin (çim) — alttan üste perspektif
    const horizon = FIELD.H * 0.34;
    const grad = ctx.createLinearGradient(0, horizon, 0, FIELD.H);
    grad.addColorStop(0, "#0d6c2c");
    grad.addColorStop(1, "#15a447");
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon, FIELD.W, FIELD.H - horizon);
    // Gökyüzü
    const sky = ctx.createLinearGradient(0,0,0,horizon);
    sky.addColorStop(0,"#7ec8ff");
    sky.addColorStop(1,"#cfe9ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, FIELD.W, horizon);
    // Tribün uzaktan (kalecinin arkasında)
    ctx.fillStyle = "#444";
    ctx.fillRect(0, FIELD.H*0.28, FIELD.W, 48);
    // Tribün noktaları
    for (let x = 0; x < FIELD.W; x += 6) {
      const r = ((x*17)%5);
      const colors=["#ff4d4d","#ffd84d","#4d8cff","#36c264","#a974ff"];
      ctx.fillStyle = colors[r];
      ctx.fillRect(x, FIELD.H*0.29 + (r%3)*6, 4, 4);
    }
    // Çim çizgileri (perspektif)
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    // 6 yard çizgisi
    ctx.beginPath();
    ctx.moveTo(FIELD.W*0.18, FIELD.H*0.62);
    ctx.lineTo(FIELD.W*0.82, FIELD.H*0.62);
    ctx.stroke();
    // Penaltı noktası
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(FIELD.W * 0.5, FIELD.H * 0.82, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kale — uzaktan perspektifli
  drawPenaltyGoal(netImpulse, ballSx, ballSy, t, rect = null) {
    const ctx = this.ctx;
    const goal = rect || {
      left: FIELD.W * 0.30, right: FIELD.W * 0.70,
      top: FIELD.H * 0.24, bottom: FIELD.H * 0.56,
    };
    const cx = (goal.left + goal.right) / 2;
    const top = goal.top;
    const h = goal.bottom - goal.top;
    const w = goal.right - goal.left;
    // Direkler
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - w/2 - 6, top, 8, h);
    ctx.fillRect(cx + w/2 - 2, top, 8, h);
    ctx.fillRect(cx - w/2 - 6, top - 8, w + 14, 8);

    // Ağ (sallanır)
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1;
    const colsN = 14, rowsN = 7;
    for (let i = 0; i <= colsN; i++) {
      const u = i/colsN;
      const x = cx - w/2 + w*u;
      ctx.beginPath();
      for (let j = 0; j <= rowsN; j++) {
        const v = j/rowsN;
        const y = top + h*v;
        let dx=0, dy=0;
        if (netImpulse > 0) {
          const dist = Math.hypot(x - ballSx, y - ballSy);
          const wv = Math.max(0,1-dist/200) * netImpulse;
          dx = Math.sin(t*22 + j*0.6 + i*0.4)*5*wv;
          dy = Math.sin(t*18 + i*0.4)*4*wv;
        }
        if (j===0) ctx.moveTo(x+dx, y+dy);
        else ctx.lineTo(x+dx, y+dy);
      }
      ctx.stroke();
    }
    for (let j = 0; j <= rowsN; j++) {
      const v = j/rowsN;
      const y = top + h*v;
      ctx.beginPath();
      for (let i = 0; i <= colsN; i++) {
        const u = i/colsN;
        const x = cx - w/2 + w*u;
        let dx=0, dy=0;
        if (netImpulse > 0) {
          const dist = Math.hypot(x - ballSx, y - ballSy);
          const wv = Math.max(0,1-dist/200) * netImpulse;
          dx = Math.sin(t*22 + j*0.6 + i*0.4)*5*wv;
          dy = Math.sin(t*18 + i*0.4)*4*wv;
        }
        if (i===0) ctx.moveTo(x+dx, y+dy);
        else ctx.lineTo(x+dx, y+dy);
      }
      ctx.stroke();
    }
  }

  // Penaltı modu için karakter — perspektifli ölçek alır
  drawPenaltyCharacter(p, scale = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    // gölge
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 26, 20, 6, 0, 0, Math.PI*2); ctx.fill();
    // bacaklar
    ctx.fillStyle = "#222";
    ctx.fillRect(-8, 6, 6, 22);
    ctx.fillRect(2, 6, 6, 22);
    // gövde
    ctx.fillStyle = p.team.primary;
    ctx.beginPath();
    ctx.ellipse(0, -2, 18, 18, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = p.team.secondary;
    ctx.fillRect(-4, -4, 8, 8);
    // baş
    ctx.fillStyle = "#fcd9b6";
    ctx.beginPath(); ctx.arc(0, -22, 14, 0, Math.PI*2); ctx.fill();
    // saç
    ctx.fillStyle = p.hairColor || "#3a2615";
    ctx.beginPath(); ctx.arc(0, -26, 13, Math.PI, Math.PI*2); ctx.fill();
    // gözler / yüz (kameraya bakıyorsa) ya da arkadan
    if (p.facingCamera) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-5, -22, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, -22, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath(); ctx.arc(-5, -22, 1.4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, -22, 1.4, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#7a3a26"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, -18, 3.2, 0.1, Math.PI - 0.1); ctx.stroke();
    } else {
      // arkadan: küçük ense saçı
      ctx.fillStyle = p.team.primary;
      ctx.fillRect(-12, -22, 24, 3);
    }
    // forma numarası
    if (!p.facingCamera) {
      ctx.fillStyle = p.team.secondary;
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(p.number || "9", 0, 2);
    }
    ctx.restore();
  }
}
