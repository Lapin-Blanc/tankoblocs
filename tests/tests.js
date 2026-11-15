/* TankoBlocs — tests du moteur, du runtime et des blocs (dans le navigateur). */
(function () {
  'use strict';
  const E = window.TankEngine;
  const RT = window.TankRuntime;
  const C = E.C;
  const CMD = E.CMD;
  const results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n') : String(e) });
    }
  }
  function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion échouée'); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'égalité') + ' : attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a)); }
  function near(a, b, eps, msg) { if (Math.abs(a - b) > (eps || 1e-6)) throw new Error((msg || 'proche') + ' : attendu ' + b + ', obtenu ' + a); }

  /** Partie de test : programmes écrits avec l'API « tank. » (comme le code généré). */
  function match(codes, opts) {
    opts = opts || {};
    const entrants = codes.map((code, i) => RT.makeEntrant({ name: 'T' + (i + 1), color: '#ff0000', code }, i, opts.seed || 1));
    const m = new E.Match({ entrants, seed: opts.seed || 1, maxTicks: opts.maxTicks || 3600 });
    if (opts.place) {
      opts.place.forEach((p, i) => {
        const t = m.tanks[i];
        t.x = t.px = p[0];
        t.y = t.py = p[1];
        t.heading = t.gun = t.radar = t.ph = t.pg = t.pr = p[2] || 0;
      });
    }
    return m;
  }
  const idle = "tank.quand('ordres', 'tout', function () { tank.attendre(10); });";
  function run(m, n) { for (let i = 0; i < n && !m.finished; i++) m.step(); }

  /* ---------- Règles de base ---------- */

  test('verrouillages : le canon suit le tank, le radar suit le canon', () => {
    let r = E.rotationEffect(CMD.ROTATE_TANK_CCW, true, true);
    eq(r.a, 1); eq(r.g, 1); eq(r.r, 1);
    r = E.rotationEffect(CMD.ROTATE_TANK_CCW, false, true);
    eq(r.g, 0, 'canon déverrouillé'); eq(r.r, 0, 'radar ne suit pas le tank si le canon est déverrouillé');
    r = E.rotationEffect(CMD.ROTATE_GUN_CW, true, true);
    eq(r.a, 0); eq(r.g, -1); eq(r.r, -1);
    r = E.rotationEffect(CMD.ROTATE_GUN_CW | CMD.UNLOCK_RADAR, true, true);
    eq(r.r, 0, 'déverrouillage appliqué avant la rotation');
    r = E.rotationEffect(CMD.ROTATE_TANK_CW | CMD.ROTATE_GUN_CW, true, true);
    eq(r.g, -2, 'les rotations s\'additionnent');
  });

  test('recharge : formule fermée identique à la simulation pas à pas', () => {
    for (const cd0 of [0, 1, 5, 59]) {
      for (const mask of [CMD.NONE, CMD.FIRE]) {
        for (const n of [1, 2, 30, 59, 60, 61, 119, 120, 121, 500]) {
          let cd = cd0;
          for (let i = 0; i < n; i++) {
            if ((mask & CMD.FIRE) && cd === 0) cd = C.COOLDOWN;
            if (cd > 0) cd--;
          }
          eq(E.cooldownAfter(cd0, mask, n), cd, 'cd0=' + cd0 + ' mask=' + mask + ' n=' + n);
        }
      }
    }
  });

  test('angles : normalisation', () => {
    eq(E.norm360(-90), 270);
    eq(E.norm360(720), 0);
    eq(E.norm180(270), -90);
    eq(E.norm180(180), 180);
    near(E.angleTo(0, 0, 0, 10), 90);
    near(E.angleTo(0, 0, -10, 0), 180);
  });

  test('déplacement : 60 ticks = 100 pixels', () => {
    const m = match(["tank.quand('ordres', 'tout', function () { tank.avancer(60); tank.attendre(1000); });"], { place: [[-200, 0, 0]] });
    run(m, 60);
    near(m.tanks[0].x, -100, 1e-6);
    near(m.tanks[0].y, 0, 1e-6);
  });

  test('rotation : 100 ticks = 90 degrés, canon et radar suivent', () => {
    const m = match(["tank.quand('ordres', 'tout', function () { tank.tourner('tank', 1, 100); tank.attendre(1000); });"], { place: [[0, 0, 0]] });
    run(m, 100);
    near(m.tanks[0].heading, 90, 1e-6);
    near(m.tanks[0].gun, 90, 1e-6);
    near(m.tanks[0].radar, 90, 1e-6);
  });

  test('tir : position de l\'obus, recharge de 60 ticks', () => {
    const m = match(["tank.quand('ordres', 'tout', function () { tank.combiner(120, { tirer: true }); });"], { place: [[-300, 0, 0]] });
    run(m, 1);
    eq(m.bullets.length, 1);
    near(m.bullets[0].x, -300 + C.TANK_RADIUS + 2 * C.BULLET_RADIUS, 1e-6, 'apparition à 29 px');
    run(m, 119);
    eq(m.tanks[0].shots, 2, '2 tirs en 120 ticks');
  });

  test('mur : 10 dégâts une seule fois en restant contre le mur', () => {
    const m = match(["tank.quand('ordres', 'tout', function () { tank.avancer(500); });"], { place: [[400, 0, 0]] });
    run(m, 300);
    eq(m.tanks[0].health, 90);
    near(m.tanks[0].x, C.WIDTH / 2 - C.TANK_RADIUS, 1e-6, 'bloqué par le mur');
  });

  test('choc entre tanks : -10 pour chacun, événement « touché par un tank »', () => {
    const m = match([
      "var n = 0; tank.quand('ordres', 'tout', function () { tank.avancer(500); }); tank.quand('touche', 'tank', function () { n++; tank.afficher('choc ' + n); });",
      idle,
    ], { place: [[-100, 0, 0], [100, 0, 180]] });
    run(m, 200);
    eq(m.tanks[0].health, 90);
    eq(m.tanks[1].health, 90);
    assert(m.logs.some((l) => l.text === 'choc 1'), 'événement reçu');
    assert(!m.logs.some((l) => l.text === 'choc 2'), 'pas de second choc pendant le contact');
  });

  test('obus : dégâts, crédit au tireur, événements des deux côtés', () => {
    const m = match([
      "tank.quand('ordres', 'tout', function () { tank.tirer(false); tank.attendre(1000); }); tank.quand('impact', 'tank', function () { tank.afficher('touché ' + tank.objet('nom')); });",
      "tank.quand('ordres', 'tout', function () { tank.attendre(1000); }); tank.quand('touche', 'obus', function () { tank.afficher('aïe ' + tank.objet('nom')); });",
    ], { place: [[-200, 0, 0], [100, 0, 90]] });
    run(m, 200);
    eq(m.tanks[1].health, 90);
    eq(m.tanks[0].damageDealt, 10);
    eq(m.tanks[0].hits, 1);
    assert(m.logs.some((l) => l.text === 'touché T2'), 'impact reçu par le tireur');
    assert(m.logs.some((l) => l.text === 'aïe T1'), 'touché reçu par la cible (nom du tireur)');
  });

  test('radar : détection à l\'entrée du faisceau, une seule fois', () => {
    const m = match([
      "var n = 0; tank.quand('ordres', 'tout', function () { tank.tourner('radar', 1, 1); }); tank.quand('radar', 'tank', function () { n++; tank.afficher('vu ' + n + ' ' + Math.round(tank.objet('angle'))); tank.annulerOrdres(); tank.attendre(100); });",
      idle,
    ], { place: [[0, 0, 0], [0, 300, 0]] });
    run(m, 200);
    const seen = m.logs.filter((l) => l.text.startsWith('vu '));
    eq(seen.length, 1, 'une détection');
    assert(/^vu 1 (8[6-9]|9[0-4])$/.test(seen[0].text), 'angle ≈ 90 (' + seen[0].text + ')');
  });

  test('radar : pas de détection de ses propres obus ni des épaves', () => {
    const m = match([
      "tank.quand('ordres', 'tout', function () { tank.tirer(false); tank.attendre(100); }); tank.quand('radar', 'obus', function () { tank.afficher('obus vu'); });",
    ], { place: [[0, 0, 0]] });
    run(m, 100);
    assert(!m.logs.some((l) => l.text === 'obus vu'));
  });

  test('événements : ordres placés en tête de file, annulation', () => {
    const m = match([
      "tank.quand('ordres', 'tout', function () { tank.avancer(50); }); tank.quand('touche', 'tout', function () { tank.afficher('file ' + tank.capteur('ordres')); tank.annulerOrdres(); tank.reculer(7); tank.afficher('file ' + tank.capteur('ordres')); });",
    ], { place: [[480, 0, 0]] });
    run(m, 30);
    assert(m.logs.some((l) => l.text === 'file 7'), 'file = 7 après annulation');
  });

  test('orienter : tient compte des rotations déjà prévues', () => {
    const m = match(["tank.quand('ordres', 'tout', function () { tank.orienter('canon', 90); tank.orienter('canon', 180); tank.attendre(1000); });"], { place: [[0, 0, 0]] });
    run(m, 200);
    near(m.tanks[0].gun, 180, 1e-6);
  });

  test('tirer dès que prêt : attend la fin de la recharge', () => {
    const m = match(["tank.quand('ordres', 'tout', function () { tank.tirer(true); tank.tirer(true); tank.attendre(1000); });"], { place: [[-400, 0, 0]] });
    run(m, 70);
    eq(m.tanks[0].shots, 2);
  });

  test('erreur dans le programme : tank en panne, partie continue', () => {
    const m = match(["tank.quand('ordres', 'tout', function () { var x = null; x.y = 1; });", idle]);
    run(m, 10);
    assert(m.tanks[0].broken, 'en panne');
    assert(/dans « quand je n'ai plus d'ordres »/.test(m.tanks[0].error), m.tanks[0].error);
    assert(!m.tanks[1].broken);
  });

  test('boucle infinie : interrompue proprement', () => {
    const m = match(["tank.quand('ordres', 'tout', function () { while (true) { tank.boucle(); } });"]);
    run(m, 2);
    assert(m.tanks[0].broken);
    assert(/boucle infinie/.test(m.tanks[0].error), m.tanks[0].error);
  });

  test('autodestruction et fin anticipée', () => {
    const m = match(["tank.quand('ordres', 'tout', function () { tank.autodestruction(); });", idle]);
    run(m, 5);
    assert(m.finished, 'partie terminée');
    assert(m.results.early);
    eq(m.tanks[0].alive, false);
  });

  test('hasard reproductible : même graine, même partie', () => {
    const code = "tank.quand('ordres', 'tout', function () { tank.combiner(Math.floor(Math.random() * 40) + 1, { deplacement: 1, tank: Math.random() < 0.5 ? 1 : -1, tirer: true }); });";
    const a = match([code, code, code], { seed: 42 });
    const b = match([code, code, code], { seed: 42 });
    run(a, 1500); run(b, 1500);
    for (let i = 0; i < 3; i++) {
      eq(a.tanks[i].x, b.tanks[i].x, 'x');
      eq(a.tanks[i].health, b.tanks[i].health, 'santé');
    }
    const c = match([code, code, code], { seed: 43 });
    assert(c.tanks[0].x !== a.tanks[0].x || c.tanks[0].y !== a.tanks[0].y, 'autre graine, autres positions');
  });

  test('classement : dégâts, puis santé, puis survie', () => {
    const t = (d, h, death) => ({ damageDealt: d, health: h, deathTick: death });
    assert(E.compareTanks(t(20, 0, 10), t(10, 100, null)) < 0, 'dégâts d\'abord');
    assert(E.compareTanks(t(10, 50, null), t(10, 30, null)) < 0, 'puis santé');
    assert(E.compareTanks(t(10, 0, 500), t(10, 0, 100)) < 0, 'puis survie');
    eq(E.compareTanks(t(10, 0, 100), t(10, 0, 100)), 0);
  });

  test('variables propres à chaque tank', () => {
    const code = "var n = 0; tank.quand('ordres', 'tout', function () { n++; tank.attendre(1); if (n === 5) tank.afficher('cinq'); });";
    const m = match([code, code]);
    run(m, 5);
    eq(m.logs.filter((l) => l.text === 'cinq').length, 2);
  });

  /* ---------- Blocs Blockly ---------- */

  if (window.TankBlocks && window.TankBots) {
    const B = window.TankBlocks;
    const Bots = window.TankBots;

    test('blocs : le modèle de départ se compile', () => {
      const code = B.compileState(Bots.TEMPLATE, true);
      assert(code.includes("tank.quand('ordres'"), code);
      assert(code.includes('tank.orienterVers('), code);
    });

    for (const ex of Bots.EXAMPLES) {
      test('exemple « ' + ex.name + ' » : compile et joue 3600 ticks sans panne', () => {
        const code = B.compileState(ex.workspace, true);
        const d = B.describeState(ex.workspace);
        assert(d.hats.length > 0, 'au moins un événement');
        const others = Bots.EXAMPLES.filter((o) => o !== ex).slice(0, 2).map((o) => B.compileState(o.workspace, true));
        const entrants = [code].concat(others).map((c, i) => RT.makeEntrant({ name: 'E' + i, code: c }, i, 7));
        const m = new E.Match({ entrants, seed: 7, maxTicks: 3600 });
        run(m, 3600);
        for (const t of m.tanks) assert(!t.broken, t.name + ' en panne : ' + t.error);
      });
    }

    test('blocs : une boucle « répéter tant que vrai » est interrompue', () => {
      const state = Bots.program((h) => [h.onRun([{ type: 'controls_whileUntil', fields: { MODE: 'WHILE' }, inputs: { BOOL: { block: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } } }])]);
      const code = B.compileState(state, true);
      assert(code.includes('tank.boucle()'), code);
      const m = new E.Match({ entrants: [RT.makeEntrant({ name: 'X', code }, 0, 1)], seed: 1 });
      run(m, 2);
      assert(m.tanks[0].broken);
    });

    test('blocs : un bloc posé hors événement est ignoré', () => {
      const state = { blocks: { languageVersion: 0, blocks: [{ type: 'ct_self_destruct', x: 0, y: 0 }] } };
      eq(B.compileState(state, true).includes('autodestruction'), false);
    });

    test('blocs : l\'aperçu du code ne contient pas la protection de boucle', () => {
      const ex = Bots.EXAMPLES.find((x) => x.id === 'ex-chasseur');
      const code = B.compileState(ex.workspace, false);
      eq(code.includes('tank.boucle'), false);
    });
  }

  /* ---------- Missions du parcours ---------- */

  if (window.TankMissions && window.TankBlocks) {
    const M = window.TankMissions;
    const B = window.TankBlocks;
    const Bots = window.TankBots;
    const cache = {};
    const compileBot = (id) => (cache[id] = cache[id] || B.compileState(Bots.EXAMPLES.find((e) => e.id === id).workspace, true));

    const typesIn = (state) => {
      const out = [];
      const walk = (bl) => {
        if (!bl) return;
        out.push(bl.type);
        for (const k in bl.inputs || {}) walk(bl.inputs[k].block); // les ombres (shadow) ne comptent pas
        if (bl.next) walk(bl.next.block);
      };
      for (const bl of state.blocks.blocks) walk(bl);
      return out;
    };
    const VAR_TYPES = ['variables_set', 'variables_get', 'math_change'];

    for (const def of M.MISSIONS) {
      test('mission ' + def.id + ' « ' + def.title + ' » : la solution réussit', () => {
        const code = B.compileState(def.solution, true);
        const seeds = def.randomSeed ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1];
        const ok = seeds.filter((sd) => M.runHeadless(def, code, sd, compileBot).ok).length;
        const need = def.objective.win ? 0.6 : 0.9;
        assert(ok / seeds.length >= need, ok + ' réussite(s) sur ' + seeds.length);
      });
      if (def.starter) {
        test('mission ' + def.id + ' : le programme de départ ne suffit pas', () => {
          const r = M.runHeadless(def, B.compileState(def.starter, true), 1, compileBot);
          assert(!r.ok, 'le départ réussit déjà la mission');
          assert(r.reason, 'raison de l\'échec');
        });
      }
      test('mission ' + def.id + ' : les blocs de la solution sont dans la boîte à outils', () => {
        if (!def.toolbox) return;
        const allowed = new Set(def.toolbox);
        for (const t of typesIn(def.solution)) {
          const key = VAR_TYPES.includes(t) ? 'VARIABLE' : t;
          assert(allowed.has(key), 'bloc absent de la boîte à outils : ' + t);
        }
        if (def.maxBlocks) assert(typesIn(def.solution).length <= def.maxBlocks, 'trop de blocs dans la solution');
      });
    }
  }

  window.__testResults = results;
  const failed = results.filter((r) => !r.ok);
  const out = document.getElementById('out');
  if (out) {
    const h = document.createElement('h2');
    h.textContent = failed.length ? '❌ ' + failed.length + ' échec(s) sur ' + results.length : '✅ ' + results.length + ' tests réussis';
    out.appendChild(h);
    for (const r of results) {
      const li = document.createElement('li');
      li.className = r.ok ? 'ok' : 'ko';
      li.textContent = (r.ok ? '✔ ' : '✘ ') + r.name + (r.ok ? '' : '\n' + r.error);
      out.appendChild(li);
    }
  }
})();
