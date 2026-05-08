// PeerJS üzerinden 1v1 oda kodu tabanlı online bağlantı.
// Kullanıcılar 6 haneli kod görür; arka planda "cutefb-XXXXXX" peer id kullanılır.

const PREFIX = "cutefb-";

function randCode(len = 6) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[(Math.random()*chars.length)|0];
  return s;
}

export class Network {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = null;       // "host" | "client"
    this.code = null;
    this.onMessage = null;
    this.onOpen = null;
    this.onClose = null;
    this.onError = null;
  }

  _ensurePeer() {
    if (typeof Peer === "undefined") {
      throw new Error("Online modu için PeerJS yüklenmedi (CDN ulaşılamıyor olabilir).");
    }
  }

  async host() {
    this._ensurePeer();
    this.role = "host";
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt = 0) => {
        const code = randCode();
        const id = PREFIX + code;
        const peer = new Peer(id, { debug: 1 });
        let resolved = false;
        peer.on("open", () => {
          this.peer = peer;
          this.code = code;
          peer.on("connection", (conn) => {
            this.conn = conn;
            this._wireConn(conn);
          });
          peer.on("disconnected", () => { try { peer.reconnect(); } catch(_){} });
          peer.on("error", (e) => {
            if (this.onError) this.onError(e);
          });
          resolved = true;
          resolve(code);
        });
        peer.on("error", (err) => {
          if (resolved) return;
          if ((err.type === "unavailable-id" || /unavailable/i.test(String(err))) && attempt < 6) {
            try { peer.destroy(); } catch(_){}
            tryOpen(attempt + 1);
          } else {
            reject(err);
          }
        });
      };
      tryOpen(0);
    });
  }

  async join(code) {
    this._ensurePeer();
    this.role = "client";
    code = (code || "").toUpperCase().trim();
    if (!code) throw new Error("Oda kodu girin.");
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 1 });
      peer.on("open", () => {
        this.peer = peer;
        const conn = peer.connect(PREFIX + code, { reliable: false, serialization:"json" });
        this.conn = conn;
        let opened = false;
        conn.on("open", () => {
          opened = true;
          this._wireConn(conn);
          resolve(true);
        });
        conn.on("error", (e) => { if (!opened) reject(e); });
        // 8s timeout
        setTimeout(() => { if (!opened) reject(new Error("Bağlanılamadı (kod yanlış olabilir).")); }, 8000);
      });
      peer.on("error", (e) => reject(e));
    });
  }

  _wireConn(conn) {
    conn.on("open", () => { if (this.onOpen) this.onOpen(); });
    conn.on("data", (data) => { if (this.onMessage) this.onMessage(data); });
    conn.on("close", () => { if (this.onClose) this.onClose(); });
    conn.on("error", (e) => { if (this.onError) this.onError(e); });
  }

  send(msg) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(msg); } catch(_) {}
    }
  }

  close() {
    try { this.conn && this.conn.close(); } catch(_){}
    try { this.peer && this.peer.destroy(); } catch(_){}
    this.conn = null; this.peer = null;
  }
}
