/* tidyview ops_columns.js — column browser panel */
'use strict';

TV.panels = TV.panels || {};

TV.panels.columns = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const nrow = TV.state.nrow || 0;

  /* build rows HTML without embedding JS strings inside HTML attributes */
  function rowHTML(c, idx) {
    const na    = c.n_na || 0;
    const naPct = nrow > 0 ? ((na / nrow) * 100).toFixed(1) + '%' : '—';
    const sampleArr = Array.isArray(c.sample) ? c.sample : (c.sample ? [c.sample] : []);
    const samp  = sampleArr
      .map(function(s) {
        return '<span style="background:var(--md-surface-variant);padding:1px 5px;border-radius:4px;font-size:10px">'
          + String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>';
      }).join(' ');
    var lbl = c.label
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
          + c.n_unique + ' unique &nbsp;·&nbsp; ' + na + ' NA (' + naPct + ')'
          + (samp ? '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px">' + samp + '</div>' : '')
        + '</div>'
      + '</div>'
      + '<button class="tv-col-copy-btn" data-name="' + c.name.replace(/"/g,'&quot;') + '"'
        + ' title="copy name"'
        + ' style="padding:4px 8px;border:1px solid var(--md-outline-variant);border-radius:6px;background:transparent;cursor:pointer;font-size:11px;color:var(--md-primary);white-space:nowrap;margin-top:2px">⎘</button>'
      + '</div>';
  }

  function filterRows(q) {
    var lower = (q || '').toLowerCase();
    var visible = lower ? cols.filter(function(c){ return c.name.toLowerCase().indexOf(lower) !== -1; }) : cols;
    if (!visible.length) return '<div style="padding:20px;text-align:center;color:var(--md-on-surface-variant);font-size:12px">no columns match</div>';
    return visible.map(function(c){ return rowHTML(c, cols.indexOf(c)); }).join('');
  }

  var allNames = cols.map(function(c){ return c.name; });
  var rVec     = 'c(' + allNames.map(function(n){ return '"' + n + '"'; }).join(', ') + ')';
  var csvList  = allNames.join(', ');
  var btList   = allNames.map(function(n){ return '`' + n + '`'; }).join(', ');

  pane.innerHTML =
    '<div class="tv-panel-header">'
      + '<div class="tv-panel-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">'
          + '<rect x="3" y="3" width="14" height="14" rx="2"/>'
          + '<line x1="3" y1="8" x2="17" y2="8"/><line x1="8" y1="8" x2="8" y2="17"/><line x1="13" y1="8" x2="13" y2="17"/>'
        + '</svg></div>'
      + '<div><div class="tv-panel-title">columns</div>'
        + '<div class="tv-panel-sub">' + cols.length + ' column' + (cols.length === 1 ? '' : 's') + '</div></div>'
      + '<button class="tv-panel-close" onclick="TV.closePanel()">✕</button>'
    + '</div>'
    + '<div class="tv-panel-body">'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'
        + '<button id="cb-copy-rvec"  class="tv-btn-outlined" style="font-size:11px;padding:5px 10px">⎘ R vector</button>'
        + '<button id="cb-copy-csv"   class="tv-btn-outlined" style="font-size:11px;padding:5px 10px">⎘ comma list</button>'
        + '<button id="cb-copy-btick" class="tv-btn-outlined" style="font-size:11px;padding:5px 10px">⎘ backtick</button>'
      + '</div>'
      + '<input class="tv-input" id="col-browser-search" placeholder="search column names…" style="margin-bottom:8px;width:100%">'
      + '<div id="col-browser-list" style="overflow-y:auto;max-height:calc(100vh - 260px)">'
        + filterRows('')
      + '</div>'
    + '</div>'
    + '<div class="tv-panel-footer">'
      + '<button class="tv-btn-outlined" onclick="TV.closePanel()">close</button>'
    + '</div>';

  /* wire events after innerHTML is set */
  document.getElementById('cb-copy-rvec') .addEventListener('click', function(){ TV.copyToClipboard(rVec,    'column names as R vector'); });
  document.getElementById('cb-copy-csv')  .addEventListener('click', function(){ TV.copyToClipboard(csvList, 'column names'); });
  document.getElementById('cb-copy-btick').addEventListener('click', function(){ TV.copyToClipboard(btList,  'column names (backtick)'); });

  document.getElementById('col-browser-search').addEventListener('input', function() {
    document.getElementById('col-browser-list').innerHTML = filterRows(this.value);
    bindCopyBtns();
  });

  function bindCopyBtns() {
    document.querySelectorAll('.tv-col-copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        TV.copyToClipboard(btn.dataset.name, btn.dataset.name);
      });
    });
  }
  bindCopyBtns();
};
