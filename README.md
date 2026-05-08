# ⚽ Sevimli Futbol — Mobil Mini Futbol Oyunu

Tarayıcıda çalışan, sevimli karakterli, gerçekçi top fizikli, online (1v1) ve yapay zekâ
destekli mobil futbol oyunu. Hiçbir kurulum gerektirmez — `index.html` dosyasını bir HTTP
sunucusu üzerinden açman yeterli.

## Özellikler
- **Yatay ekran (landscape)** mobil oyun — sol alt köşede dinamik **joystick**, sağ alt köşede
  **PAS / ORTA / ŞUT** butonları.
- **Sevimli karakterler** (büyük kafa + parlak gözler + utangaç yanaklar), takım renkleri,
  koşma/zıplama animasyonu, kontrol oku.
- **Gerçekçi top fiziği**: yer çekimi, sekme, sürtünme, oyuncu/direk çarpışması, gol olunca
  **kale ağı sallanması**, parçacıklar, konfeti.
- **Modlar**:
  - 🤖 **Maç · YZ’ye karşı** (90 sn hızlı maç)
  - 🌐 **Online 1v1 Maç** (oda kodu ile arkadaşına karşı)
  - 🥅 **Penaltı · YZ’ye karşı** (5 atış serisi, sıra ile **şutör/kaleci**)
  - 🎯 **Online Penaltı** (oda kodu ile arkadaşınla — biri kaleci, diğeri şutör)
- **Penaltı modu** kale önünden, oyuncunun arkasından çekilmiş perspektif görünümle oynanır.
- **Tüm sesler Web Audio API ile sentezlenir** (harici dosya yok): şut, pas, orta, sekme,
  direk, ağ fışırtısı, hakem düdüğü, **sürekli taraftar uğultusu**, gol fanfarı/tezahürat.
- **Gelişmiş yapay zekâ**: alan oyuncusu (saldırı/savunma rolü), kaleci (yatay/dikey kayma,
  kurtarış için atılma), penaltı modunda kaleci tahmini ve şutör karar verme.
- **Maç sonu/duraklatma**: HUD’da skor + süre, ⏸ duraklatma ve ⏹ maçı bitirme.
- **PWA manifest** + landscape kilitleme + tam ekran isteği. Telefon dik tutulursa
  döndürme uyarısı gösterir.

## Kontroller
- **Joystick (sol yarı)** — koşma yönü
- **Sağ butonlar** — `PAS` (mavi), `ORTA` (sarı), `ŞUT` (kırmızı, basılı tutarsan **güç şarjı**)
- **Klavye** (masaüstünde test için): WASD veya yön tuşları yön; `Z` pas, `X` orta, `Space` şut

## Çalıştırma
Saf statik dosya — herhangi bir HTTP sunucusu yeterli:

```bash
python3 -m http.server 8765
# http://localhost:8765/  adresinde aç (mobil tarayıcıda yatay tut).
```

> Not: Online modu için PeerJS bulut sunucusuna erişim gerekir (`unpkg.com/peerjs`).
> Tek oyunculu tüm modlar tamamen offline çalışır.

## Mimari
- `index.html`, `css/style.css`, `manifest.json`, `icon.svg`
- `js/audio.js` — Web Audio sentezleyicisi (taraftar, vuruş, ağ, düdük, fanfar)
- `js/input.js` — dinamik joystick + buton yönetimi + klavye desteği
- `js/physics.js` — top fiziği (sürtünme/sekme/yerçekimi), oyuncu çarpışması, gol algısı
- `js/render.js` — saha, çim, kale + ağ dalgalanması, sevimli karakter çizimi, parçacıklar
- `js/ai.js` — alan oyuncusu, kaleci, penaltı kalecisi/şutörü AI’ları
- `js/match.js` — maç sahnesi (AI/online host/client), HUD, kickoff
- `js/penalty.js` — penaltı sahnesi (perspektif kale, aim, sıra/skor mantığı)
- `js/network.js` — PeerJS oda kodu (1v1 host/join)
- `js/main.js` — menü, mod yönetimi, döngü

## Lisans
MIT
