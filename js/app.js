/*
 * TankoBlocs — interface : atelier (Blockly), arène, championnat.
 */
(function () {
  'use strict';

  const Blockly = window.Blockly;
  const E = window.TankEngine;
  const CMD = E.CMD;
  const B = window.TankBlocks;
  const Bots = window.TankBots;
  const Store = window.TankStore;
  const RT = window.TankRuntime;
  const M = window.TankMissions;
  const T = window.TankTournament;

  const $ = (sel, root) => (root || document).querySelector(sel);

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const val = attrs[k];
        if (val === undefined || val === null || val === false) continue;
        if (k === 'class') node.className = val;
        else if (k === 'text') node.textContent = val;
        else if (k === 'style') node.setAttribute('style', val);
        else if (k.startsWith('on') && typeof val === 'function') node.addEventListener(k.slice(2), val);
        else node.setAttribute(k, val === true ? '' : val);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  }

  function debounce(fn, ms) {
    let id = null;
    return function (...args) {
      clearTimeout(id);
      id = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function fmtTime(ticks) {
    const s = Math.max(0, ticks) / 60;
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  function fmtTimePrecise(ticks) {
    const s = Math.max(0, ticks) / 60;
    const m = Math.floor(s / 60);
    return m + ':' + (s % 60).toFixed(1).padStart(4, '0');
  }

  function randomSeed() {
    return 1 + Math.floor(Math.random() * 999998);
  }

  const PALETTE = RT.PALETTE;

  /* ---------- Réglages ---------- */

  const settings = Object.assign({
    view: 'missions',
    mission: null,
    slots: ['draft', 'ex:ex-sentinelle', 'ex:ex-vagabond', ''],
    duration: 3600,
    speed: 1,
    radar: true,
    labels: true,
    debug: false,
    sound: true,
    seed: randomSeed(),
    cupRounds: 25,
    opponent: 'ex:ex-tourniquet',
  }, Store.getSettings());
  if (!Array.isArray(settings.slots) || settings.slots.length !== 4) settings.slots = ['draft', 'ex:ex-sentinelle', 'ex:ex-vagabond', ''];
  const saveSettings = debounce(() => Store.setSettings(settings), 200);

  const audio = new window.TankAudio();
  audio.enabled = settings.sound !== false;

  /* ---------- Confirmation ---------- */

  function ask(message, yesLabel) {
    return new Promise((resolve) => {
      const d = $('#confirm-dialog');
      $('#confirm-text').textContent = message;
      $('#confirm-yes').textContent = yesLabel || 'Confirmer';
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'yes'), { once: true });
      d.showModal();
    });
  }

  /* =====================================================================
   * ATELIER
   * ===================================================================== */

  const editor = {
    ws: null,
    draft: null,
    loading: false,
    lastError: null,
    mission: null, // mission en cours (mode « parcours »)
    normalDraft: null,
    normalBaseline: null,
    hintsShown: 0,

    init() {
      this.ws = Blockly.inject('blockly', {
        toolbox: B.toolbox,
        theme: B.theme,
        renderer: 'zelos',
        media: 'vendor/blockly/media/',
        grid: { spacing: 24, length: 3, colour: '#25313a', snap: true },
        zoom: { controls: true, wheel: true, startScale: 0.8, maxScale: 1.6, minScale: 0.35, scaleSpeed: 1.12 },
        move: { scrollbars: true, drag: true, wheel: false },
        trashcan: true,
        // Blockly charge ses sons avec fetch(), impossible quand la page est ouverte en file://
        sounds: location.protocol !== 'file:',
        oneBasedIndex: true,
      });
      this.ws.addChangeListener(Blockly.Events.disableOrphans);
      this.ws.addChangeListener((e) => this.onChange(e));

      const saved = Store.getDraft();
      if (saved && saved.workspace) {
        this.draft = { libId: saved.libId || null, name: saved.name || 'Mon tank', color: saved.color || PALETTE[0], workspace: saved.workspace };
        this.load(this.draft.workspace, false);
        // brouillon d'une session précédente : toujours considéré comme précieux
        this.baseline = null;
      } else {
        this.draft = { libId: null, name: 'Mon tank', color: PALETTE[0], workspace: null };
        this.load(Bots.TEMPLATE, true);
      }

      this.buildSwatches();
      const nameInput = $('#tank-name');
      nameInput.value = this.draft.name;
      nameInput.addEventListener('input', () => {
        this.draft.name = nameInput.value.trim() || 'Sans nom';
        this.persistDraft();
        this.refreshStatus();
        arena.refreshSlotOptions();
        arena.markDirty();
      });

      $('#btn-save').addEventListener('click', () => this.save());
      $('#btn-new').addEventListener('click', () => this.newTank());
      $('#btn-export').addEventListener('click', () => Store.exportTank(this.currentTank()));
      $('#btn-import').addEventListener('click', () => $('#file-import').click());
      $('#file-import').addEventListener('change', (e) => this.importFile(e.target.files[0]));
      $('#btn-test').addEventListener('click', () => this.test());
      $('#test-opponent').addEventListener('change', (e) => { settings.opponent = e.target.value; saveSettings(); });
      $('#code-details').addEventListener('toggle', () => this.updatePreview());

      // panneau de mission
      $('#mp-test').addEventListener('click', () => this.testMission());
      $('#mp-hint').addEventListener('click', () => this.showHint());
      $('#mp-solution').addEventListener('click', () => this.showSolution());
      $('#mp-reset').addEventListener('click', () => this.resetMission());
      $('#mp-quit').addEventListener('click', () => { this.exitMission(); });
      $('#mp-list').addEventListener('click', () => showView('missions'));
      $('#mp-prev').addEventListener('click', () => this.goMission(-1));
      $('#mp-next').addEventListener('click', () => this.goMission(1));

      this.renderLists();
      this.refreshStatus();
    },

    /* --- Mode mission --- */

    /** Sauvegarde immédiate du programme affiché (sans attendre le délai habituel). */
    flushWorkspace() {
      if (!this.ws || !this.draft) return;
      this.draft.workspace = this.serialize();
      this.persistDraft();
    },

    starterFor(def) {
      if (def.starter) return def.starter;
      const from = M.get(def.starterFrom);
      return (from && Store.getMissionWorkspace(from.id)) || (from ? from.solution : Bots.TEMPLATE);
    },

    enterMission(def) {
      if (!def) return;
      this.flushWorkspace();
      if (!this.mission) {
        this.normalDraft = this.draft;
        this.normalBaseline = this.baseline;
      }
      this.mission = def;
      settings.mission = def.id;
      saveSettings();
      const base = this.normalDraft || this.draft;
      this.draft = { libId: null, name: base.name, color: base.color, workspace: null };
      this.ws.updateToolbox(M.toolboxFor(def));
      const saved = Store.getMissionWorkspace(def.id);
      this.load(saved || this.starterFor(def), !saved);
      this.lastError = null;
      $('#side-normal').hidden = true;
      $('#side-mission').hidden = false;
      $('#view-atelier').classList.add('mission-mode');
      this.renderMission();
      arena.onMissionChange();
    },

    exitMission() {
      if (!this.mission) return;
      this.flushWorkspace();
      this.mission = null;
      settings.mission = null;
      saveSettings();
      this.draft = this.normalDraft || { libId: null, name: 'Mon tank', color: PALETTE[0], workspace: null };
      this.normalDraft = null;
      this.ws.updateToolbox(B.toolbox);
      this.load(this.draft.workspace || Bots.TEMPLATE, !this.draft.workspace);
      this.baseline = this.normalBaseline;
      $('#side-normal').hidden = false;
      $('#side-mission').hidden = true;
      $('#view-atelier').classList.remove('mission-mode');
      $('#tank-name').value = this.draft.name;
      this.buildSwatches();
      this.renderLists();
      this.refreshStatus();
      arena.onMissionChange();
    },

    goMission(delta) {
      const i = M.indexOf(this.mission.id) + delta;
      if (i >= 0 && i < M.MISSIONS.length) this.enterMission(M.MISSIONS[i]);
    },

    renderMission() {
      const def = this.mission;
      const i = M.indexOf(def.id);
      const n = M.MISSIONS.length;
      const done = missionsView.isDone(def.id);
      $('#mp-num').textContent = 'Mission ' + (i + 1) + ' / ' + n + (done ? ' ✓' : '');
      $('#mp-title').textContent = def.title;
      $('#mp-concept').textContent = 'Notion : ' + def.concept;
      $('#mp-goal').textContent = '🎯 ' + def.goal;
      $('#mp-intro').innerHTML = def.intro; // contenu statique défini dans missions.js
      $('#mp-hints').textContent = '';
      this.hintsShown = 0;
      this.updateHintButton();
      $('#mp-prev').disabled = i === 0;
      $('#mp-next').disabled = i === n - 1;
      this.setMissionStatus(null);
      this.refreshMission();
    },

    refreshMission() {
      const def = this.mission;
      if (!def) return;
      const box = $('#mp-blocks');
      if (def.maxBlocks) {
        const c = M.countBlocks(this.ws);
        box.hidden = false;
        box.textContent = '🧩 Blocs utilisés : ' + c + ' / ' + def.maxBlocks + ' maximum';
        box.classList.toggle('over', c > def.maxBlocks);
      } else {
        box.hidden = true;
      }
    },

    setMissionStatus(result) {
      const st = $('#mp-status');
      if (!result) { st.textContent = ''; st.className = 'status'; return; }
      st.textContent = result.ok ? 'Dernier essai : ⭐ mission réussie !' : 'Dernier essai : ' + result.reason;
      st.className = 'status ' + (result.ok ? 'ok' : 'error');
    },

    updateHintButton() {
      const total = this.mission.hints.length;
      const b = $('#mp-hint');
      b.textContent = this.hintsShown >= total ? '💡 Plus d\'indice' : '💡 Un indice (' + this.hintsShown + '/' + total + ')';
      b.disabled = this.hintsShown >= total;
    },

    showHint() {
      const def = this.mission;
      if (!def || this.hintsShown >= def.hints.length) return;
      $('#mp-hints').appendChild(el('li', null, def.hints[this.hintsShown]));
      this.hintsShown++;
      this.updateHintButton();
    },

    async showSolution() {
      const def = this.mission;
      if (!(await ask('Remplacer ton programme par la solution ? Ton programme actuel sera perdu.', 'Voir la solution'))) return;
      this.load(def.solution, true);
      this.refreshMission();
    },

    async resetMission() {
      const def = this.mission;
      if (!(await ask('Recommencer la mission avec le programme de départ ? Ton programme actuel sera perdu.', 'Recommencer'))) return;
      this.load(this.starterFor(def), true);
      this.refreshMission();
    },

    testMission() {
      const def = this.mission;
      if (def.maxBlocks && M.countBlocks(this.ws) > def.maxBlocks) {
        this.setMissionStatus({ ok: false, reason: 'trop de blocs ! Cette mission en autorise ' + def.maxBlocks + ' au maximum (bloc orange compris).' });
        return;
      }
      this.draft.workspace = this.serialize();
      this.persistDraft();
      showView('arene');
      arena.newMatch(true);
    },

    serialize() {
      return Blockly.serialization.workspaces.save(this.ws);
    },

    load(state, cleanUp) {
      this.loading = true;
      Blockly.Events.disable();
      try {
        this.ws.clear();
        Blockly.serialization.workspaces.load(state || {}, this.ws);
      } finally {
        Blockly.Events.enable();
        this.loading = false;
      }
      if (cleanUp) this.ws.cleanUp();
      this.ws.clearUndo();
      // centrer seulement quand l'atelier est visible (sinon sa taille est nulle)
      if ($('#view-atelier').classList.contains('active')) this.ws.scrollCenter();
      else this.needsCenter = true;
      this.draft.workspace = this.serialize();
      this.baseline = JSON.stringify(this.draft.workspace);
      this.persistDraft();
      this.updatePreview();
      arena.markDirty();
    },

    onChange(e) {
      if (this.loading || e.isUiEvent) return;
      this.scheduleSync();
    },

    scheduleSync: debounce(function () {
      editor.draft.workspace = editor.serialize();
      editor.persistDraft();
      editor.refreshStatus();
      editor.updatePreview();
      editor.refreshMission();
      arena.markDirty();
    }, 250),

    persistDraft() {
      if (this.mission) Store.setMissionWorkspace(this.mission.id, this.draft.workspace);
      else Store.setDraft(this.draft);
    },

    currentTank() {
      return { name: this.draft.name, color: this.draft.color, workspace: this.serialize() };
    },

    signature(t) {
      return JSON.stringify([t.name, t.color, t.workspace]);
    },

    isDirty() {
      if (!this.draft.libId) return JSON.stringify(this.serialize()) !== this.baseline;
      const entry = Store.get(this.draft.libId);
      if (!entry) return true;
      return this.signature(entry) !== this.signature({ name: this.draft.name, color: this.draft.color, workspace: this.serialize() });
    },

    isEmpty() {
      return this.ws.getAllBlocks(false).length === 0;
    },

    refreshStatus(msg, kind) {
      const s = $('#save-status');
      if (msg) {
        s.textContent = msg;
        s.className = 'status ' + (kind || '');
        return;
      }
      if (!this.draft.libId) {
        s.textContent = 'Ce tank n\'est pas encore enregistré.';
        s.className = 'status';
      } else if (this.isDirty()) {
        s.textContent = 'Modifications non enregistrées.';
        s.className = 'status';
      } else {
        s.textContent = 'Enregistré ✓';
        s.className = 'status ok';
      }
      $('#tank-dot').style.background = this.draft.color;
      const err = $('#last-error');
      if (this.lastError) {
        err.hidden = false;
        err.textContent = '⚠ Lors du dernier combat : ' + this.lastError;
      } else {
        err.hidden = true;
      }
    },

    buildSwatches() {
      const box = $('#tank-colors');
      box.textContent = '';
      for (const c of PALETTE) {
        const b = el('button', {
          class: 'swatch', type: 'button', role: 'radio', title: c,
          'aria-label': 'Couleur ' + c, 'aria-checked': String(c === this.draft.color),
          style: 'background:' + c,
          onclick: () => {
            this.draft.color = c;
            for (const s of box.children) s.setAttribute('aria-checked', String(s.title === c));
            this.persistDraft();
            this.refreshStatus();
            arena.markDirty();
          },
        });
        box.appendChild(b);
      }
    },

    updatePreview() {
      if (!$('#code-details').open) return;
      let code;
      try {
        code = B.compileWorkspace(this.ws, false);
      } catch (e) {
        code = '// Erreur de génération : ' + e.message;
      }
      $('#code-preview').textContent = code.trim() ? code : '// Ajoute un bloc « événement » (orange) pour commencer.';
    },

    async confirmLeave() {
      if (this.isEmpty() || !this.isDirty()) return true;
      return ask('Le tank « ' + this.draft.name + ' » contient des modifications non enregistrées. Continuer quand même ?', 'Continuer');
    },

    save() {
      const entry = Store.save({ id: this.draft.libId, name: this.draft.name, color: this.draft.color, workspace: this.serialize() });
      if (!entry) {
        this.refreshStatus('Impossible d\'enregistrer (stockage du navigateur plein ou désactivé). Utilise « Exporter ».', 'error');
        return;
      }
      this.draft.libId = entry.id;
      this.persistDraft();
      this.renderLists();
      arena.refreshSlotOptions();
      this.refreshStatus();
    },

    async newTank() {
      if (!(await this.confirmLeave())) return;
      const used = new Set(Store.list().map((t) => t.color));
      this.draft = { libId: null, name: 'Nouveau tank', color: PALETTE.find((c) => !used.has(c)) || PALETTE[0], workspace: null };
      this.lastError = null;
      $('#tank-name').value = this.draft.name;
      this.buildSwatches();
      this.load(Bots.TEMPLATE, true);
      this.renderLists();
      this.refreshStatus();
      arena.refreshSlotOptions();
    },

    async openTank(entry, asCopy) {
      if (!(await this.confirmLeave())) return;
      this.draft = {
        libId: asCopy ? null : entry.id,
        name: asCopy ? entry.name + ' (copie)' : entry.name,
        color: entry.color,
        workspace: null,
      };
      this.lastError = null;
      $('#tank-name').value = this.draft.name;
      this.buildSwatches();
      this.load(entry.workspace, !!asCopy);
      this.renderLists();
      this.refreshStatus();
      arena.refreshSlotOptions();
    },

    async importFile(file) {
      $('#file-import').value = '';
      if (!file) return;
      try {
        const t = await Store.importFile(file);
        // vérifie que le contenu se charge avant de l'enregistrer
        B.compileState(t.workspace, false);
        const entry = Store.save(t);
        if (!entry) throw new Error('stockage du navigateur indisponible');
        this.renderLists();
        arena.refreshSlotOptions();
        await this.openTank(entry, false);
        this.refreshStatus('« ' + entry.name + ' » importé ✓', 'ok');
      } catch (e) {
        this.refreshStatus('Import impossible : ' + e.message, 'error');
      }
    },

    async deleteTank(entry) {
      const ok = await ask('Supprimer définitivement « ' + entry.name + ' » de ce navigateur ?', 'Supprimer');
      if (!ok) return;
      Store.remove(entry.id);
      if (this.draft.libId === entry.id) {
        this.draft.libId = null;
        this.persistDraft();
      }
      settings.slots = settings.slots.map((s) => (s === 'lib:' + entry.id ? '' : s));
      saveSettings();
      this.renderLists();
      arena.refreshSlotOptions();
      this.refreshStatus();
    },

    duplicate(entry) {
      Store.save({ name: entry.name + ' (copie)', color: entry.color, workspace: entry.workspace });
      this.renderLists();
      arena.refreshSlotOptions();
    },

    renderLists() {
      const mine = $('#my-tanks');
      mine.textContent = '';
      const list = Store.list();
      if (!list.length) {
        mine.appendChild(el('li', { class: 'empty' }, 'Aucun tank enregistré pour l\'instant.'));
      }
      for (const t of list) {
        const date = new Date(t.updated);
        mine.appendChild(el('li', { class: 'mine' + (t.id === this.draft.libId ? ' current' : '') },
          el('span', { class: 'dot', style: 'background:' + t.color }),
          el('div', { class: 'info' },
            el('div', { class: 'name', title: t.name }, t.name),
            el('div', { class: 'meta' }, isNaN(date) ? '' : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ', ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))),
          el('div', { class: 'actions' },
            el('button', { class: 'btn small', title: 'Ouvrir dans l\'atelier', onclick: () => this.openTank(t, false) }, 'Ouvrir'),
            el('button', { class: 'btn small', title: 'Dupliquer', 'aria-label': 'Dupliquer ' + t.name, onclick: () => this.duplicate(t) }, '⧉'),
            el('button', { class: 'btn small', title: 'Exporter dans un fichier', 'aria-label': 'Exporter ' + t.name, onclick: () => Store.exportTank(t) }, '⬇'),
            el('button', { class: 'btn small danger', title: 'Supprimer', 'aria-label': 'Supprimer ' + t.name, onclick: () => this.deleteTank(t) }, '🗑'))));
      }

      const ex = $('#examples');
      ex.textContent = '';
      for (const t of Bots.EXAMPLES) {
        ex.appendChild(el('li', null,
          el('span', { class: 'dot', style: 'background:' + t.color }),
          el('div', { class: 'info' },
            el('div', { class: 'name' }, t.name, el('span', { class: 'badge lvl-' + t.level }, t.level)),
            el('div', { class: 'desc' }, t.description)),
          el('div', { class: 'actions' },
            el('button', { class: 'btn small', title: 'Ouvrir une copie dans l\'atelier', onclick: () => this.openTank(t, true) }, 'Étudier'))));
      }
    },

    test() {
      const opp = $('#test-opponent').value || 'ex:ex-tourniquet';
      settings.opponent = opp;
      arena.setSlots(['draft', opp, '', '']);
      showView('arene');
      arena.newMatch(true);
    },
  };

  /* =====================================================================
   * MISSIONS (parcours d'apprentissage)
   * ===================================================================== */

  const missionsView = {
    init() {
      $('#missions-reset').addEventListener('click', () => this.reset());
    },

    isDone(id) {
      const p = Store.getMissionProgress();
      return !!(p[id] && p[id].done);
    },

    markDone(id) {
      const p = Store.getMissionProgress();
      p[id] = { done: true, at: new Date().toISOString() };
      Store.setMissionProgress(p);
    },

    render() {
      const grid = $('#missions-grid');
      grid.textContent = '';
      let done = 0;
      M.MISSIONS.forEach((def, i) => {
        const ok = this.isDone(def.id);
        if (ok) done++;
        const current = !!editor.mission && editor.mission.id === def.id;
        const started = !!Store.getMissionWorkspace(def.id);
        const label = current ? 'Continuer ▶' : ok ? 'Refaire' : started ? 'Reprendre' : 'Commencer';
        grid.appendChild(el('li', { class: 'mission-item' + (ok ? ' done' : '') + (current ? ' current' : '') },
          el('div', { class: 'mnum', 'aria-hidden': 'true' }, ok ? '✓' : String(i + 1)),
          el('div', { class: 'minfo' },
            el('div', { class: 'mtitle' }, (i + 1) + '. ' + def.title),
            el('div', { class: 'mconcept' }, def.concept),
            el('div', { class: 'mgoal' }, def.goal),
            el('button', { class: 'btn small' + (current ? ' primary' : ''), onclick: () => this.start(def.id) }, label))));
      });
      // met en avant la première mission non réussie
      const next = M.MISSIONS.find((d) => !this.isDone(d.id));
      if (next && !editor.mission) {
        const btn = grid.children[M.indexOf(next.id)].querySelector('button');
        btn.classList.add('primary');
      }
      $('#missions-bar').max = M.MISSIONS.length;
      $('#missions-bar').value = done;
      $('#missions-count').textContent = done + ' / ' + M.MISSIONS.length + ' réussie' + (done > 1 ? 's' : '');
    },

    start(id) {
      const def = M.get(id);
      if (!def) return;
      if (!editor.mission || editor.mission.id !== id) editor.enterMission(def);
      showView('atelier');
    },

    async reset() {
      if (!(await ask('Effacer la progression et les programmes de toutes les missions ?', 'Tout effacer'))) return;
      if (editor.mission) editor.exitMission();
      Store.clearMissions(M.MISSIONS.map((d) => d.id));
      this.render();
    },
  };

  /* =====================================================================
   * SOURCES DE TANKS (atelier, bibliothèque, exemples, pilote)
   * ===================================================================== */

  function sourceOptions() {
    const opts = [];
    opts.push({ value: 'draft', label: '✏️ ' + editor.draft.name + ' (atelier)', group: 'Atelier' });
    for (const t of Store.list()) opts.push({ value: 'lib:' + t.id, label: '💾 ' + t.name, group: 'Mes tanks' });
    for (const t of Bots.EXAMPLES) opts.push({ value: 'ex:' + t.id, label: '🤖 ' + t.name + ' (' + t.level + ')', group: 'Exemples' });
    for (const e of tournament.data ? tournament.data.entries : []) opts.push({ value: 'tour:' + e.id, label: '🏆 ' + e.name, group: 'Tournoi' });
    opts.push({ value: 'pilot', label: '🎮 Pilote clavier', group: 'Humain' });
    return opts;
  }

  function fillSelect(select, value, withEmpty, exclude) {
    select.textContent = '';
    if (withEmpty) select.appendChild(el('option', { value: '' }, '— aucun —'));
    const groups = new Map();
    for (const o of sourceOptions()) {
      if (exclude && exclude.includes(o.value)) continue;
      if (!groups.has(o.group)) groups.set(o.group, el('optgroup', { label: o.group }));
      groups.get(o.group).appendChild(el('option', { value: o.value }, o.label));
    }
    for (const g of groups.values()) select.appendChild(g);
    select.value = value;
    if (select.value !== value) select.value = withEmpty ? '' : (select.options[0] ? select.options[0].value : '');
    return select.value;
  }

  /** Transforme une source en participant : { name, color, code | pilot, error } */
  function resolveSource(value) {
    if (!value) return null;
    if (value === 'pilot') return { name: Bots.PILOT.name, color: Bots.PILOT.color, pilot: true, source: value };
    let name;
    let color;
    let compile;
    if (value === 'draft') {
      name = editor.draft.name;
      color = editor.draft.color;
      compile = () => B.compileWorkspace(editor.ws, true);
    } else if (value.startsWith('lib:')) {
      const t = Store.get(value.slice(4));
      if (!t) return null;
      name = t.name; color = t.color;
      compile = () => B.compileState(t.workspace, true);
    } else if (value.startsWith('ex:')) {
      const t = Bots.EXAMPLES.find((x) => 'ex:' + x.id === value);
      if (!t) return null;
      name = t.name; color = t.color;
      compile = () => B.compileState(t.workspace, true);
    } else if (value.startsWith('tour:')) {
      const t = tournament.entry(value.slice(5));
      if (!t) return null;
      name = t.name; color = t.color;
      compile = () => B.compileState(t.workspace, true);
    } else {
      return null;
    }
    const spec = { name, color, source: value, code: '' };
    try {
      spec.code = compile();
    } catch (e) {
      spec.error = 'impossible de lire le programme : ' + e.message;
    }
    return spec;
  }

  const distinctify = RT.distinctify;
  const buildEntrants = RT.buildEntrants;

  /* =====================================================================
   * TOURNOI DE CLASSE
   * ===================================================================== */

  const GENERIC_NAMES = ['mon tank', 'nouveau tank', 'sans nom', 'tank importé'];
  const MAX_ENTRIES = 64;

  const tournament = {
    data: null,
    running: false,
    cancel: false,
    filter: '',

    init() {
      const saved = Store.getTournament();
      this.data = Object.assign({ entries: [], rounds: 2, duration: 3600, run: null }, saved || {});
      if (!Array.isArray(this.data.entries)) this.data.entries = [];

      $('#tour-import').addEventListener('click', () => $('#tour-files').click());
      $('#tour-files').addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        this.addFiles(files);
      });
      $('#tour-clear').addEventListener('click', () => this.clear());
      $('#tour-add').addEventListener('click', () => this.addSource($('#tour-add-source').value));
      $('#tour-rounds').value = String(this.data.rounds);
      $('#tour-rounds').addEventListener('change', (e) => { this.data.rounds = Number(e.target.value) || 2; this.save(); this.renderEstimate(); });
      $('#tour-duration').value = String(this.data.duration);
      $('#tour-duration').addEventListener('change', (e) => { this.data.duration = Number(e.target.value) || 3600; this.save(); });
      $('#tour-run').addEventListener('click', () => { if (this.running) this.cancel = true; else this.run(); });
      $('#tour-final').addEventListener('click', () => this.finale());
      $('#tour-csv').addEventListener('click', () => this.exportCsv());
      $('#tour-filter').addEventListener('change', (e) => { this.filter = e.target.value; this.renderPairs(); });

      // glisser-déposer de fichiers n'importe où dans la vue
      const view = $('#view-tournoi');
      const zone = $('#tour-drop');
      const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      view.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        zone.classList.add('dragging');
      });
      view.addEventListener('dragleave', (e) => { if (e.target === view || !view.contains(e.relatedTarget)) zone.classList.remove('dragging'); });
      view.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        zone.classList.remove('dragging');
        this.addFiles(Array.from(e.dataTransfer.files));
      });

      this.render();
    },

    save() {
      if (!Store.setTournament(this.data)) this.message('⚠ Impossible d\'enregistrer le tournoi dans ce navigateur (stockage plein ?).', 'error');
    },

    message(text, kind) {
      const m = $('#tour-msg');
      m.textContent = text || '';
      m.className = 'status ' + (kind || '');
    },

    entry(id) {
      return (this.data && this.data.entries.find((e) => e.id === id)) || null;
    },

    nameOf(id) {
      const e = this.entry(id);
      return e ? e.name : '(retiré)';
    },

    colorOf(id) {
      const e = this.entry(id);
      return e ? e.color : '#555';
    },

    /** Ajoute un tank ; renvoie 'ok', 'dup' ou 'full' (exception si le programme est illisible). */
    add(t, origin) {
      if (this.data.entries.length >= MAX_ENTRIES) return 'full';
      // même nom ET même programme : le même fichier importé deux fois
      const sig = JSON.stringify(t.workspace);
      const name = String(t.name || 'Sans nom').slice(0, 40).toLowerCase();
      if (this.data.entries.some((e) => e.name.toLowerCase() === name && JSON.stringify(e.workspace) === sig)) return 'dup';
      B.compileState(t.workspace, false);
      this.data.entries.push({
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        name: String(t.name || 'Sans nom').slice(0, 40),
        color: /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : PALETTE[this.data.entries.length % PALETTE.length],
        workspace: t.workspace,
        origin: origin || '',
      });
      return 'ok';
    },

    async addFiles(files) {
      if (this.running || !files.length) return;
      let added = 0;
      const problems = [];
      for (const f of files) {
        try {
          const t = await Store.importFile(f);
          const r = this.add(t, f.name);
          if (r === 'ok') added++;
          else if (r === 'dup') problems.push(f.name + ' : déjà dans la liste');
          else { problems.push(MAX_ENTRIES + ' participants au maximum'); break; }
        } catch (e) {
          problems.push(f.name + ' : ' + e.message);
        }
      }
      this.changed();
      let msg = added + ' tank' + (added > 1 ? 's ajoutés.' : ' ajouté.');
      if (problems.length) msg += ' Non ajouté' + (problems.length > 1 ? 's' : '') + ' : ' + problems.join(' ; ') + '.';
      this.message(msg, problems.length ? 'error' : 'ok');
    },

    addSource(value) {
      if (!value || this.running) return;
      let t = null;
      let origin = '';
      if (value === 'draft') {
        t = { name: editor.draft.name, color: editor.draft.color, workspace: editor.serialize() };
        origin = 'atelier';
      } else if (value.startsWith('lib:')) {
        t = Store.get(value.slice(4));
        origin = 'mes tanks';
      } else if (value.startsWith('ex:')) {
        t = Bots.EXAMPLES.find((x) => 'ex:' + x.id === value);
        origin = 'exemple';
      }
      if (!t) return;
      let r;
      try {
        r = this.add(t, origin);
      } catch (e) {
        this.message('Programme illisible : ' + e.message, 'error');
        return;
      }
      this.changed();
      if (r === 'ok') this.message('« ' + t.name + ' » ajouté.', 'ok');
      else if (r === 'dup') this.message('« ' + t.name + ' » est déjà dans la liste.', 'error');
      else this.message(MAX_ENTRIES + ' participants au maximum.', 'error');
    },

    remove(id) {
      if (this.running) return;
      this.data.entries = this.data.entries.filter((e) => e.id !== id);
      this.changed();
    },

    rename(id, name) {
      const e = this.entry(id);
      if (!e) return;
      e.name = String(name).trim().slice(0, 40) || 'Sans nom';
      this.save();
      this.renderRoster();
      this.renderResults();
      arena.refreshSlotOptions();
    },

    async clear() {
      if (this.running || (!this.data.entries.length && !this.data.run)) return;
      if (!(await ask('Retirer tous les participants et effacer les résultats du tournoi ?', 'Tout retirer'))) return;
      this.data.entries = [];
      this.data.run = null;
      this.message('');
      this.changed();
    },

    /** Après un changement de la liste des participants. */
    changed() {
      this.save();
      this.render();
      arena.refreshSlotOptions();
    },

    render() {
      this.renderRoster();
      this.renderAddSource();
      this.renderEstimate();
      this.renderResults();
    },

    renderAddSource() {
      const sel = $('#tour-add-source');
      const exclude = this.data.entries.map((e) => 'tour:' + e.id).concat(['pilot']);
      fillSelect(sel, sel.value || 'ex:ex-sentinelle', false, exclude);
    },

    renderRoster() {
      const table = $('#tour-roster');
      table.textContent = '';
      const entries = this.data.entries;
      $('#tour-count').textContent = entries.length ? '(' + entries.length + ')' : '';
      if (!entries.length) {
        table.appendChild(el('tbody', null, el('tr', null, el('td', { class: 'empty' }, 'Aucun participant pour l\'instant.'))));
        return;
      }
      const counts = new Map();
      for (const e of entries) counts.set(e.name.toLowerCase(), (counts.get(e.name.toLowerCase()) || 0) + 1);
      // programmes identiques sous des noms différents (copie d'un camarade ou d'un exemple non modifié)
      const sigs = new Map();
      for (const e of entries) {
        const k = JSON.stringify(e.workspace);
        if (!sigs.has(k)) sigs.set(k, []);
        sigs.get(k).push(e);
      }
      const twins = (e) => sigs.get(JSON.stringify(e.workspace)).filter((o) => o !== e);
      table.appendChild(el('thead', null, el('tr', null, el('th', null, '#'), el('th', null, 'Nom'), el('th', null, 'Provenance'), el('th', null, ''))));
      const tb = el('tbody');
      entries.forEach((e, i) => {
        const lower = e.name.toLowerCase();
        const warn = counts.get(lower) > 1 || GENERIC_NAMES.includes(lower);
        const input = el('input', {
          type: 'text', value: e.name, maxlength: '40', class: warn ? 'warn' : '',
          'aria-label': 'Nom du participant ' + (i + 1),
          title: warn ? 'Plusieurs tanks portent ce nom (ou c\'est le nom par défaut) : renomme-le pour le reconnaître.' : '',
        });
        input.addEventListener('change', () => this.rename(e.id, input.value));
        tb.appendChild(el('tr', null,
          el('td', { class: 'num' }, String(i + 1)),
          el('td', null, el('div', { class: 'name-cell' }, el('span', { class: 'dot', style: 'background:' + e.color }), input, warn ? el('span', { class: 'warn-icon', title: input.title }, '⚠') : null)),
          el('td', { class: 'muted', title: e.origin }, e.origin,
            twins(e).length ? el('div', { class: 'twin', title: 'Les programmes sont strictement identiques.' }, '⚠ même programme que ' + twins(e).map((o) => o.name).join(', ')) : null),
          el('td', null, el('button', { class: 'btn small danger', title: 'Retirer', 'aria-label': 'Retirer ' + e.name, onclick: () => this.remove(e.id) }, '✕'))));
      });
      table.appendChild(tb);
    },

    renderEstimate() {
      const n = this.data.entries.length;
      const pairs = (n * (n - 1)) / 2;
      const total = pairs * this.data.rounds;
      $('#tour-estimate').textContent = n < 2
        ? 'Il faut au moins 2 participants.'
        : n + ' participants : ' + pairs + ' rencontre' + (pairs > 1 ? 's' : '') + ', soit ' + total + ' manche' + (total > 1 ? 's' : '') + ' à calculer.';
      if (!this.running) $('#tour-run').disabled = n < 2;
    },

    async run() {
      const entries = this.data.entries.slice();
      if (entries.length < 2 || this.running) return;
      if (arena.state === 'running') arena.pause();
      this.running = true;
      this.cancel = false;
      const specs = new Map();
      for (const e of entries) {
        const spec = { name: e.name, color: e.color, source: 'tour:' + e.id, code: '' };
        try {
          spec.code = B.compileState(e.workspace, true);
        } catch (err) {
          spec.error = 'programme illisible : ' + err.message;
        }
        specs.set(e.id, spec);
      }
      const ids = entries.map((e) => e.id);
      const run = {
        at: new Date().toISOString(),
        baseSeed: randomSeed(),
        rounds: this.data.rounds,
        duration: this.data.duration,
        ids,
        manches: [],
        complete: false,
      };
      run.manches = T.schedule(ids, run.rounds, run.baseSeed);

      const btn = $('#tour-run');
      const bar = $('#tour-progress');
      const txt = $('#tour-progress-text');
      btn.textContent = '⏹ Arrêter';
      bar.hidden = false;
      txt.hidden = false;
      bar.max = run.manches.length;
      bar.value = 0;
      const yieldUI = () => new Promise((r) => setTimeout(r, 0));
      let t0 = performance.now();
      let done = 0;
      for (const m of run.manches) {
        if (this.cancel) break;
        m.result = T.playManche([specs.get(m.a), specs.get(m.b)], m.seed, run.duration);
        done++;
        if (performance.now() - t0 > 30) {
          bar.value = done;
          txt.textContent = 'Manche ' + done + ' / ' + run.manches.length + '…';
          await yieldUI();
          t0 = performance.now();
        }
      }
      run.complete = done === run.manches.length;
      this.data.run = run;
      this.running = false;
      btn.textContent = '🏆 Lancer le tournoi';
      bar.hidden = true;
      txt.hidden = true;
      this.filter = '';
      this.save();
      this.render();
      if (done) $('#tour-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    isStale() {
      const run = this.data.run;
      if (!run) return false;
      const now = this.data.entries.map((e) => e.id).sort().join(',');
      return run.ids.slice().sort().join(',') !== now;
    },

    renderResults() {
      const run = this.data.run;
      const box = $('#tour-results');
      if (!run) { box.hidden = true; return; }
      box.hidden = false;
      const rows = T.standings(run.ids, run.manches);
      const played = run.manches.filter((m) => m.result).length;
      const date = new Date(run.at);
      let meta = run.ids.length + ' participants · ' + played + ' manche' + (played > 1 ? 's' : '') +
        (run.complete ? '' : ' (tournoi interrompu)') + ' · ' + run.rounds + ' par rencontre, ' + fmtTime(run.duration) + ' chacune';
      if (!isNaN(date)) meta += ' · ' + date.toLocaleDateString('fr-FR') + ' à ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      if (this.isStale()) meta += ' — ⚠ les participants ont changé depuis : relance le tournoi pour mettre le classement à jour.';
      $('#tour-meta').textContent = meta;

      const table = $('#tour-table');
      table.textContent = '';
      table.appendChild(el('thead', null, el('tr', null,
        el('th', null, '#'), el('th', null, 'Tank'), el('th', { title: 'Points' }, 'Pts'),
        el('th', { title: 'Victoires' }, 'V'), el('th', { title: 'Matchs nuls' }, 'N'), el('th', { title: 'Défaites' }, 'D'),
        el('th', null, 'Dégâts infligés'), el('th', null, 'Dégâts reçus'))));
      const tb = el('tbody');
      for (const r of rows) {
        tb.appendChild(el('tr', { class: r.rank === 1 ? 'winner' : '' },
          el('td', null, String(r.rank) + (r.rank === 1 ? ' 🏆' : '')),
          el('td', null, el('span', { class: 'dot', style: 'background:' + this.colorOf(r.id) + ';margin-right:6px' }), this.nameOf(r.id),
            r.broken ? el('span', { class: 'warn-icon', title: 'Programme en panne pendant ' + r.broken + ' manche(s)' }, ' ⚠') : null),
          el('td', null, el('b', null, String(r.points))),
          el('td', null, String(r.wins)), el('td', null, String(r.draws)), el('td', null, String(r.losses)),
          el('td', null, String(r.dealt)), el('td', null, String(r.taken))));
      }
      table.appendChild(tb);

      const filter = $('#tour-filter');
      filter.textContent = '';
      filter.appendChild(el('option', { value: '' }, 'tous les participants'));
      for (const r of rows) filter.appendChild(el('option', { value: r.id }, this.nameOf(r.id)));
      filter.value = this.filter;
      if (filter.value !== this.filter) this.filter = '';
      $('#tour-final').disabled = rows.filter((r) => this.entry(r.id)).length < 2;
      this.renderPairs();
    },

    outcome(m) {
      const r = m.result;
      if (!r) return 'pas jouée';
      if (r.winner < 0) return 'match nul (' + r.damage[0] + ' – ' + r.damage[1] + ' dégâts)';
      const w = r.winner === 0 ? m.a : m.b;
      return 'victoire de ' + this.nameOf(w) + ' (' + Math.max(r.damage[0], r.damage[1]) + ' dégâts contre ' + Math.min(r.damage[0], r.damage[1]) + ')';
    },

    renderPairs() {
      const run = this.data.run;
      const ul = $('#tour-pairs');
      ul.textContent = '';
      if (!run) return;
      const pairIds = Array.from(new Set(run.manches.map((m) => m.pair)));
      const LIMIT = 200;
      let shown = 0;
      for (const p of pairIds) {
        const s = T.pairSummary(run.manches, p);
        if (!s || (this.filter && s.x !== this.filter && s.y !== this.filter)) continue;
        if (shown >= LIMIT) {
          ul.appendChild(el('li', { class: 'hint' }, 'Liste raccourcie : choisis un participant pour voir toutes ses rencontres.'));
          break;
        }
        shown++;
        const name = (id, win, right) => el('span', { class: 'pn' + (right ? ' right' : '') + (win ? ' win' : '') },
          right ? null : el('span', { class: 'dot', style: 'background:' + this.colorOf(id) }),
          el('span', { class: 'ellipsis' }, this.nameOf(id)),
          right ? el('span', { class: 'dot', style: 'background:' + this.colorOf(id) }) : null);
        ul.appendChild(el('li', { class: 'pair' },
          name(s.x, s.winsX > s.winsY, false),
          el('span', { class: 'pscore', title: s.draws ? s.draws + ' match(s) nul(s)' : '' }, s.winsX + ' – ' + s.winsY + (s.draws ? '*' : '')),
          name(s.y, s.winsY > s.winsX, true),
          el('span', { class: 'manches' }, s.manches.map((m, k) => el('button', {
            class: 'btn small',
            title: 'Revoir la manche ' + (k + 1) + ' : ' + this.outcome(m),
            disabled: !m.result || !this.entry(m.a) || !this.entry(m.b),
            onclick: () => this.watch(m),
          }, '▶ ' + (k + 1))))));
      }
      if (!shown) ul.appendChild(el('li', { class: 'hint' }, 'Aucune rencontre.'));
    },

    /** Rejoue une manche dans l'arène, à l'identique. */
    watch(m) {
      const run = this.data.run;
      if (!run || !this.entry(m.a) || !this.entry(m.b)) return;
      if (editor.mission) editor.exitMission();
      settings.duration = run.duration;
      $('#duration').value = String(run.duration);
      arena.seed = m.seed;
      settings.seed = m.seed;
      $('#seed').value = String(m.seed);
      arena.setSlots(['tour:' + m.a, 'tour:' + m.b, '', '']);
      saveSettings();
      showView('arene');
      arena.rebuild();
      arena.play();
    },

    /** Les quatre premiers s'affrontent dans l'arène. */
    finale() {
      const run = this.data.run;
      if (!run) return;
      const top = T.standings(run.ids, run.manches).filter((r) => this.entry(r.id)).slice(0, 4);
      if (top.length < 2) return;
      if (editor.mission) editor.exitMission();
      settings.duration = run.duration;
      $('#duration').value = String(run.duration);
      arena.setSlots(top.map((r) => 'tour:' + r.id));
      showView('arene');
      arena.newMatch(true);
    },

    exportCsv() {
      const run = this.data.run;
      if (!run) return;
      const cell = (v) => {
        const str = String(v);
        return /[;"\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
      };
      const lines = [['Rang', 'Tank', 'Points', 'Victoires', 'Nuls', 'Défaites', 'Dégâts infligés', 'Dégâts reçus', 'Manches jouées'].join(';')];
      for (const r of T.standings(run.ids, run.manches)) {
        lines.push([r.rank, cell(this.nameOf(r.id)), r.points, r.wins, r.draws, r.losses, r.dealt, r.taken, r.played].join(';'));
      }
      const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'classement-tournoi.csv' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };

  /* =====================================================================
   * CLAVIER
   * ===================================================================== */

  const KEYMAP = [
    ['KeyW', CMD.MOVE_FORWARD], ['ArrowUp', CMD.MOVE_FORWARD],
    ['KeyS', CMD.MOVE_BACKWARD], ['ArrowDown', CMD.MOVE_BACKWARD],
    ['KeyA', CMD.ROTATE_TANK_CCW], ['ArrowLeft', CMD.ROTATE_TANK_CCW],
    ['KeyD', CMD.ROTATE_TANK_CW], ['ArrowRight', CMD.ROTATE_TANK_CW],
    ['Space', CMD.FIRE],
    ['KeyQ', CMD.ROTATE_GUN_CCW], ['KeyE', CMD.ROTATE_GUN_CW],
    ['KeyZ', CMD.ROTATE_RADAR_CCW], ['KeyX', CMD.ROTATE_RADAR_CW],
    ['KeyR', CMD.LOCK_GUN], ['KeyT', CMD.UNLOCK_GUN],
    ['KeyF', CMD.LOCK_RADAR], ['KeyG', CMD.UNLOCK_RADAR],
  ];
  const KEY_CODES = new Set(KEYMAP.map((k) => k[0]));
  const AZERTY = { KeyW: 'Z', KeyA: 'Q', KeyQ: 'A', KeyZ: 'W', KeyS: 'S', KeyD: 'D', KeyE: 'E', KeyX: 'X', KeyR: 'R', KeyT: 'T', KeyF: 'F', KeyG: 'G' };
  let keyLabel = (code) => {
    const fr = (navigator.language || '').toLowerCase().startsWith('fr');
    if (fr && AZERTY[code]) return AZERTY[code];
    return code.replace(/^Key/, '');
  };

  function keysHelpHtml() {
    const k = (c) => '<kbd>' + keyLabel(c) + '</kbd>';
    return '<table class="ref keys-table"><tbody>' +
      '<tr><td>' + k('KeyW') + ' ' + k('KeyS') + ' ou <kbd>↑</kbd> <kbd>↓</kbd></td><td>avancer / reculer</td></tr>' +
      '<tr><td>' + k('KeyA') + ' ' + k('KeyD') + ' ou <kbd>←</kbd> <kbd>→</kbd></td><td>tourner le tank</td></tr>' +
      '<tr><td><kbd>Espace</kbd></td><td>tirer</td></tr>' +
      '<tr><td>' + k('KeyQ') + ' ' + k('KeyE') + '</td><td>tourner le canon</td></tr>' +
      '<tr><td>' + k('KeyZ') + ' ' + k('KeyX') + '</td><td>tourner le radar</td></tr>' +
      '<tr><td>' + k('KeyR') + ' / ' + k('KeyT') + '</td><td>verrouiller / déverrouiller le canon</td></tr>' +
      '<tr><td>' + k('KeyF') + ' / ' + k('KeyG') + '</td><td>verrouiller / déverrouiller le radar</td></tr>' +
      '</tbody></table>';
  }

  function keysHelpInline() {
    const k = (c) => '<kbd>' + keyLabel(c) + '</kbd>';
    return '🎮 <b>Pilote clavier</b> : ' + k('KeyW') + k('KeyA') + k('KeyS') + k('KeyD') + ' ou flèches pour rouler · <kbd>Espace</kbd> tirer · ' +
      k('KeyQ') + k('KeyE') + ' canon · ' + k('KeyZ') + k('KeyX') + ' radar · ' + k('KeyR') + '/' + k('KeyT') + ' (dé)verrouiller le canon · ' +
      k('KeyF') + '/' + k('KeyG') + ' (dé)verrouiller le radar';
  }

  /* =====================================================================
   * ARÈNE
   * ===================================================================== */

  const arena = {
    match: null,
    renderer: null,
    state: 'idle', // idle | running | paused | finished
    seed: settings.seed,
    specs: [],
    acc: 0,
    last: 0,
    raf: 0,
    visible: false,
    dirty: true,
    keys: new Set(),
    pendingLog: [],
    lastBoard: 0,
    boardNodes: [],
    resultsTimer: 0,
    cupRunning: false,
    cupCancel: false,
    tracker: null,

    init() {
      this.canvas = $('#arena');
      this.renderer = new window.ArenaRenderer(this.canvas);
      this.renderer.options.radar = settings.radar;
      this.renderer.options.labels = settings.labels;
      this.renderer.options.debug = settings.debug;

      // participants
      const slots = $('#slots');
      this.slotSelects = [];
      for (let i = 0; i < 4; i++) {
        const sel = el('select', { 'aria-label': 'Participant ' + (i + 1) });
        sel.addEventListener('change', () => {
          settings.slots[i] = sel.value;
          saveSettings();
          this.updatePilotHelp();
          this.rebuild();
        });
        this.slotSelects.push(sel);
        slots.appendChild(el('div', { class: 'slot' }, el('span', { class: 'num' }, String(i + 1)), sel));
      }
      this.refreshSlotOptions();

      $('#duration').value = String(settings.duration);
      $('#duration').addEventListener('change', (e) => { settings.duration = Number(e.target.value); saveSettings(); this.rebuild(); });
      $('#seed').value = String(this.seed);
      $('#seed').addEventListener('change', (e) => {
        const v = Math.max(1, Math.min(999999, Math.round(Number(e.target.value)) || 1));
        e.target.value = String(v);
        this.seed = v;
        settings.seed = v;
        saveSettings();
        this.rebuild();
      });
      $('#speed').value = String(settings.speed);
      if (!$('#speed').value) $('#speed').value = '1';
      $('#speed').addEventListener('change', (e) => { settings.speed = Number(e.target.value); saveSettings(); });
      for (const [id, key] of [['#opt-radar', 'radar'], ['#opt-labels', 'labels'], ['#opt-debug', 'debug']]) {
        const box = $(id);
        box.checked = !!settings[key];
        box.addEventListener('change', () => {
          settings[key] = box.checked;
          this.renderer.options[key] = box.checked;
          saveSettings();
          this.draw();
        });
      }

      $('#btn-play').addEventListener('click', () => this.togglePlay());
      $('#btn-step').addEventListener('click', () => this.stepOnce());
      $('#btn-restart').addEventListener('click', () => this.restart());
      $('#btn-new-match').addEventListener('click', () => this.newMatch(true));
      $('#btn-clear-log').addEventListener('click', () => { $('#journal').textContent = ''; });
      $('#btn-cup').addEventListener('click', () => this.toggleCup());
      $('#cup-rounds').value = String(settings.cupRounds);
      $('#cup-rounds').addEventListener('change', (e) => { settings.cupRounds = Number(e.target.value); saveSettings(); });

      $('#mission-dialog').addEventListener('close', () => this.onMissionDialog($('#mission-dialog').returnValue));
      $('#mc-edit').addEventListener('click', () => showView('atelier'));
      $('#mc-quit').addEventListener('click', () => { editor.exitMission(); showView('atelier'); });

      $('#results-dialog').addEventListener('close', () => {
        const v = $('#results-dialog').returnValue;
        if (v === 'replay') this.restart();
        else if (v === 'new') this.newMatch(true);
        else if (v === 'edit') showView('atelier');
      });

      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));
      window.addEventListener('blur', () => this.keys.clear());
      window.addEventListener('resize', () => this.layout());
      if (window.ResizeObserver) new ResizeObserver(() => this.layout()).observe($('.canvas-wrap'));

      this.updatePilotHelp();
    },

    refreshSlotOptions() {
      if (!this.slotSelects) return;
      this.slotSelects.forEach((sel, i) => {
        const v = fillSelect(sel, settings.slots[i] || '', true);
        settings.slots[i] = v;
      });
      fillSelect($('#test-opponent'), settings.opponent, false, ['draft']);
      if (tournament.data) tournament.renderAddSource();
      this.updatePilotHelp();
    },

    setSlots(values) {
      settings.slots = values.slice(0, 4);
      while (settings.slots.length < 4) settings.slots.push('');
      saveSettings();
      this.refreshSlotOptions();
    },

    markDirty() {
      this.dirty = true;
    },

    updatePilotHelp() {
      const box = $('#pilot-help');
      const has = settings.slots.includes('pilot') && !editor.mission;
      box.hidden = !has;
      if (has) box.innerHTML = keysHelpInline();
    },

    onShow() {
      this.visible = true;
      this.layout();
      if (!this.match || (this.dirty && (this.state === 'idle' || this.state === 'finished'))) this.rebuild();
      if (!this.raf) {
        this.last = performance.now();
        this.raf = requestAnimationFrame((t) => this.loop(t));
      }
    },

    onHide() {
      this.visible = false;
      if (this.state === 'running') this.pause();
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.keys.clear();
    },

    layout() {
      const wrap = $('.canvas-wrap');
      if (!wrap || !this.visible) return;
      const aspect = window.ArenaRenderer.aspect;
      const narrow = window.matchMedia('(max-width: 860px)').matches;
      let w = wrap.clientWidth;
      let h = narrow ? w / aspect : wrap.clientHeight;
      if (w / h > aspect) w = h * aspect; else h = w / aspect;
      this.canvas.style.width = Math.floor(w) + 'px';
      this.canvas.style.height = Math.floor(h) + 'px';
      if (narrow) wrap.style.height = Math.floor(h) + 'px';
      else wrap.style.height = '';
      this.renderer.resize();
      this.draw();
    },

    /** Mode mission activé ou désactivé dans l'atelier. */
    onMissionChange() {
      const def = editor.mission;
      $('#mission-card').hidden = !def;
      $('#card-slots').hidden = !!def;
      $('#card-cup').hidden = !!def;
      if (def) {
        $('#mc-num').textContent = '🎓 Mission ' + (M.indexOf(def.id) + 1) + ' / ' + M.MISSIONS.length;
        $('#mc-title').textContent = def.title;
        $('#mc-goal').textContent = '🎯 ' + def.goal;
      }
      this.updatePilotHelp();
      // la partie en cours appartient à l'ancien mode : on la remplace
      clearTimeout(this.resultsTimer);
      this.state = 'idle';
      this.tracker = null;
      this.markDirty();
      if (this.visible) this.rebuild();
    },

    rebuildMission() {
      const def = editor.mission;
      const seed = this.seed;
      const s = M.setup(def, def.randomSeed ? seed : 1);
      const player = resolveSource('draft');
      player.spawn = s.player;
      const specs = [player].concat(s.opponents.map((o) => {
        const sp = resolveSource('ex:' + o.bot);
        sp.name = o.name || sp.name;
        sp.spawn = o.x === undefined ? null : o;
        return sp;
      }));
      this.specs = distinctify(specs);
      this.match = new E.Match({
        entrants: buildEntrants(this.specs, seed),
        seed,
        maxTicks: def.maxTicks,
        onLog: (entry) => this.pendingLog.push(entry),
      });
      this.tracker = new M.Tracker(def, this.match, s.zones);
      this.renderer.attach(this.match, s.zones);
      this.flushFx();
      this.state = 'idle';
      this.acc = 0;
      this.pendingLog.unshift({ tick: 0, tank: -1, kind: 'info', text: 'Mission « ' + def.title + ' » — ' + def.goal });
      const p = this.match.tanks[0];
      if (p.broken) this.logSystem('⚠ ' + p.error, 'error');
      this.overlay('Mission ' + (M.indexOf(def.id) + 1) + ' : ' + def.title, def.goal + ' — clique sur ▶ Lancer');
      this.buildBoard();
      this.updateButtons();
      this.draw();
    },

    /** Prépare une partie (sans la lancer). */
    rebuild() {
      clearTimeout(this.resultsTimer);
      this.dirty = false;
      this.tracker = null;
      if (editor.mission) {
        $('#journal').textContent = '';
        this.pendingLog = [];
        this.keys.clear();
        this.rebuildMission();
        return;
      }
      const specs = distinctify(settings.slots.map(resolveSource).filter(Boolean));
      this.specs = specs;
      $('#journal').textContent = '';
      this.pendingLog = [];
      this.keys.clear();
      if (!specs.length) {
        this.match = null;
        this.renderer.attach(null);
        this.state = 'idle';
        this.overlay('Choisis au moins un participant', 'dans la colonne de droite');
        this.buildBoard();
        this.updateButtons();
        this.draw();
        return;
      }
      const entrants = buildEntrants(specs, this.seed);
      this.match = new E.Match({
        entrants,
        seed: this.seed,
        maxTicks: settings.duration,
        input: () => this.pilotMask(),
        onLog: (entry) => this.pendingLog.push(entry),
      });
      this.renderer.attach(this.match);
      this.flushFx();
      this.state = 'idle';
      this.acc = 0;
      this.pendingLog.unshift({ tick: 0, tank: -1, kind: 'info', text: 'Partie prête — graine ' + this.seed + ', ' + specs.length + ' participant' + (specs.length > 1 ? 's' : '') + '.' });
      for (const t of this.match.tanks) if (t.broken) this.logSystem('⚠ ' + t.name + ' : ' + t.error, 'error');
      this.overlay(specs.length === 1 ? 'Entraînement en solo' : 'Prêt ?', 'Clique sur ▶ Lancer');
      this.buildBoard();
      this.updateButtons();
      this.draw();
    },

    overlay(title, sub) {
      const o = $('#arena-overlay');
      if (!title) { o.hidden = true; o.textContent = ''; return; }
      o.hidden = false;
      o.textContent = '';
      o.appendChild(el('div', null, title, sub ? el('small', null, sub) : null));
    },

    togglePlay() {
      if (this.state === 'running') this.pause();
      else this.play();
    },

    play() {
      audio.unlock();
      if (this.dirty && this.state === 'idle') this.rebuild();
      if (!this.match) return;
      if (this.state === 'finished') this.rebuild();
      this.state = 'running';
      this.overlay(null);
      this.last = performance.now();
      this.acc = 0;
      this.updateButtons();
    },

    pause() {
      if (this.state !== 'running') return;
      this.state = 'paused';
      this.overlay('Pause', 'Clique sur ▶ Reprendre');
      this.updateButtons();
    },

    stepOnce() {
      audio.unlock();
      if (this.dirty && this.state === 'idle') this.rebuild();
      if (!this.match || this.state === 'finished') return;
      if (this.state === 'running') this.pause();
      if (this.state === 'idle') this.state = 'paused';
      this.overlay(null);
      this.tick();
      this.updateButtons();
      this.updateBoard(true);
      this.flushLog();
      this.draw();
    },

    restart() {
      this.rebuild();
      this.play();
    },

    newMatch(start) {
      this.seed = randomSeed();
      settings.seed = this.seed;
      $('#seed').value = String(this.seed);
      saveSettings();
      this.rebuild();
      if (start) this.play();
    },

    tick() {
      const m = this.match;
      m.step();
      this.flushFx();
      if (this.tracker) {
        const r = this.tracker.update();
        if (r) this.onMissionEnd(r);
        return;
      }
      if (m.finished) this.onFinished();
    },

    onMissionEnd(r) {
      const def = editor.mission;
      this.state = 'finished';
      this.updateButtons();
      this.updateBoard(true);
      if (!def) return;
      if (r.ok) {
        missionsView.markDone(def.id);
        this.logSystem('⭐ Mission réussie !');
        audio.play([{ t: 'end' }], 1);
        editor.renderMission();
      } else {
        this.logSystem('Mission non réussie : ' + r.reason, 'error');
      }
      editor.setMissionStatus(r);
      this.resultsTimer = setTimeout(() => this.showMissionDialog(r), r.ok ? 800 : 500);
    },

    showMissionDialog(r) {
      const def = editor.mission;
      if (!def || !this.visible) return;
      const i = M.indexOf(def.id);
      const last = i === M.MISSIONS.length - 1;
      let title;
      let text;
      let tip;
      let buttons;
      if (r.ok && last) {
        title = '🏆 Parcours terminé !';
        text = 'Bravo, tu as battu la Sentinelle ! Tu sais maintenant programmer un tank complet.';
        tip = 'Dans l\'atelier libre, tous les blocs sont à toi : invente ton propre tank, puis essaie de battre le Chasseur.';
        buttons = [['list', '🎓 Missions'], ['free', '🛠️ Aller à l\'atelier libre', 'primary']];
      } else if (r.ok) {
        title = '⭐ Mission réussie !';
        text = 'Bravo ! Tu as découvert : ' + def.concept.toLowerCase() + '.';
        tip = 'Prochaine mission : « ' + M.MISSIONS[i + 1].title + ' ».';
        buttons = [['edit', '🛠️ Atelier'], ['replay', '↺ Revoir'], ['next', 'Mission suivante ▶', 'primary']];
      } else {
        title = '😕 Pas encore…';
        text = r.reason;
        tip = (def.randomSeed ? 'Les positions de départ changent à chaque essai. ' : '') + 'Modifie ton programme dans l\'atelier, ou demande un indice.';
        buttons = [['retry', '↺ Réessayer'], ['edit', '🛠️ Modifier mon programme', 'primary']];
      }
      $('#md-title').textContent = title;
      $('#md-text').textContent = text;
      $('#md-tip').textContent = tip;
      const box = $('#md-buttons');
      box.textContent = '';
      for (const [value, label, cls] of buttons) box.appendChild(el('button', { value, class: 'btn' + (cls ? ' ' + cls : '') }, label));
      const d = $('#mission-dialog');
      if (!d.open) {
        d.returnValue = '';
        d.showModal();
      }
    },

    onMissionDialog(value) {
      const def = editor.mission;
      if (value === 'next' && def) {
        const next = M.MISSIONS[M.indexOf(def.id) + 1];
        if (next) missionsView.start(next.id);
      } else if (value === 'replay') {
        this.restart();
      } else if (value === 'retry') {
        this.newMatch(true);
      } else if (value === 'edit') {
        showView('atelier');
      } else if (value === 'free') {
        editor.exitMission();
        showView('atelier');
      } else if (value === 'list') {
        showView('missions');
      }
    },

    flushFx() {
      const m = this.match;
      if (!m || !m.fx.length) return;
      const fx = m.fx;
      m.fx = [];
      this.renderer.consumeFx(fx);
      audio.play(fx, settings.speed);
    },

    loop(now) {
      this.raf = requestAnimationFrame((t) => this.loop(t));
      const dt = Math.min(100, Math.max(0, now - this.last));
      this.last = now;
      const tickMs = 1000 / E.C.TICKS_PER_SECOND;
      const speed = settings.speed || 1;
      if (this.state === 'running' && this.match) {
        this.acc += dt * speed;
        const maxSteps = Math.max(3, Math.ceil(speed * 3));
        let n = 0;
        while (this.acc >= tickMs && n < maxSteps && this.state === 'running') {
          this.acc -= tickMs;
          n++;
          this.tick();
        }
        if (n >= maxSteps) this.acc = Math.min(this.acc, tickMs);
      }
      const running = this.state === 'running';
      this.renderer.update(running ? (dt * speed) / tickMs : 0);
      this.draw(running ? this.acc / tickMs : 1);
      this.updateHud();
      this.updateBoard(false);
      this.flushLog();
    },

    draw(alpha) {
      this.renderer.draw(alpha === undefined ? 1 : alpha);
    },

    onFinished() {
      this.state = 'finished';
      this.updateButtons();
      this.updateBoard(true);
      const r = this.match.results;
      // erreur du tank de l'atelier ?
      const idx = this.specs.findIndex((s) => s.source === 'draft');
      if (idx >= 0) {
        const t = this.match.tanks[idx];
        editor.lastError = t.broken ? t.error : null;
        editor.refreshStatus();
      }
      const winner = r.winner >= 0 ? this.match.tanks[r.winner] : null;
      this.logSystem('Fin de la partie : ' + (winner ? '🏆 ' + winner.name + ' gagne.' : (this.match.tanks.length > 1 ? 'égalité.' : 'entraînement terminé.')));
      this.resultsTimer = setTimeout(() => this.showResults(), 900);
    },

    showResults() {
      const m = this.match;
      if (!m || !m.results) return;
      const r = m.results;
      const winner = r.winner >= 0 ? m.tanks[r.winner] : null;
      let summary;
      if (m.tanks.length === 1) summary = 'Entraînement terminé.';
      else if (winner) summary = '🏆 Victoire de ' + winner.name + ' !';
      else summary = '🤝 Égalité parfaite !';
      summary += ' ' + (r.early ? 'Il ne reste qu\'un tank en état de rouler.' : 'Le temps est écoulé (' + fmtTime(r.ticks) + ').');
      $('#results-summary').textContent = summary;
      const table = $('#results-table');
      table.textContent = '';
      table.appendChild(el('thead', null, el('tr', null,
        el('th', null, '#'), el('th', null, 'Tank'), el('th', null, 'Dégâts infligés'), el('th', null, 'Santé'),
        el('th', null, 'Éliminations'), el('th', null, 'Tirs réussis'), el('th', null, 'Survie'))));
      const tb = el('tbody');
      r.ranking.forEach((t, i) => {
        const surv = t.alive ? '✔ jusqu\'au bout' : 'détruit à ' + fmtTime(t.deathTick);
        tb.appendChild(el('tr', { class: t.index === r.winner ? 'winner' : '' },
          el('td', null, String(i + 1)),
          el('td', null, el('span', { class: 'dot', style: 'background:' + t.color + ';margin-right:6px' }), t.name, t.broken ? ' ⚠' : ''),
          el('td', null, String(t.damageDealt)),
          el('td', null, String(t.health)),
          el('td', null, String(t.kills)),
          el('td', null, t.shots ? t.hits + ' / ' + t.shots + ' (' + Math.round((100 * t.hits) / t.shots) + ' %)' : '—'),
          el('td', null, surv)));
      });
      table.appendChild(tb);
      const d = $('#results-dialog');
      if (!d.open && this.visible) {
        d.returnValue = '';
        d.showModal();
      }
    },

    updateButtons() {
      const b = $('#btn-play');
      if (this.state === 'running') b.textContent = '⏸ Pause';
      else if (this.state === 'paused') b.textContent = '▶ Reprendre';
      else if (this.state === 'finished') b.textContent = '▶ Relancer';
      else b.textContent = '▶ Lancer';
      b.disabled = !this.match;
      $('#btn-step').disabled = !this.match || this.state === 'finished';
      const labels = { idle: 'Prêt', running: 'En cours', paused: 'En pause', finished: 'Terminé' };
      $('#hud-state').textContent = labels[this.state];
    },

    updateHud() {
      const m = this.match;
      $('#hud-time').textContent = m ? fmtTime(m.tick) + ' / ' + fmtTime(m.maxTicks) : '0:00';
      $('#hud-tick').textContent = m ? 'tick ' + m.tick + ' · graine ' + this.seed : '';
    },

    /* --- Tableau de bord --- */

    buildBoard() {
      const box = $('#scoreboard');
      box.textContent = '';
      this.boardNodes = [];
      if (!this.match) {
        box.appendChild(el('p', { class: 'hint' }, 'Aucun participant.'));
        return;
      }
      for (const t of this.match.tanks) {
        const n = {
          root: el('div', { class: 'score', style: '--c:' + t.color }),
          state: el('span', { class: 'state' }),
          hp: el('i'),
          hpText: el('b'),
          dmg: el('b'),
          shots: el('b'),
          queue: el('b'),
          err: el('div', { class: 'err', hidden: true }),
        };
        n.root.append(
          el('div', { class: 'top' }, el('span', { class: 'dot', style: 'background:' + t.color }), el('span', { class: 'name', title: t.name }, (t.index + 1) + '. ' + t.name), n.state),
          el('div', { class: 'hp' }, n.hp),
          el('div', { class: 'stats' },
            el('span', null, '❤ ', n.hpText),
            el('span', null, '💥 infligés ', n.dmg),
            el('span', null, '🎯 ', n.shots),
            el('span', null, '📋 file ', n.queue)),
          n.err);
        box.appendChild(n.root);
        this.boardNodes.push(n);
      }
      this.updateBoard(true);
    },

    updateBoard(force) {
      const now = performance.now();
      if (!force && now - this.lastBoard < 150) return;
      this.lastBoard = now;
      const m = this.match;
      if (!m) return;
      if (this.tracker) {
        const ul = $('#mc-progress');
        ul.textContent = '';
        for (const line of this.tracker.progress()) ul.appendChild(el('li', null, line));
        ul.appendChild(el('li', null, '⏱ Temps : ' + fmtTime(m.tick) + ' / ' + fmtTime(m.maxTicks)));
      }
      m.tanks.forEach((t, i) => {
        const n = this.boardNodes[i];
        if (!n) return;
        let state;
        let bad = false;
        if (!t.alive) { state = '💀 détruit à ' + fmtTime(t.deathTick); bad = true; }
        else if (t.broken) { state = '⚠ en panne'; bad = true; }
        else if (t.pilot) state = '🎮 clavier';
        else state = 'en jeu';
        if (n.state.textContent !== state) n.state.textContent = state;
        n.state.className = 'state' + (bad ? ' bad' : '');
        n.root.classList.toggle('dead', !t.alive);
        const hp = t.health / E.C.MAX_HEALTH;
        n.hp.style.width = (hp * 100).toFixed(0) + '%';
        n.hp.style.background = hp > 0.5 ? 'var(--ok)' : hp > 0.25 ? 'var(--warn)' : 'var(--danger)';
        n.hpText.textContent = String(t.health);
        n.dmg.textContent = String(t.damageDealt);
        n.shots.textContent = t.hits + '/' + t.shots;
        n.queue.textContent = String(t.queue.reduce((s, e) => s + e.n, 0));
        if (t.error) {
          n.err.hidden = false;
          n.err.textContent = '⚠ ' + t.error;
        } else {
          n.err.hidden = true;
        }
      });
    },

    /* --- Journal --- */

    logSystem(text, kind) {
      this.pendingLog.push({ tick: this.match ? this.match.tick : 0, tank: -1, text, kind: kind || 'info' });
    },

    flushLog() {
      if (!this.pendingLog.length) return;
      const box = $('#journal');
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
      const batch = this.pendingLog.splice(0, 80);
      if (this.pendingLog.length > 400) this.pendingLog.splice(0, this.pendingLog.length - 400);
      const frag = document.createDocumentFragment();
      for (const e of batch) {
        const t = e.tank >= 0 && this.match ? this.match.tanks[e.tank] : null;
        frag.appendChild(el('div', { class: 'e ' + (e.kind || '') },
          el('span', { class: 't' }, '[' + fmtTimePrecise(e.tick) + '] '),
          t ? el('span', { class: 'who', style: 'color:' + t.color }, (t.index + 1) + '. ' + t.name + ' : ') : null,
          e.text));
      }
      box.appendChild(frag);
      while (box.childElementCount > 400) box.firstElementChild.remove();
      if (nearBottom) box.scrollTop = box.scrollHeight;
    },

    /* --- Clavier --- */

    onKey(e, down) {
      if (!this.visible) return;
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) || $('#results-dialog').open || $('#confirm-dialog').open) return;
      if (editor.mission || !settings.slots.includes('pilot')) return;
      if (!KEY_CODES.has(e.code)) return;
      e.preventDefault();
      if (down) this.keys.add(e.code);
      else this.keys.delete(e.code);
    },

    pilotMask() {
      let m = 0;
      for (const [code, bit] of KEYMAP) if (this.keys.has(code)) m |= bit;
      return m;
    },

    /* --- Championnat express --- */

    toggleCup() {
      if (this.cupRunning) { this.cupCancel = true; return; }
      this.runCup();
    },

    async runCup() {
      const box = $('#cup-results');
      box.textContent = '';
      const specs = distinctify(settings.slots.map(resolveSource).filter((s) => s && !s.pilot));
      if (specs.length < 2) {
        box.appendChild(el('p', { class: 'hint' }, 'Il faut au moins deux tanks programmés parmi les participants (le pilote clavier ne compte pas).'));
        return;
      }
      if (this.state === 'running') this.pause();
      this.cupRunning = true;
      this.cupCancel = false;
      const btn = $('#btn-cup');
      btn.textContent = '⏹ Arrêter';
      const progress = $('#cup-progress');
      progress.hidden = false;
      const rounds = settings.cupRounds || 25;
      progress.max = rounds;
      progress.value = 0;
      const stats = specs.map((s) => ({ name: s.name, color: s.color, wins: 0, draws: 0, damage: 0, survived: 0, kills: 0, broken: 0, rounds: 0 }));
      const base = this.seed;
      let done = 0;
      const yieldUI = () => new Promise((r) => setTimeout(r, 0));
      for (let r = 0; r < rounds && !this.cupCancel; r++) {
        const seed = ((base + r * 7919) % 999999) + 1;
        const match = new E.Match({ entrants: buildEntrants(specs, seed), seed, maxTicks: settings.duration });
        let t0 = performance.now();
        while (!match.finished) {
          match.step();
          match.fx.length = 0;
          if (performance.now() - t0 > 14) {
            await yieldUI();
            if (this.cupCancel) break;
            t0 = performance.now();
          }
        }
        if (!match.finished) break;
        const res = match.results;
        for (const t of res.ranking) {
          const s = stats[t.index];
          s.rounds++;
          s.damage += t.damageDealt;
          s.kills += t.kills;
          if (t.alive) s.survived++;
          if (t.broken) s.broken++;
        }
        if (res.winner >= 0) stats[res.winner].wins++;
        else for (const s of stats) s.draws++;
        done++;
        progress.value = done;
      }
      this.cupRunning = false;
      btn.textContent = '🏆 Lancer';
      progress.hidden = true;
      if (!done) return;
      const sorted = stats.slice().sort((a, b) => b.wins - a.wins || b.damage - a.damage);
      box.appendChild(el('p', { class: 'hint' }, done + ' manche' + (done > 1 ? 's' : '') + ' jouée' + (done > 1 ? 's' : '') + (this.cupCancel ? ' (arrêté)' : '') + ', durée max ' + fmtTime(settings.duration) + ' chacune.'));
      const table = el('table', { class: 'cup' },
        el('thead', null, el('tr', null, el('th', null, '#'), el('th', null, 'Tank'), el('th', { title: 'Victoires' }, 'Vict.'), el('th', { title: 'Dégâts infligés en moyenne par manche' }, 'Dégâts'), el('th', { title: 'Pourcentage de manches terminées en vie' }, 'Survie'))),
        el('tbody', null, sorted.map((s, i) => el('tr', null,
          el('td', null, String(i + 1)),
          el('td', null, el('span', { class: 'dot', style: 'background:' + s.color + ';margin-right:6px' }), s.name, s.broken ? ' ⚠' : ''),
          el('td', null, String(s.wins)),
          el('td', null, (s.damage / s.rounds).toFixed(1)),
          el('td', null, Math.round((100 * s.survived) / s.rounds) + ' %')))));
      box.appendChild(el('div', { class: 'table-wrap' }, table));
      const draws = stats[0].draws;
      if (draws) box.appendChild(el('p', { class: 'hint' }, draws + ' manche' + (draws > 1 ? 's' : '') + ' sans vainqueur (égalité).'));
      if (stats.some((s) => s.broken)) box.appendChild(el('p', { class: 'hint' }, '⚠ = le programme est tombé en panne pendant au moins une manche.'));
    },
  };

  /* =====================================================================
   * NAVIGATION
   * ===================================================================== */

  const VIEWS = ['missions', 'atelier', 'arene', 'tournoi', 'guide'];

  function showView(name) {
    if (!VIEWS.includes(name)) name = 'missions';
    for (const v of VIEWS) {
      $('#view-' + v).classList.toggle('active', v === name);
      $('#tab-' + v).setAttribute('aria-selected', String(v === name));
    }
    settings.view = name;
    saveSettings();
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (name === 'atelier') {
      Blockly.svgResize(editor.ws);
      if (editor.needsCenter) {
        editor.needsCenter = false;
        editor.ws.scrollCenter();
      }
    }
    if (name === 'missions') missionsView.render();
    if (name === 'tournoi') tournament.render();
    if (name === 'arene') arena.onShow();
    else arena.onHide();
  }

  function initSound() {
    const b = $('#btn-sound');
    const render = () => {
      b.textContent = audio.enabled ? '🔊' : '🔇';
      b.setAttribute('aria-pressed', String(audio.enabled));
    };
    b.addEventListener('click', () => {
      audio.setEnabled(!audio.enabled);
      settings.sound = audio.enabled;
      saveSettings();
      render();
    });
    render();
  }

  function boot() {
    if (!Blockly || !window.javascript || !B) throw new Error('Blockly n\'a pas pu être chargé.');
    editor.init();
    tournament.init();
    arena.init();
    missionsView.init();
    initSound();
    if (settings.mission && M.get(settings.mission)) editor.enterMission(M.get(settings.mission));
    else settings.mission = null;
    arena.onMissionChange();
    $('#guide-keys').innerHTML = keysHelpHtml();
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then((map) => {
        keyLabel = (code) => (map.get(code) || code.replace(/^Key/, '')).toUpperCase();
        $('#guide-keys').innerHTML = keysHelpHtml();
        arena.updatePilotHelp();
      }).catch(() => {});
    }
    for (const v of VIEWS) $('#tab-' + v).addEventListener('click', () => showView(v));
    window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
    const initial = location.hash.slice(1);
    showView(VIEWS.includes(initial) ? initial : settings.view);
    // pour le débogage depuis la console
    window.TankoBlocs = { editor, arena, settings, missionsView, tournament };
  }

  try {
    boot();
  } catch (err) {
    const box = $('#boot-error');
    box.hidden = false;
    box.textContent = 'Erreur au démarrage : ' + (err && err.message ? err.message : err);
    // eslint-disable-next-line no-console
    console.error(err);
  }
})();
