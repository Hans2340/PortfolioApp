/* Persistence in localStorage. Everything stays in the user's browser. */
(function (root) {
  'use strict';
  const KEY = 'portfolio-app:v1';

  const defaults = () => ({
    holdings: [],
    history: [],
    settings: { currency: 'USD', finnhubKey: '', autoRefresh: 0, theme: 'auto' },
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const data = JSON.parse(raw);
      const d = defaults();
      return {
        holdings: Array.isArray(data.holdings) ? data.holdings : d.holdings,
        history: Array.isArray(data.history) ? data.history : d.history,
        settings: Object.assign(d.settings, data.settings || {}),
      };
    } catch (e) {
      console.warn('Could not load saved portfolio', e);
      return defaults();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('Could not save portfolio', e);
      return false;
    }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  root.Storage = { load, save, clear, defaults };
})(window);
