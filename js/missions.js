/*
 * TankoBlocs — parcours d'apprentissage (missions).
 *
 * Chaque mission introduit une notion, avec :
 *  - une boîte à outils réduite aux blocs utiles ;
 *  - un programme de départ, des indices et une solution (en blocs) ;
 *  - un scénario d'arène (positions imposées, cibles, zones à atteindre) ;
 *  - un objectif vérifié automatiquement à chaque tick.
 */
(function (root) {
  'use strict';

  const E = root.TankEngine;
  const RT = root.TankRuntime;
  const program = root.TankBots.program;

  // Petites « étiquettes » de blocs dans les textes
  const b = (cls, text) => '<span class="b b-' + cls + '">' + text + '</span>';
  const ev = (t) => b('event', t);
  const mv = (t) => b('move', t);
  const wp = (t) => b('weapon', t);
  const se = (t) => b('sensor', t);
  const ob = (t) => b('object', t);
  const lo = (t) => b('logic', t);
  const va = (t) => b('var', t);
  const to = (t) => b('tools', t);

  const MOVE_BASIC = ['ct_on_run', 'ct_move', 'ct_move_dist', 'ct_wait'];

  const MISSIONS = [
    {
      id: 'm01',
      title: 'Premiers pas',
      concept: 'Le programme principal',
      goal: 'Amène ton tank dans la zone verte.',
      intro:
        '<p>Ton tank obéit à un <strong>programme</strong>. Le bloc orange ' + ev('🔁 quand je n\'ai plus d\'ordres') +
        ' est son programme principal : chaque fois que ton tank n\'a plus rien à faire, il exécute les blocs placés dedans.</p>' +
        '<p>Glisse le bloc bleu ' + mv('avancer pendant 60 ticks') + ' à l\'intérieur, jusqu\'à ce qu\'il s\'emboîte. ' +
        'Un <em>tick</em> est un tout petit instant : il y en a 60 par seconde.</p>',
      hints: [
        'Ouvre la catégorie « Mouvement » à gauche, puis glisse « avancer pendant 60 ticks » dans le bloc orange.',
        'Pas besoin d\'être précis : quand ton tank a fini d\'avancer, le bloc 🔁 recommence, et le tank avance encore.',
      ],
      toolbox: MOVE_BASIC,
      starter: program((h) => [h.onRun([])]),
      solution: program((h) => [h.onRun([h.move(60)])]),
      maxTicks: 900,
      player: { x: -350, y: 0, heading: 0 },
      zones: [{ x: 150, y: 0, r: 45 }],
      objective: { zones: true, failOnWall: true },
    },
    {
      id: 'm02',
      title: 'Tourner',
      concept: 'Les angles',
      goal: 'Rejoins la zone verte, au-dessus de ton tank.',
      intro:
        '<p>Cette fois, la zone n\'est pas devant toi : il faut d\'abord tourner, puis avancer.</p>' +
        '<p>' + mv('tourner le tank vers la gauche ↺ de 90 °') + ' fait un quart de tour. ' +
        'Les blocs s\'exécutent dans l\'ordre, de haut en bas.</p>' +
        '<p>Pour les distances, ' + mv('avancer de 100 pixels') + ' est souvent plus pratique que les ticks.</p>',
      hints: [
        'Ton tank regarde vers la droite. Pour monter, il doit tourner vers la gauche ↺.',
        'Place « tourner le tank vers la gauche de 90 ° » puis, en dessous, « avancer de 350 pixels ».',
      ],
      toolbox: MOVE_BASIC.concat(['ct_turn', 'ct_turn_deg']),
      starter: program((h) => [h.onRun([])]),
      solution: program((h) => [h.onRun([h.turnDeg('tank', 1, 90), h.moveDist(350)])]),
      maxTicks: 900,
      player: { x: -300, y: -200, heading: 0 },
      zones: [{ x: -300, y: 150, r: 45 }],
      objective: { zones: true, failOnWall: true, wallMessage: '💥 Ton tank a percuté un mur ! As-tu tourné du bon côté ?' },
    },
    {
      id: 'm03',
      title: 'Enchaîner',
      concept: 'Les séquences',
      goal: 'Passe par les 3 balises.',
      intro:
        '<p>Un programme est une <strong>suite d\'instructions</strong> exécutées dans l\'ordre. ' +
        'Pour passer par les trois balises, il faut enchaîner déplacements et virages.</p>' +
        '<p>Les balises sont espacées de 300 pixels. Observe bien dans quel sens tourner à chaque fois !</p>',
      hints: [
        'Les balises forment un escalier : vers la droite, puis vers le haut, puis de nouveau vers la droite.',
        'avancer de 300 pixels · tourner vers la gauche de 90 ° · avancer de 300 pixels · tourner vers la droite de 90 ° · avancer de 300 pixels.',
      ],
      toolbox: MOVE_BASIC.concat(['ct_turn', 'ct_turn_deg']),
      starter: program((h) => [h.onRun([])]),
      solution: program((h) => [h.onRun([
        h.moveDist(300), h.turnDeg('tank', 1, 90), h.moveDist(300), h.turnDeg('tank', -1, 90), h.moveDist(300),
      ])]),
      maxTicks: 1200,
      player: { x: -400, y: -200, heading: 0 },
      zones: [{ x: -100, y: -200, r: 40 }, { x: -100, y: 100, r: 40 }, { x: 200, y: 100, r: 40 }],
      objective: { zones: true, failOnWall: true },
    },
    {
      id: 'm04',
      title: 'Le programme qui se répète',
      concept: 'Les répétitions',
      goal: 'Passe par les 4 balises du carré avec 3 blocs au maximum.',
      intro:
        '<p>Le bloc ' + ev('🔁 quand je n\'ai plus d\'ordres') + ' a un super-pouvoir : quand ton tank a fini tous ses ordres, ' +
        'il <strong>recommence depuis le début</strong>.</p>' +
        '<p>Utilise-le pour faire le tour du carré avec seulement <strong>3 blocs</strong>, bloc orange compris !</p>',
      hints: [
        'Un carré, c\'est quatre fois la même chose : un côté, puis un virage.',
        'Dans 🔁 : « avancer de 300 pixels » puis « tourner le tank vers la gauche de 90 ° ». Le bloc 🔁 répète tout seul.',
      ],
      toolbox: MOVE_BASIC.concat(['ct_turn', 'ct_turn_deg']),
      maxBlocks: 3,
      starter: program((h) => [h.onRun([])]),
      solution: program((h) => [h.onRun([h.moveDist(300), h.turnDeg('tank', 1, 90)])]),
      maxTicks: 1500,
      player: { x: -150, y: -150, heading: 0 },
      zones: [{ x: 0, y: -150, r: 40 }, { x: 150, y: 0, r: 40 }, { x: 0, y: 150, r: 40 }, { x: -150, y: 0, r: 40 }],
      objective: { zones: true, failOnWall: true },
    },
    {
      id: 'm05',
      title: 'Feu !',
      concept: 'Tirer',
      goal: 'Touche la cible 3 fois.',
      intro:
        '<p>Une cible t\'attend juste en face. Le bloc ' + wp('🔥 tirer') + ' lance un obus dans la direction du canon.</p>' +
        '<p>Attention : après chaque tir, le canon doit refroidir pendant 60 ticks (une seconde). ' +
        'Avec « dès que le canon est prêt », ton tank attend la fin du refroidissement avant de tirer.</p>',
      hints: [
        'Ton canon regarde déjà vers la cible : il suffit de tirer.',
        'Mets « 🔥 tirer dès que le canon est prêt » dans le bloc 🔁.',
      ],
      toolbox: MOVE_BASIC.concat(['ct_fire']),
      starter: program((h) => [h.onRun([])]),
      solution: program((h) => [h.onRun([h.fire(true)])]),
      maxTicks: 1500,
      player: { x: -300, y: 0, heading: 0 },
      opponents: [{ bot: 'ex-mannequin', name: 'Cible', x: 200, y: 0, heading: 180 }],
      objective: { hits: 3 },
    },
    {
      id: 'm06',
      title: 'Compter',
      concept: 'Les variables',
      goal: 'Touche la cible 3 fois en annonçant « 1 », « 2 », puis « 3 ».',
      intro:
        '<p>Une <strong>variable</strong> est une boîte qui garde un nombre en mémoire.</p>' +
        '<ol><li>Dans la catégorie « Variables », clique sur « Créer une variable... » et appelle-la <em>compteur</em>.</li>' +
        '<li>Au démarrage, ' + va('définir compteur à 0') + '.</li>' +
        '<li>Dans ' + ev('🎯 quand mon obus touche un tank') + ', ' + va('incrémenter compteur de 1') +
        ', puis fais-le annoncer avec ' + to('💬 dire') + '.</li></ol>',
      hints: [
        'Le bloc 🎯 s\'exécute à chaque fois qu\'un de tes obus touche : c\'est le bon endroit pour compter.',
        'Dans 🎯 : « incrémenter compteur de 1 », puis « 💬 dire » avec le bloc « compteur » (catégorie Variables) à la place du texte.',
      ],
      toolbox: ['ct_on_start', 'ct_on_run', 'ct_on_bullet', 'ct_fire', 'ct_say', 'math_number', 'VARIABLE'],
      starter: program((h) => [h.onStart([]), h.onRun([h.fire(true)]), h.onBullet('tank', [])]),
      solution: program((h) => [
        h.onStart([h.set('compteur', 0)]),
        h.onRun([h.fire(true)]),
        h.onBullet('tank', [h.change('compteur', 1), h.say(h.get('compteur'))]),
      ]),
      maxTicks: 1500,
      player: { x: -300, y: 0, heading: 0 },
      opponents: [{ bot: 'ex-mannequin', name: 'Cible', x: 200, y: 0, heading: 180 }],
      objective: { hits: 3, say: ['1', '2', '3'] },
    },
    {
      id: 'm07',
      title: 'Viser',
      concept: 'Les coordonnées',
      goal: 'Touche 3 fois la cible placée au point (250, 180).',
      intro:
        '<p>Chaque point de l\'arène a des <strong>coordonnées</strong> : <em>x</em> va de gauche (−512) à droite (512), ' +
        '<em>y</em> de bas (−320) en haut (320). Le centre est le point (0, 0).</p>' +
        '<p>La cible est au point (250, 180). Le bloc ' + mv('orienter le canon vers le point x … y …') +
        ' fait tourner le canon juste ce qu\'il faut.</p>',
      hints: [
        'Choisis « le canon » dans la liste du bloc « orienter … vers le point », puis écris 250 et 180.',
        'Dans 🔁 : « orienter le canon vers le point x 250 y 180 », puis « tirer dès que le canon est prêt ».',
      ],
      toolbox: MOVE_BASIC.concat(['ct_on_start', 'ct_turn_deg', 'ct_turn_to', 'ct_turn_to_point', 'ct_fire']),
      starter: program((h) => [h.onRun([])]),
      solution: program((h) => [h.onRun([h.turnToPoint('canon', 250, 180), h.fire(true)])]),
      maxTicks: 1800,
      player: { x: -300, y: -150, heading: 0 },
      opponents: [{ bot: 'ex-mannequin', name: 'Cible (250, 180)', x: 250, y: 180, heading: 270 }],
      objective: { hits: 3 },
    },
    {
      id: 'm08',
      title: 'Le radar',
      concept: 'Les événements',
      goal: 'Trouve la cible cachée et touche-la 3 fois.',
      intro:
        '<p>Cette fois, tu ne sais pas où est la cible ! Le <strong>radar</strong> de ton tank (le faisceau lumineux devant le canon) ' +
        'la détecte quand il passe dessus.</p>' +
        '<ul><li>Dans 🔁, fais tourner le canon pour balayer l\'arène : le radar tourne avec lui.</li>' +
        '<li>' + ev('📡 quand mon radar détecte un tank') + ' s\'exécute au moment de la détection. Dedans, ' +
        ob('objet : x') + ' et ' + ob('objet : y') + ' donnent la position de ce qui a été détecté.</li>' +
        '<li>' + wp('❌ annuler les ordres prévus') + ' arrête le balayage pour viser tout de suite.</li></ul>',
      hints: [
        'Dans 🔁 : « tourner le canon vers la gauche de 30 ° ». Ton tank balaie alors l\'arène sans fin.',
        'Dans 📡 : « annuler les ordres prévus », « orienter le canon vers le point x (objet : x) y (objet : y) », puis « tirer dès que le canon est prêt ». Le raccourci est dans la catégorie « Objet détecté ».',
      ],
      toolbox: ['ct_on_run', 'ct_on_radar', 'ct_turn', 'ct_turn_deg', 'ct_turn_to_point', 'ct_wait', 'ct_clear', 'ct_fire', 'ct_obj'],
      starter: program((h) => [h.onRun([]), h.onRadar('tank', [])]),
      solution: program((h) => [
        h.onRun([h.turnDeg('canon', 1, 30)]),
        h.onRadar('tank', [h.clear(), h.turnToPoint('canon', h.obj('x'), h.obj('y')), h.fire(true)]),
      ]),
      maxTicks: 3600,
      randomSeed: true,
      player: { x: 0, y: 0, heading: 0 },
      opponents: (rnd) => {
        const a = rnd() * Math.PI * 2;
        const d = 230 + rnd() * 120;
        return [{ bot: 'ex-mannequin', name: 'Cible', x: Math.cos(a) * d * 1.4, y: Math.max(-260, Math.min(260, Math.sin(a) * d)), heading: Math.floor(rnd() * 360) }];
      },
      objective: { hits: 3 },
    },
    {
      id: 'm09',
      title: 'Attention au mur',
      concept: 'Les conditions',
      goal: 'Parcours 1500 pixels sans toucher un seul mur.',
      intro:
        '<p>Chaque choc contre un mur coûte 10 points de santé. Le capteur ' + se('près d\'un mur ?') +
        ' est <em>vrai</em> quand ton tank s\'approche trop d\'un bord.</p>' +
        '<p>Avec le bloc ' + lo('si … faire') + ', ton tank peut <strong>décider</strong> tout seul : ' +
        '« si je suis près d\'un mur, alors je change de direction ».</p>' +
        '<p>Le programme de départ fonce droit dans le mur : à toi de l\'améliorer !</p>',
      hints: [
        'Avance par petits bouts (20 ticks) : ton tank vérifie ainsi souvent s\'il approche d\'un mur.',
        'Avant d\'avancer : « si près d\'un mur ? faire : orienter le tank vers le point x 0 y 0 » (le centre de l\'arène).',
      ],
      toolbox: MOVE_BASIC.concat(['ct_turn_deg', 'ct_turn_to', 'ct_turn_to_point', 'ct_sensor_bool', 'controls_if', 'logic_negate', 'math_random_int', 'math_number']),
      starter: program((h) => [h.onRun([h.move(20)])]),
      solution: program((h) => [h.onRun([
        h.if_(h.state('presDunMur'), [h.turnToPoint('tank', 0, 0)]),
        h.move(20),
      ])]),
      maxTicks: 2400,
      player: { x: 0, y: 0, heading: 35 },
      objective: { distance: 1500, failOnWall: true },
    },
    {
      id: 'm10',
      title: 'Cible mobile',
      concept: 'Réagir vite',
      goal: 'Touche le Tourniquet 3 fois en une minute et demie.',
      intro:
        '<p>Le Tourniquet tourne en rond. Le radar ne signale un objet qu\'au moment où celui-ci <strong>entre</strong> dans son faisceau : ' +
        'si tu continues à balayer dans le même sens après un tir, tu perds la cible pendant tout un tour.</p>' +
        '<p>L\'astuce : après chaque tir, fais repartir le canon <strong>un peu en arrière</strong>. Le radar repasse aussitôt sur la cible.</p>' +
        '<p>Et ne perds pas de temps à attendre la recharge : ' + lo('si') + ' ' + se('canon prêt à tirer ?') + ' alors ' + wp('tirer maintenant') + '.</p>',
      hints: [
        'Ton programme de la mission « Le radar » est déjà là : il ne manque que l\'astuce.',
        'Dans 📡, à la fin : « tourner le canon vers la droite de 15 ° ». Remplace « tirer dès que prêt » par « si canon prêt à tirer ? faire : tirer maintenant ».',
      ],
      toolbox: ['ct_on_run', 'ct_on_radar', 'ct_turn', 'ct_turn_deg', 'ct_turn_to_point', 'ct_wait', 'ct_clear', 'ct_fire', 'ct_obj', 'ct_sensor_bool', 'controls_if'],
      starterFrom: 'm08', // on repart du programme de la mission « Le radar »
      solution: program((h) => [
        h.onRun([h.turnDeg('canon', 1, 30)]),
        h.onRadar('tank', [
          h.clear(),
          h.turnToPoint('canon', h.obj('x'), h.obj('y')),
          h.if_(h.state('canonPret'), [h.fire(false)]),
          h.turnDeg('canon', -1, 15),
        ]),
      ]),
      maxTicks: 5400,
      randomSeed: true,
      player: { x: -250, y: -150, heading: 0 },
      opponents: (rnd) => {
        // le Tourniquet décrit un cercle d'environ 106 px de rayon autour de (cx, cy) :
        // on choisit le centre pour que le cercle reste loin des murs et du joueur
        const cx = 100 + rnd() * 200;
        const cy = -50 + rnd() * 150;
        const th = rnd() * 360;
        const R = 106.1;
        return [{
          bot: 'ex-tourniquet', name: 'Tourniquet',
          x: cx + R * Math.cos((th * Math.PI) / 180), y: cy + R * Math.sin((th * Math.PI) / 180), heading: th + 90,
        }];
      },
      objective: { hits: 3 },
    },
    {
      id: 'm11',
      title: 'Premier duel',
      concept: 'Tout réunir',
      goal: 'Gagne un duel contre la Sentinelle.',
      intro:
        '<p>Le grand moment : affronte la <strong>Sentinelle</strong> ! Elle aussi te cherche avec son radar, et elle tire. ' +
        'Le gagnant est celui qui inflige le plus de dégâts.</p>' +
        '<p>Tous les blocs sont disponibles. Une idée : bouge pour être plus difficile à toucher. ' +
        'Si tu ' + wp('🔓 déverrouilles le canon') + ', le bloc ' + mv('pendant … ticks, en même temps') +
        ' permet d\'avancer tout en balayant avec le canon.</p>' +
        '<p>Les positions de départ changent à chaque partie : n\'hésite pas à rejouer.</p>',
      hints: [
        'Pars de ton programme de la mission précédente : il vise déjà bien.',
        'Au démarrage, « 🔓 déverrouiller le canon ». Dans 🔁 : « pendant 30 ticks, en même temps : déplacement avancer, canon ↺ gauche ».',
        'Ajoute « si près d\'un mur ? » pour ne pas percuter les bords. Pour t\'inspirer, ouvre l\'exemple « Vagabond » dans l\'atelier.',
      ],
      toolbox: null,
      starterFrom: 'm10',
      solution: program((h) => [
        h.onStart([h.lock('canon', false)]),
        h.onRun([
          h.if_(h.state('presDunMur'), [h.turnToPoint('tank', h.random(-150, 150), h.random(-100, 100))]),
          h.combo(30, { move: 1, gun: 1 }),
        ]),
        h.onRadar('tank', [
          h.clear(),
          h.turnToPoint('canon', h.obj('x'), h.obj('y')),
          h.if_(h.state('canonPret'), [h.fire(false)]),
          h.combo(15, { move: 1, gun: -1 }),
        ]),
        h.onHit('mur', [h.clear(), h.moveDist(40, -1), h.turnToPoint('tank', 0, 0)]),
      ]),
      maxTicks: 3600,
      randomSeed: true,
      player: null,
      opponents: [{ bot: 'ex-sentinelle', name: 'Sentinelle' }],
      objective: { win: true },
    },
  ];

  /* ---------- Préparation d'une partie de mission ---------- */

  function get(id) {
    return MISSIONS.find((m) => m.id === id) || null;
  }

  function indexOf(id) {
    return MISSIONS.findIndex((m) => m.id === id);
  }

  /** Positions, adversaires et zones pour une graine donnée. */
  function setup(def, seed) {
    const rnd = E.makeRandom(((seed >>> 0) ^ 0x5bd1e995) >>> 0);
    const opponents = typeof def.opponents === 'function' ? def.opponents(rnd) : (def.opponents || []);
    return {
      player: def.player,
      opponents: opponents.map((o) => Object.assign({}, o)),
      zones: (def.zones || []).map((z) => Object.assign({ done: false }, z)),
    };
  }

  /** Boîte à outils réduite aux blocs autorisés par la mission. */
  function toolboxFor(def) {
    const full = root.TankBlocks.toolbox;
    if (!def || !def.toolbox) return full;
    const allowed = new Set(def.toolbox);
    const contents = [];
    for (const cat of full.contents) {
      if (cat.kind !== 'category') continue;
      if (cat.custom) {
        if (allowed.has(cat.custom)) contents.push(cat);
        continue;
      }
      const items = cat.contents.filter((it) => it.kind === 'block' && allowed.has(it.type));
      if (items.length) contents.push(Object.assign({}, cat, { contents: items }));
    }
    return { kind: 'categoryToolbox', contents };
  }

  function countBlocks(ws) {
    return ws.getAllBlocks(false).filter((bl) => !bl.isShadow() && bl.isEnabled()).length;
  }

  /* ---------- Vérification de l'objectif ---------- */

  function isSubsequence(wanted, list) {
    let i = 0;
    for (const x of list) if (i < wanted.length && x === wanted[i]) i++;
    return i === wanted.length;
  }

  class Tracker {
    /** Le joueur est toujours le tank n° 0 de la partie. */
    constructor(def, match, zones) {
      this.def = def;
      this.match = match;
      this.zones = zones || [];
      this.result = null;
    }

    get player() { return this.match.tanks[0]; }

    said() {
      return this.match.logs
        .filter((l) => l.tank === 0 && l.kind === 'say')
        .map((l) => l.text.replace(/^💬\s*/, '').trim());
    }

    /** Lignes d'avancement affichées pendant la mission. */
    progress() {
      const o = this.def.objective;
      const p = this.player;
      const out = [];
      if (o.zones) out.push('Balises : ' + this.zones.filter((z) => z.done).length + ' / ' + this.zones.length);
      if (o.hits) out.push('Tirs réussis : ' + Math.min(p.hits, o.hits) + ' / ' + o.hits);
      if (o.say) {
        const s = this.said();
        out.push('Annonces : ' + (s.length ? s.slice(-5).map((x) => '« ' + x + ' »').join(' ') : 'aucune'));
      }
      if (o.distance) out.push('Distance : ' + Math.min(Math.round(p.distance), o.distance) + ' / ' + o.distance + ' px');
      if (o.win) {
        const others = this.match.tanks.slice(1);
        out.push('Dégâts infligés : ' + p.damageDealt + ' contre ' + others.map((t) => t.damageDealt).join(', '));
      }
      return out;
    }

    _done() {
      const o = this.def.objective;
      const p = this.player;
      if (o.zones && this.zones.some((z) => !z.done)) return false;
      if (o.hits && p.hits < o.hits) return false;
      if (o.say && !isSubsequence(o.say, this.said())) return false;
      if (o.distance && p.distance < o.distance) return false;
      if (o.win) return this.match.finished && this.match.results && this.match.results.winner === 0;
      return true;
    }

    /** À appeler après chaque tick ; renvoie null tant que rien n'est décidé. */
    update() {
      if (this.result) return this.result;
      const o = this.def.objective;
      const p = this.player;
      for (const z of this.zones) {
        if (!z.done && Math.hypot(p.x - z.x, p.y - z.y) <= z.r) z.done = true;
      }
      if (this._done()) {
        this.result = { ok: true };
      } else if (o.failOnWall && p.wallHits > 0) {
        this.result = { ok: false, reason: o.wallMessage || '💥 Ton tank a percuté un mur !' };
      } else if (p.broken) {
        this.result = { ok: false, reason: '⚠ Ton programme est tombé en panne : ' + p.error };
      } else if (!p.alive) {
        this.result = { ok: false, reason: '💀 Ton tank a été détruit.' };
      } else if (this.match.finished) {
        this.result = this._timeout();
      }
      return this.result;
    }

    _timeout() {
      const o = this.def.objective;
      const p = this.player;
      if (o.win) {
        const r = this.match.results;
        if (r && r.winner < 0) return { ok: false, reason: '🤝 Égalité ! Il faut infliger plus de dégâts que la Sentinelle.' };
        const w = r ? this.match.tanks[r.winner] : null;
        return { ok: false, reason: (w ? w.name : 'L\'adversaire') + ' gagne ce duel (' + p.damageDealt + ' dégâts infligés contre ' + (w ? w.damageDealt : '?') + ').' };
      }
      if (o.say && p.hits >= (o.hits || 0)) {
        const s = this.said();
        return { ok: false, reason: 'Ton tank a bien touché la cible, mais il a annoncé : ' + (s.length ? s.map((x) => '« ' + x + ' »').join(', ') : 'rien du tout') + '.' };
      }
      if (o.hits && p.shots === 0) return { ok: false, reason: '⏱ Temps écoulé : ton tank n\'a pas tiré une seule fois.' };
      if (o.zones && p.distance < 1) return { ok: false, reason: '⏱ Temps écoulé : ton tank n\'a pas bougé. As-tu mis des blocs dans 🔁 ?' };
      return { ok: false, reason: '⏱ Temps écoulé. ' + this.progress().join(' · ') };
    }
  }

  /** Joue une mission sans affichage (tests). compile(id) → code d'un tank d'exemple. */
  function runHeadless(def, code, seed, compile) {
    const s = setup(def, seed);
    const specs = [{ name: 'Moi', code, spawn: s.player }].concat(
      s.opponents.map((o) => ({ name: o.name, code: compile(o.bot), spawn: o.x === undefined ? null : o })));
    const entrants = specs.map((sp, i) => RT.makeEntrant(sp, i, seed));
    const match = new E.Match({ entrants, seed, maxTicks: def.maxTicks });
    const tracker = new Tracker(def, match, s.zones);
    while (!tracker.update()) match.step();
    return tracker.result;
  }

  root.TankMissions = { MISSIONS, get, indexOf, setup, toolboxFor, countBlocks, Tracker, runHeadless };
})(typeof window !== 'undefined' ? window : globalThis);
