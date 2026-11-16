/*
 * TankoBlocs — apparence du tank (dessin vectoriel, canvas 2D).
 *
 * Fichier autonome : aucune modification du jeu n'est nécessaire.
 * Il suffit de le charger APRÈS renderer.js, par exemple dans index.html :
 *     <script src="js/renderer.js"></script>
 *     <script src="js/tank_fabien.js"></script>
 * Il remplace alors la méthode de dessin du tank (ArenaRenderer._drawTank).
 * Pour revenir à l'ancien look, retirer simplement cette ligne.
 *
 * Il ne dessine QUE le tank, dans un repère local où
 *   - le centre du tank est en (0, 0),
 *   - l'avant pointe vers +x, la gauche du tank est en -y (écran).
 * Le renderer s'occupe de translater/pivoter le contexte avant l'appel.
 *
 *   drawHull(ctx, { color, dead, roll })     -> châssis + chenilles
 *   drawTurret(ctx, { color, dead, recoil }) -> tourelle + canon
 *
 * Pour changer le look du tank, il suffit de modifier ce fichier.
 */
(function (root) {
  'use strict';

  /* ---------- petits utilitaires de couleur ---------- */

  function parse(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0x888888;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** amount > 0 éclaircit, < 0 assombrit (de -1 à 1). */
  function shade(hex, amount) {
    const f = (c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
    const [r, g, b] = parse(hex).map(f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function polygon(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Dégradé « du haut vers le bas » du tank (reflet côté -y, ombre côté +y). */
  function body(ctx, y0, y1, light, dark) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    return g;
  }

  /* ---------- châssis + chenilles ---------- */

  function track(ctx, y, dead, roll) {
    // y = bord haut de la chenille (hauteur 9)
    const H = 9;
    ctx.fillStyle = dead ? '#1b1e20' : '#22282c';
    rrect(ctx, -19, y, 38, H, 4);
    ctx.fill();
    // maillons qui défilent avec la distance parcourue
    ctx.strokeStyle = dead ? '#2a2e30' : '#434d54';
    ctx.lineWidth = 1.3;
    const off = roll % 4;
    ctx.beginPath();
    for (let x = -17 + off; x < 18; x += 4) {
      ctx.moveTo(x, y + 0.8);
      ctx.lineTo(x, y + H - 0.8);
    }
    ctx.stroke();
    // galets
    ctx.fillStyle = dead ? '#33383b' : '#59656c';
    for (let x = -13; x <= 13; x += 6.5) {
      ctx.beginPath();
      ctx.arc(x, y + H / 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = dead ? '#222628' : '#2a3135';
    for (let x = -13; x <= 13; x += 6.5) {
      ctx.beginPath();
      ctx.arc(x, y + H / 2, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHull(ctx, o) {
    const dead = !!o.dead;
    const color = o.color;
    const roll = o.roll || 0;

    // ombre portée
    ctx.fillStyle = 'rgba(0,0,0,0.33)';
    rrect(ctx, -17, -14, 38, 33, 7);
    ctx.fill();

    track(ctx, -18, dead, roll);
    track(ctx, 9, dead, roll);

    // coque : avant en biseau, arrière droit
    const light = dead ? '#555b5f' : shade(color, 0.18);
    const dark = dead ? '#32373a' : shade(color, -0.22);
    const edge = dead ? '#1c1f21' : shade(color, -0.55);
    polygon(ctx, [[-16, -10], [10, -10], [17, -5], [17, 5], [10, 10], [-16, 10]]);
    ctx.fillStyle = body(ctx, -10, 10, light, dark);
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineJoin = 'miter';

    // glacis (plaque avant inclinée)
    polygon(ctx, [[10, -10], [17, -5], [17, 5], [10, 10]]);
    ctx.fillStyle = dead ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.16)';
    ctx.fill();
    ctx.strokeStyle = dead ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, -10);
    ctx.lineTo(10, 10);
    ctx.stroke();

    // grille du moteur à l'arrière
    ctx.strokeStyle = dead ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = -6; y <= 6; y += 3) {
      ctx.moveTo(-14.5, y);
      ctx.lineTo(-9.5, y);
    }
    ctx.stroke();

    // reflet le long du bord supérieur
    ctx.fillStyle = dead ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.16)';
    rrect(ctx, -14, -8.6, 22, 2.4, 1.2);
    ctx.fill();
  }

  /* ---------- tourelle + canon ---------- */

  function drawTurret(ctx, o) {
    const dead = !!o.dead;
    const color = o.color;
    const recoil = o.recoil || 0;
    const metal = dead ? '#2d3234' : '#3a444b';
    const metalDark = dead ? '#1f2326' : '#232b30';

    // canon (avec recul)
    ctx.save();
    ctx.translate(-recoil, 0);
    ctx.fillStyle = body(ctx, -2.4, 2.4, dead ? '#3a3f42' : '#56626a', metalDark);
    rrect(ctx, 6, -2.4, 19, 4.8, 1.2);
    ctx.fill();
    ctx.strokeStyle = metalDark;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // frein de bouche
    ctx.fillStyle = metal;
    rrect(ctx, 22, -3.5, 6, 7, 1.6);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = dead ? '#15181a' : '#10151a';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(24.2, -3.2); ctx.lineTo(24.2, 3.2);
    ctx.moveTo(26.2, -3.2); ctx.lineTo(26.2, 3.2);
    ctx.stroke();
    ctx.restore();

    // masque du canon
    ctx.fillStyle = metal;
    rrect(ctx, 6, -4.6, 5, 9.2, 2);
    ctx.fill();

    // tourelle : octogone allongé
    const light = dead ? '#5d6367' : shade(color, 0.32);
    const dark = dead ? '#383d40' : shade(color, -0.12);
    polygon(ctx, [[-10, -4.5], [-6, -8.5], [3, -8.5], [8, -5], [8, 5], [3, 8.5], [-6, 8.5], [-10, 4.5]]);
    ctx.fillStyle = body(ctx, -8.5, 8.5, light, dark);
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = dead ? '#1c1f21' : shade(color, -0.55);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineJoin = 'miter';

    // reflet
    ctx.fillStyle = dead ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.2)';
    rrect(ctx, -6, -7, 10, 2, 1);
    ctx.fill();

    // trappe du chef de char
    ctx.beginPath();
    ctx.arc(-3.5, -2.8, 2.7, 0, Math.PI * 2);
    ctx.fillStyle = dead ? '#2a2e30' : shade(color, -0.35);
    ctx.fill();
    ctx.strokeStyle = dead ? '#1c1f21' : shade(color, -0.6);
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // trappe du tireur
    ctx.beginPath();
    ctx.arc(-4, 3.6, 1.9, 0, Math.PI * 2);
    ctx.fillStyle = dead ? '#2a2e30' : shade(color, -0.25);
    ctx.fill();
    ctx.stroke();
  }

  /* ---------- branchement sur le renderer du jeu ---------- */

  const DEG = Math.PI / 180;

  function drawTank(ctx, v) {
    const C = root.TankEngine.C;
    const t = v.t;
    const dead = !t.alive;
    const st = this.trackState.get(t.index);
    const X = this.X(v.x);
    const Y = this.Y(v.y);

    // châssis
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(-v.h * DEG);
    drawHull(ctx, { color: t.color, dead, roll: st ? st.roll : 0 });
    ctx.restore();

    // tourelle + canon (recul juste après un tir)
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(-v.g * DEG);
    const recoil = !dead && t.cooldown > C.COOLDOWN - 8 ? (t.cooldown - (C.COOLDOWN - 8)) * 0.5 : 0;
    drawTurret(ctx, { color: t.color, dead, recoil });
    ctx.restore();

    // antenne radar
    if (!dead) {
      ctx.save();
      ctx.translate(X, Y);
      ctx.rotate(-v.r * DEG);
      ctx.strokeStyle = t.radarOn ? '#eef6f7' : '#7d8a8f';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(1.5, 0, 4.5, -1.1, 1.1);
      ctx.stroke();
      ctx.restore();
    }

    // témoin de panne
    if (t.broken && t.alive && Math.floor(performance.now() / 400) % 2 === 0) {
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('⚠', X, Y + 6);
    }
  }

  if (root.ArenaRenderer) root.ArenaRenderer.prototype._drawTank = drawTank;
  root.TankFabien = { drawHull, drawTurret, shade };
})(typeof window !== 'undefined' ? window : globalThis);
