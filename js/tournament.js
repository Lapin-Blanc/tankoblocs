/*
 * TankoBlocs — tournoi de classe « chacun contre chacun » (sans affichage).
 *
 * Chaque paire de tanks dispute plusieurs manches en duel, avec des
 * positions de départ différentes (graine) et l'ordre des tanks inversé
 * une manche sur deux. Victoire : 3 points, nul : 1, défaite : 0.
 *
 * Les manches sont préparées exactement comme dans l'arène
 * (TankRuntime.distinctify + buildEntrants) : on peut donc les revoir.
 */
(function (root) {
  'use strict';

  const E = root.TankEngine;
  const RT = root.TankRuntime;

  const POINTS = { win: 3, draw: 1, loss: 0 };

  function mancheSeed(base, pairIndex, round) {
    return (((base >>> 0) + pairIndex * 1009 + round * 7919) % 999999) + 1;
  }

  /** Liste de toutes les manches du tournoi. */
  function schedule(ids, rounds, baseSeed) {
    const list = [];
    let pair = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        for (let k = 0; k < rounds; k++) {
          const swap = k % 2 === 1;
          list.push({
            pair,
            round: k,
            a: swap ? ids[j] : ids[i],
            b: swap ? ids[i] : ids[j],
            seed: mancheSeed(baseSeed, pair, k),
            result: null,
          });
        }
        pair++;
      }
    }
    return list;
  }

  /** Joue une manche ; specs = [participant a, participant b] (avec leur code compilé). */
  function playManche(specs, seed, maxTicks) {
    const prepared = RT.distinctify(specs);
    const match = new E.Match({ entrants: RT.buildEntrants(prepared, seed), seed, maxTicks });
    while (!match.finished) {
      match.step();
      match.fx.length = 0;
    }
    const t = match.tanks;
    return {
      winner: match.results.winner, // 0 : a gagne, 1 : b gagne, -1 : nul
      damage: [t[0].damageDealt, t[1].damageDealt],
      health: [t[0].health, t[1].health],
      broken: [t[0].broken, t[1].broken],
      ticks: match.tick,
    };
  }

  /** Classement à partir des manches jouées. */
  function standings(ids, manches) {
    const rows = new Map(ids.map((id) => [id, {
      id, played: 0, wins: 0, draws: 0, losses: 0, points: 0, dealt: 0, taken: 0, broken: 0,
    }]));
    for (const m of manches) {
      const r = m.result;
      if (!r) continue;
      const ra = rows.get(m.a);
      const rb = rows.get(m.b);
      if (!ra || !rb) continue;
      ra.played++; rb.played++;
      ra.dealt += r.damage[0]; rb.dealt += r.damage[1];
      ra.taken += r.damage[1]; rb.taken += r.damage[0];
      if (r.broken[0]) ra.broken++;
      if (r.broken[1]) rb.broken++;
      if (r.winner === 0) { ra.wins++; rb.losses++; }
      else if (r.winner === 1) { rb.wins++; ra.losses++; }
      else { ra.draws++; rb.draws++; }
    }
    const list = Array.from(rows.values());
    for (const r of list) r.points = r.wins * POINTS.win + r.draws * POINTS.draw + r.losses * POINTS.loss;
    list.sort(compare);
    // rangs avec ex aequo
    list.forEach((r, i) => { r.rank = i > 0 && compare(list[i - 1], r) === 0 ? list[i - 1].rank : i + 1; });
    return list;
  }

  function compare(x, y) {
    return (y.points - x.points) || (y.dealt - x.dealt) || (y.wins - x.wins);
  }

  /** Bilan d'une rencontre (toutes les manches d'une même paire). */
  function pairSummary(manches, pair) {
    const list = manches.filter((m) => m.pair === pair);
    if (!list.length) return null;
    const first = list[0];
    const s = { pair, x: first.a, y: first.b, winsX: 0, winsY: 0, draws: 0, manches: list };
    for (const m of list) {
      const r = m.result;
      if (!r) continue;
      if (r.winner < 0) { s.draws++; continue; }
      const winnerId = r.winner === 0 ? m.a : m.b;
      if (winnerId === s.x) s.winsX++; else s.winsY++;
    }
    return s;
  }

  root.TankTournament = { POINTS, schedule, playManche, standings, pairSummary, mancheSeed };
})(typeof window !== 'undefined' ? window : globalThis);
