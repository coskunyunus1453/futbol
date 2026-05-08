// Joystick ve aksiyon butonları için dokunma + klavye girişi.
// Sol yarıda joystick, sağ yarıda PAS/ORTA/ŞUT.

export class InputManager {
  constructor() {
    this.dir = { x: 0, y: 0 };  // -1..1
    this.actions = { pass: false, cross: false, shoot: false };
    this._just = { pass: false, cross: false, shoot: false };
    this._pointers = new Map();  // id -> {kind:"stick"|"btn", ...}
    this._keys = new Set();

    this.shootCharge = 0; // basılı tutma süresi (gücü artırır)
    this._shootStart = 0;
  }

  attach() {
    const stickEl = document.getElementById("joystick");
    const knob = document.getElementById("stick-knob");
    const stickBase = stickEl.querySelector(".stick-base");

    const max = 50;
    const setKnob = (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      const k = dist > max ? max / dist : 1;
      const x = dx * k, y = dy * k;
      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      this.dir.x = x / max;
      this.dir.y = y / max;
    };
    const resetKnob = () => {
      knob.style.transform = "translate(-50%,-50%)";
      this.dir.x = 0; this.dir.y = 0;
    };

    // Dinamik joystick: sol yarıda basılan yere taşı
    const moveBaseTo = (clientX, clientY) => {
      const er = stickEl.getBoundingClientRect();
      const lx = clientX - er.left;
      const ly = clientY - er.top;
      stickBase.style.position = "absolute";
      stickBase.style.left = (lx - 65) + "px";
      stickBase.style.top  = (ly - 65) + "px";
    };

    const onStickStart = (id, clientX, clientY) => {
      moveBaseTo(clientX, clientY);
      const r = stickBase.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      this._pointers.set(id, { kind:"stick", cx, cy });
      setKnob(0, 0);
    };
    const onStickMove = (id, x, y) => {
      const p = this._pointers.get(id);
      if (!p || p.kind !== "stick") return;
      setKnob(x - p.cx, y - p.cy);
    };
    const onStickEnd = (id) => {
      const p = this._pointers.get(id);
      if (p && p.kind === "stick") {
        this._pointers.delete(id);
        resetKnob();
        // Tabanı default konuma geri bırak (CSS flex)
        stickBase.style.position = "";
        stickBase.style.left = "";
        stickBase.style.top  = "";
      }
    };

    stickEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      stickEl.setPointerCapture(e.pointerId);
      onStickStart(e.pointerId, e.clientX, e.clientY);
    }, { passive:false });
    stickEl.addEventListener("pointermove", (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      onStickMove(e.pointerId, e.clientX, e.clientY);
    });
    const endStick = (e) => onStickEnd(e.pointerId);
    stickEl.addEventListener("pointerup", endStick);
    stickEl.addEventListener("pointercancel", endStick);
    stickEl.addEventListener("pointerleave", endStick);

    // Action buttons
    const bind = (id, key) => {
      const el = document.getElementById(id);
      const press = (e) => {
        e.preventDefault();
        this.actions[key] = true;
        this._just[key] = true;
        if (key === "shoot") this._shootStart = performance.now();
      };
      const release = (e) => {
        e.preventDefault();
        if (key === "shoot") {
          this.shootCharge = Math.min(1, (performance.now() - this._shootStart) / 600);
        }
        this.actions[key] = false;
      };
      el.addEventListener("pointerdown", press, { passive:false });
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("pointerleave", release);
    };
    bind("btn-pass", "pass");
    bind("btn-cross", "cross");
    bind("btn-shoot", "shoot");

    // Klavye desteği (masaüstünde test)
    window.addEventListener("keydown", (e) => {
      this._keys.add(e.key.toLowerCase());
      if (e.key === " ") { this.actions.shoot = true; this._just.shoot = true; this._shootStart = performance.now(); }
      if (e.key.toLowerCase() === "z") { this.actions.pass = true; this._just.pass = true; }
      if (e.key.toLowerCase() === "x") { this.actions.cross = true; this._just.cross = true; }
    });
    window.addEventListener("keyup", (e) => {
      this._keys.delete(e.key.toLowerCase());
      if (e.key === " ") {
        this.shootCharge = Math.min(1, (performance.now() - this._shootStart) / 600);
        this.actions.shoot = false;
      }
      if (e.key.toLowerCase() === "z") this.actions.pass = false;
      if (e.key.toLowerCase() === "x") this.actions.cross = false;
    });
  }

  // Klavye yön tuşlarını da yön vektörüne karıştır
  keyboardDir() {
    let kx = 0, ky = 0;
    if (this._keys.has("arrowleft") || this._keys.has("a")) kx -= 1;
    if (this._keys.has("arrowright") || this._keys.has("d")) kx += 1;
    if (this._keys.has("arrowup") || this._keys.has("w")) ky -= 1;
    if (this._keys.has("arrowdown") || this._keys.has("s")) ky += 1;
    return { x: kx, y: ky };
  }

  getDir() {
    const k = this.keyboardDir();
    let x = this.dir.x + k.x;
    let y = this.dir.y + k.y;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  consumeJust(name) {
    const v = this._just[name];
    this._just[name] = false;
    return v;
  }

  // Kuvvet (0..1)
  consumeShootCharge() {
    const v = Math.max(0.35, this.shootCharge || 0.35);
    this.shootCharge = 0;
    return v;
  }
}
