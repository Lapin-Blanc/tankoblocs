/*
 * TankoBlocs — enregistrement des tanks (localStorage) et fichiers .json.
 */
(function (root) {
  'use strict';

  const PREFIX = 'tankoblocs.';
  const FORMAT = 'tankoblocs-tank';

  function read(key, fallback) {
    try {
      const raw = root.localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      root.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const Store = {
    list() {
      const l = read('library', []);
      return Array.isArray(l) ? l.filter((t) => t && t.id && t.workspace) : [];
    },

    get(id) {
      return this.list().find((t) => t.id === id) || null;
    },

    /** Crée ou met à jour un tank ; renvoie le tank enregistré (ou null si échec). */
    save(tank) {
      const list = this.list();
      const entry = {
        id: tank.id || uid(),
        name: String(tank.name || 'Sans nom').slice(0, 40),
        color: tank.color || '#e74c3c',
        workspace: tank.workspace,
        updated: new Date().toISOString(),
      };
      const i = list.findIndex((t) => t.id === entry.id);
      if (i >= 0) list[i] = entry;
      else list.push(entry);
      return write('library', list) ? entry : null;
    },

    remove(id) {
      write('library', this.list().filter((t) => t.id !== id));
    },

    getDraft() { return read('draft', null); },
    setDraft(d) { return write('draft', d); },

    getMissionProgress() {
      const p = read('missions', {});
      return p && typeof p === 'object' ? p : {};
    },
    setMissionProgress(p) { return write('missions', p); },
    getMissionWorkspace(id) { return read('mission.' + id, null); },
    setMissionWorkspace(id, ws) { return write('mission.' + id, ws); },
    clearMissions(ids) {
      write('missions', {});
      for (const id of ids) {
        try { root.localStorage.removeItem(PREFIX + 'mission.' + id); } catch (e) { /* ignoré */ }
      }
    },

    getSettings() { return read('settings', {}); },
    setSettings(s) { return write('settings', s); },

    /** Fichier .json téléchargeable contenant un tank. */
    exportTank(tank) {
      const data = {
        format: FORMAT,
        version: 1,
        name: tank.name,
        color: tank.color,
        workspace: tank.workspace,
        exported: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeFileName(tank.name || 'tank') + '.tank.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    /** Lit un fichier choisi par l'utilisateur ; renvoie { name, color, workspace }. */
    importFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('lecture du fichier impossible'));
        reader.onload = () => {
          try {
            const data = JSON.parse(String(reader.result));
            if (!data || typeof data !== 'object') throw new Error('fichier vide');
            // accepte aussi un état Blockly brut
            const workspace = data.format === FORMAT ? data.workspace : (data.blocks ? data : null);
            if (!workspace || typeof workspace !== 'object') throw new Error('ce fichier ne contient pas de tank TankoBlocs');
            resolve({
              name: String(data.name || file.name.replace(/\.(tank\.)?json$/i, '') || 'Tank importé').slice(0, 40),
              color: /^#[0-9a-f]{6}$/i.test(data.color || '') ? data.color : '#e74c3c',
              workspace,
            });
          } catch (e) {
            reject(new Error(e.message || 'fichier invalide'));
          }
        };
        reader.readAsText(file);
      });
    },
  };

  function safeFileName(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'tank';
  }

  root.TankStore = Store;
})(typeof window !== 'undefined' ? window : globalThis);
