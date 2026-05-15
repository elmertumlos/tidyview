/* tidyview ops_columns.js - column browser panel */
'use strict';

TV.panels = TV.panels || {};

TV.panels.columns = function(pane) {
  let cols = Array.isArray(window.__TV_COLS__) ? window.__TV_COLS__.slice() : [];
  const nrow = TV.state.nrow || 0;
  let detailRequested = false;

  function hasDetailedStats() {
    return cols.length && cols.every(function(c) {
      return Object.prototype.hasOwnProperty.call(c, 'n_unique')
        && Object.prototype.hasOwnProperty.call(c, 'n_na')
        && Object.prototype.hasOwnProperty.call(c, 'sample');
    });
  }

  function rowHTML(c, idx) {
    const hasNa = typeof c.n_na === 'number';
    const hasUnique = typeof c.n_unique === 'number';
    const na = hasNa ? c.n_na : null;
    const naPct = hasNa && nrow > 0 ? ((na / nrow) * 100).toFixed(1) + '%' : '-';
    const sampleArr = Array.isArray(c.sample) ? c.sample : (c.sample ? [c.sample] : []);
    const samp = sampleArr
      .map(function(s) {
        return '<span style="background:var(--md-surface-variant);padding:1px 5px;border-radius:4px;font-size:10px">'
          + String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>';
      }).join(' ');
    const lbl = c.label
      ? '<span style="font-size:10px;color:var(--md-on-surface-variant);margin-left:4px">' + c.label + '</span>'
      : '';
    return '<div data-col="' + idx + '" style="display:grid;grid-template-columns:28px 1fr auto;gap:6px;align-items:start;padding:8px 4px;border-bottom:1px solid var(--md-outline-variant)">'
      + '<span style="font-size:10px;color:var(--md-on-surface-variant);padding-top:3px;text-align:right">' + (idx + 1) + '</span>'
      + '<div>'
        + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:2px">'
          + '<span style="font-weight:500;font-size:13px">' + c.name + '</span>'
          + '<span class="tv-type tv-type-' + c.type + '" style="font-size:9px">' + c.type + '</span>'
          + lbl
        + '</div>'
        + '<div style="font-size:10px;color:var(--md-on-surface-variant);line-height:1.6">'
          + (hasUnique ? c.n_unique : '-') + ' unique &nbsp;&middot;&nbsp; ' + (hasNa ? na : '-') + ' NA (' + naPct + ')'
          + (samp ? '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px">' + samp + '</div>' : '')
        + '</div>'
      + '</div>'
      + '<button class="tv-col-copy-btn" data-name="' + c.name.replace(/"/g, '&quot;') + '"'
        + ' title="copy name"'
        + ' style="padding:4px 8px;border:1px solid var(--md-outline-variant);border-radius:6px;background:transparent;cursor:pointer;font-size:11px;color:var(--md-primary);white-space:nowrap;margin-top:2px">copy</button>'
      + '</div>';
  }

  function filterRows(q) {
    const lower = (q || '').toLowerCase();
    const visible = lower ? cols.filter(function(c) { return c.name.toLowerCase().indexOf(lower) !== -1; }) : cols;
    if (!visible.length) return '<div style="padding:20px;text-align:center;color:var(--md-on-surface-variant);font-size:12px">no columns match</div>';
    return visible.map(function(c) { return rowHTML(c, cols.indexOf(c)); }).join('');
  }

  function renderList(q) {
    const list = document.getElementById('col-browser-list');
    if (list) list.innerHTML = filterRows(q || '');
    bindCopyBtns();
  }

  function setStatus(message) {
    const el = document.getElementById('col-browser-status');
    if (el) el.textContent = message || '';
  }

  const allNames = cols.map(function(c) { return c.name; });
  const rVec = 'c(' + allNames.map(function(n) { return '"' + n + '"'; }).join(', ') + ')';
  const csvList = allNames.join(', ');
  const btList = allNames.map(function(n) { return '`' + n + '`'; }).join(', ');

  pane.innerHTML =
    '<div class="tv-panel-header">'
      + '<div class="tv-panel-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">'
          + '<rect x="3" y="3" width="14" height="14" rx="2"/>'
          + '<line x1="3" y1="8" x2="17" y2="8"/><line x1="8" y1="8" x2="8" y2="17"/><line x1="13" y1="8" x2="13" y2="17"/>'
        + '</svg></div>'
      + '<div><div class="tv-panel-title">columns</div>'
        + '<div class="tv-panel-sub">' + cols.length + ' column' + (cols.length === 1 ? '' : 's') + '</div></div>'
      + '<button class="tv-panel-close" onclick="TV.closePanel()">x</button>'
    + '</div>'
    + '<div class="tv-panel-body">'
      + '<div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:10px;line-height:1.6">'
        + 'Browse column names, types, and on-demand quality details before you transform or validate the dataset.'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'
        + '<button id="cb-copy-rvec" class="tv-btn-outlined" style="font-size:11px;padding:5px 10px">copy R vector</button>'
        + '<button id="cb-copy-csv" class="tv-btn-outlined" style="font-size:11px;padding:5px 10px">copy comma list</button>'
        + '<button id="cb-copy-btick" class="tv-btn-outlined" style="font-size:11px;padding:5px 10px">copy backtick list</button>'
      + '</div>'
      + '<input class="tv-input" id="col-browser-search" placeholder="search column names..." style="margin-bottom:8px;width:100%">'
      + '<div style="font-size:11px;color:var(--md-on-surface-variant);margin:-2px 0 8px;line-height:1.5">'
        + 'Use the copy buttons when you want to reuse column names quickly in code, filters, or custom expressions.'
      + '</div>'
      + '<div id="col-browser-status" style="font-size:11px;color:var(--md-on-surface-variant);margin:-2px 0 8px;line-height:1.5">'
        + (hasDetailedStats() ? '' : 'Detailed stats are loaded on demand so large datasets open faster.')
      + '</div>'
      + '<div id="col-browser-list" style="overflow-y:auto;max-height:calc(100vh - 260px)">'
        + filterRows('')
      + '</div>'
    + '</div>'
    + '<div class="tv-panel-footer">'
      + '<button class="tv-btn-outlined" onclick="TV.closePanel()">close</button>'
    + '</div>';

  document.getElementById('cb-copy-rvec').addEventListener('click', function() {
    TV.copyToClipboard(rVec, 'column names as R vector');
  });
  document.getElementById('cb-copy-csv').addEventListener('click', function() {
    TV.copyToClipboard(csvList, 'column names');
  });
  document.getElementById('cb-copy-btick').addEventListener('click', function() {
    TV.copyToClipboard(btList, 'column names (backtick)');
  });

  document.getElementById('col-browser-search').addEventListener('input', function() {
    renderList(this.value);
  });

  function bindCopyBtns() {
    document.querySelectorAll('.tv-col-copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        TV.copyToClipboard(btn.dataset.name, btn.dataset.name);
      });
    });
  }

  bindCopyBtns();

  async function hydrateDetailedStats() {
    if (detailRequested || hasDetailedStats()) return;
    detailRequested = true;
    setStatus('Loading detailed column stats...');
    try {
      const res = await TV.api('get_column_meta', {});
      cols = Array.isArray(res.columns) ? res.columns.slice() : cols;
      TV.state.dt = cols;
      window.__TV_COLS__ = cols;
      const q = document.getElementById('col-browser-search')?.value || '';
      renderList(q);
      setStatus('Detailed stats loaded for the current dataset.');
    } catch (e) {
      setStatus('Detailed stats could not be loaded right now.');
    }
  }

  hydrateDetailedStats();
};
