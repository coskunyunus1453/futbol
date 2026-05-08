// Yapay zeka davranışları. Maç modunda alan oyuncu + kaleci, penaltı modunda
// kaleci ya da şutör için kullanılır.

import { FIELD } from "./physics.js";

// Maç modunda saha oyuncusu için davranış
// "side": "home" (sol kale, sağa atak) | "away" (sağ kale, sola atak)
export function fieldPlayerAI(p, ball, allies, opponents, dt, difficulty = 0.85) {
  const enemyGoalX = p.side === "home" ? FIELD.right - 24 : FIELD.left + 24;
  const ownGoalX   = p.side === "home" ? FIELD.left + 24 : FIELD.right - 24;

  let target = null;
  let action = null; // "shoot"|"pass"|"cross"|null

  const hasBall = ball.owner === p;
  const teamHasBall = ball.owner && ball.owner.side === p.side;
  const ballFree = !ball.owner;
  const distBall = Math.hypot(ball.x - p.x, ball.y - p.y);

  if (hasBall) {
    // Topu kale önüne taşı, fırsat olunca şut
    target = { x: enemyGoalX - (p.side==="home"? 50: -50), y: FIELD.cy + (Math.sin(performance.now()/600 + p.seed)*60) };
    const distGoal = Math.hypot(enemyGoalX - p.x, FIELD.cy - p.y);
    if (distGoal < 320 && Math.abs(p.y - FIELD.cy) < 200) {
      action = "shoot";
    } else if (Math.abs(p.y - FIELD.cy) > 220 && distGoal < 360) {
      action = "cross";
    }
  } else if (teamHasBall) {
    // Pas alma pozisyonu: kalenin önünde uygun bir nokta
    target = { x: enemyGoalX - (p.side==="home"? 100: -100), y: FIELD.cy + (p.seed % 2 === 0 ? -60 : 60) };
  } else {
    // Top serbestse veya rakipteyse — top kapmaya en yakın oyuncu git
    const closestAlly = allies.reduce((best, a) => {
      const d = Math.hypot(ball.x - a.x, ball.y - a.y);
      return (best == null || d < best.d) ? { p:a, d } : best;
    }, null);
    if (closestAlly && closestAlly.p === p) {
      target = { x: ball.x, y: ball.y };
    } else {
      // Pozisyon al — kendi yarısı ile rakip yarısı arası
      target = {
        x: (p.side === "home"? FIELD.cx - 80 : FIELD.cx + 80) + (Math.sin(performance.now()/700 + p.seed)*40),
        y: FIELD.cy + p.lane * 80,
      };
      // top kendi tarafına yakınsa savunmaya çekil
      if ((p.side === "home" && ball.x < FIELD.cx) || (p.side === "away" && ball.x > FIELD.cx)) {
        target.x = (ownGoalX + ball.x) / 2;
        target.y = ball.y * 0.7 + FIELD.cy * 0.3;
      }
    }
  }

  // Hedefe doğru hızlan
  const dx = target.x - p.x, dy = target.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const speedMul = 0.7 + 0.3 * difficulty;
  const desiredVx = (dx/d) * p.maxSpeed * speedMul;
  const desiredVy = (dy/d) * p.maxSpeed * speedMul;
  p.vx += (desiredVx - p.vx) * Math.min(1, dt * 6);
  p.vy += (desiredVy - p.vy) * Math.min(1, dt * 6);

  // Yön
  if (Math.hypot(p.vx, p.vy) > 8) p.facing = Math.atan2(p.vy, p.vx);

  // Aksiyon: şut/pas/orta
  return action;
}

// Kaleci AI — kale ağzında kalır, topa doğru yatay/düşey kayar.
export function goalkeeperAI(gk, ball, dt, difficulty = 0.85) {
  const isLeft = gk.side === "home";
  const goalX = isLeft ? FIELD.left + 28 : FIELD.right - 28;
  // y'yi topla aynı hat üzerine getir, ama kale ağzı içinde
  const targetY = Math.max(FIELD.goalTop + 16, Math.min(FIELD.goalBottom - 16, ball.y));
  let targetX = goalX;
  // Top kendi yarısındaysa biraz öne çık
  if ((isLeft && ball.x < FIELD.cx - 100) || (!isLeft && ball.x > FIELD.cx + 100)) {
    targetX = isLeft ? FIELD.left + 60 : FIELD.right - 60;
  }
  const dx = targetX - gk.x, dy = targetY - gk.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = gk.maxSpeed * (0.55 + 0.4 * difficulty);
  const desiredVx = (dx/d) * sp;
  const desiredVy = (dy/d) * sp;
  gk.vx += (desiredVx - gk.vx) * Math.min(1, dt * 8);
  gk.vy += (desiredVy - gk.vy) * Math.min(1, dt * 8);
  gk.facing = isLeft ? 0 : Math.PI;

  // Ağzına geliyorsa "kurtarış" — topa doğru atılma
  const ballHeadingToGoal =
    (isLeft && ball.vx < -100 && ball.x < FIELD.cx) ||
    (!isLeft && ball.vx > 100 && ball.x > FIELD.cx);
  if (ballHeadingToGoal && Math.abs(ball.x - goalX) < 220) {
    // tahmini varış noktası
    const t = (goalX - ball.x) / (ball.vx || 1);
    const py = ball.y + ball.vy * t;
    if (py > FIELD.goalTop - 10 && py < FIELD.goalBottom + 10) {
      const dxx = (goalX) - gk.x;
      const dyy = py - gk.y;
      const dd = Math.hypot(dxx, dyy) || 1;
      const dive = sp * 1.4;
      gk.vx = (dxx/dd) * dive;
      gk.vy = (dyy/dd) * dive;
    }
  }
}

// Penaltı modu — kaleci AI: tek atış için tahmin et, sıçra
export class PenaltyKeeperAI {
  constructor(difficulty = 0.7) {
    this.difficulty = difficulty;
    this.commit = null;     // {dir:-1|0|1}
    this.committedAt = 0;
  }
  reset() { this.commit = null; this.committedAt = 0; }
  // sceneTime: sahneden bu yana saniye, ballHasFired: top atıldı mı
  update(gk, ball, dt, sceneTime, ballHasFired, predictedDir) {
    const baseY = gk.baseY ?? FIELD.H * 0.52;
    if (!ballHasFired) {
      // Hafifçe ortalanan yer değiştirme
      const targetX = FIELD.W/2 + Math.sin(sceneTime*1.2)*30;
      gk.x += (targetX - gk.x) * Math.min(1, dt*4);
      gk.y += (baseY - gk.y) * Math.min(1, dt * 6);
      return;
    }
    // Atış sonrası — yöne göre atla
    if (!this.commit) {
      // Zorlukla orantılı doğruluk: 1.0=mükemmel, 0=tam rastgele
      const correct = Math.random() < (0.35 + this.difficulty*0.45);
      const dirs = [-1, 0, 1];
      const guess = correct ? predictedDir : dirs[(Math.random()*3)|0];
      this.commit = { dir: guess };
      this.committedAt = sceneTime;
    }
    // Yöne savrul
    const targetX = FIELD.W/2 + this.commit.dir * (FIELD.W*0.2);
    const targetY = baseY - (this.commit.dir === 0 ? 4 : 20);
    gk.x += (targetX - gk.x) * Math.min(1, dt * 6);
    gk.y += (targetY - gk.y) * Math.min(1, dt * 6);
    gk.diving = true;
    gk.diveAngle = this.commit.dir * 0.8;
  }
}

// Penaltı modu — şutör AI: rastgele bir yöne ve güçle vurur
export class PenaltyShooterAI {
  constructor(difficulty = 0.7) {
    this.difficulty = difficulty;
    this.fired = false;
    this.fireAt = 1.4 + Math.random()*0.8;
  }
  reset() { this.fired = false; this.fireAt = 1.2 + Math.random()*0.8; }
  update(scene, dt, sceneTime) {
    if (this.fired || sceneTime < this.fireAt) return null;
    this.fired = true;
    // Hedef: kalecinin uzağı (basit "iyi karar")
    const dirs = [-1, 0, 1];
    let dir = dirs[(Math.random()*3)|0];
    if (Math.random() < this.difficulty * 0.7) {
      // kalecinin uzağına vur
      const gk = scene.gk;
      if (gk && gk.x < FIELD.W/2 - 20) dir = 1;
      else if (gk && gk.x > FIELD.W/2 + 20) dir = -1;
    }
    const power = 0.6 + Math.random() * 0.4;
    return { dir, power };
  }
}
