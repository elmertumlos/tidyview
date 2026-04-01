/* tidyview ops_compare.js - compare datasets panel */
'use strict';

TV.panels = TV.panels || {};

TV.panels.compare = function(pane) {
  if (!TV.state.dt) {
    pane.innerHTML = `
      <div class="tv-panel-header">
        <div class="tv-panel-icon">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="5" height="12" rx="1.5"/>
            <rect x="12" y="4" width="5" height="12" rx="1.5"/>
            <path d="M8 8h4M8 12h4" stroke-linecap="round"/>
          </svg>
        </div>
        <div><div class="tv-panel-title">compare</div><div class="tv-panel-sub">load data first</div></div>
        <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
      </div>
      <div class="tv-panel-body">
        <div style="font-size:13px;color:var(--md-on-surface-variant)">No data loaded.</div>
      </div>`;
    return;
  }

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="5" height="12" rx="1.5"/>
          <rect x="12" y="4" width="5" height="12" rx="1.5"/>
          <path d="M8 8h4M8 12h4" stroke-linecap="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">compare</div>
        <div class="tv-panel-sub">schema differences, key matches, and changed rows</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Compare the active dataset with another open tab or an R-environment table. Add key columns when you want left-only, right-only, and changed matched rows.
      </div>

      <div class="tv-field" style="margin-top:0">
        <label class="tv-field-label">compare with</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="compare-source-session" onclick="TVCOMPARE.setSourceType('session')">open tab</button>
          <button class="tv-chip" id="compare-source-env" onclick="TVCOMPARE.setSourceType('env')">R environment</button>
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">other dataset</label>
        <select class="tv-select" id="compare-source-select" onchange="TVCOMPARE.loadSummary()">
          <option value="">loading sources...</option>
        </select>
        <div id="compare-source-note" style="font-size:11px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.6"></div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">key columns for row comparison (optional)</label>
        <div id="compare-key-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
        <select class="tv-select" id="compare-key-add" onchange="TVCOMPARE.addKey(this.value);this.value=''">
          <option value="">choose shared column...</option>
        </select>
      </div>

      <div id="compare-status" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:10px">Loading comparison...</div>

      <div id="compare-overview" class="tv-audit-grid"></div>

      <div class="tv-compare-section">
        <div class="tv-compare-title">shared columns</div>
        <div id="compare-shared" class="tv-compare-list"></div>
      </div>

      <div class="tv-compare-section">
        <div class="tv-compare-title">only in active dataset</div>
        <div id="compare-left-only" class="tv-compare-list"></div>
      </div>

      <div class="tv-compare-section">
        <div class="tv-compare-title">only in other dataset</div>
        <div id="compare-right-only" class="tv-compare-list"></div>
      </div>

      <div class="tv-compare-section">
        <div class="tv-compare-title">type mismatches</div>
        <div id="compare-mismatches" class="tv-compare-list"></div>
      </div>

      <div class="tv-compare-section">
        <div class="tv-compare-title">key comparison</div>
        <div id="compare-keys" class="tv-compare-list"></div>
      </div>

      <div style="margin-top:14px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="compare-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap">
          <span style="color:var(--md-on-surface-variant);font-style:italic">loading compare code...</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">close</button>
      <button class="tv-btn-filled" type="button" onclick="TVCOMPARE.loadSummary()">refresh compare</button>
    </div>`;

  TVCOMPARE.init();
};


const TVCOMPARE = globalThis.TVCOMPARE = (() => {
  let sourceType = 'session';
  let sources = { session: [], env: [] };
  let sharedColumns = [];
  let keyCols = [];

  function buildSessionSources() {
    const activeSession = (TV.state.sessions || []).find(s => s.active)
      || (TV.state.sessions || []).find(s => s.name === TV.state.name);
    return (TV.state.sessions || [])
      .filter(s => {
        if (s.active) return false;
        if (activeSession && String(s.idx) === String(activeSession.idx)) return false;
        if (s.name === TV.state.name && Number(s.nrow || 0) === Number(TV.state.nrow || 0) && Number(s.ncol || 0) === Number(TV.state.ncol || 0)) {
          return false;
        }
        return true;
      })
      .map(s => ({
        value: String(s.idx),
        label: `${s.name} (${s.nrow.toLocaleString()} x ${s.ncol})`,
        note: 'Compare with another open tidyview tab.',
      }));
  }

  function buildEnvSources() {
    const objects = window.__ENV_OBJECTS__ || [];
    const out = [];
    objects.forEach(obj => {
      if (obj.type === 'list') {
        (obj.children || []).forEach(child => {
          out.push({
            value: JSON.stringify({ name: obj.name, element: child.name }),
            label: `${obj.name}[[${child.name}]] (${child.nrow} x ${child.ncol})`,
            note: 'Compare with a table-like item from the R environment.',
          });
        });
      } else if (obj.type === 'table') {
        out.push({
          value: JSON.stringify({ name: obj.name, element: null }),
          label: `${obj.name} (${obj.nrow} x ${obj.ncol})`,
          note: 'Compare with a table from the R environment.',
        });
      }
    });
    return out.filter(x => !x.label.startsWith(`${TV.state.name} (`));
  }

  function init() {
    sourceType = 'session';
    sources = { session: buildSessionSources(), env: buildEnvSources() };
    sharedColumns = [];
    keyCols = [];
    TV.refreshEnvCache().then(() => {
      sources.env = buildEnvSources();
      renderSourceOptions();
      loadSummary();
    }).catch(() => {
      renderSourceOptions();
      loadSummary();
    });
    renderSourceOptions();
    renderKeyChips();
  }

  function refreshSources() {
    const select = document.getElementById('compare-source-select');
    const previousValue = select ? select.value : '';
    sources.session = buildSessionSources();
    sources.env = buildEnvSources();
    renderSourceOptions();

    const nextSelect = document.getElementById('compare-source-select');
    if (nextSelect) {
      const list = sources[sourceType] || [];
      const hasPrevious = list.some(entry => String(entry.value) === String(previousValue));
      if (hasPrevious) {
        nextSelect.value = previousValue;
      }
    }

    loadSummary();
  }

  function renderSourceOptions() {
    const select = document.getElementById('compare-source-select');
    const note = document.getElementById('compare-source-note');
    if (!select) return;
    const list = sources[sourceType] || [];
    document.getElementById('compare-source-session')?.classList.toggle('selected', sourceType === 'session');
    document.getElementById('compare-source-env')?.classList.toggle('selected', sourceType === 'env');

    if (!list.length) {
      select.innerHTML = `<option value="">no ${sourceType === 'session' ? 'other open tabs' : 'environment tables'} available</option>`;
      if (note) note.textContent = sourceType === 'session'
        ? 'Open another dataset tab first, or switch to R environment.'
        : 'No table-like objects were found in the R environment.';
      return;
    }

    select.innerHTML = list.map(entry =>
      `<option value="${TV.escapeAttr(entry.value)}">${TV.escapeHtml(entry.label)}</option>`
    ).join('');
    if (note) note.textContent = list[0].note || '';
  }

  function setSourceType(nextType) {
    sourceType = nextType;
    keyCols = [];
    sharedColumns = [];
    renderSourceOptions();
    renderKeyChips();
    loadSummary();
  }

  function buildPayload() {
    const select = document.getElementById('compare-source-select');
    if (!select || !select.value) return null;
    const payload = { by: keyCols.slice() };
    if (sourceType === 'session') {
      payload.source_type = 'session';
      payload.session_idx = parseInt(select.value, 10);
    } else {
      payload.source_type = 'env';
      const parsed = JSON.parse(select.value);
      payload.name = parsed.name;
      payload.element = parsed.element || null;
    }
    return payload;
  }

  function renderList(id, items, formatter) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="tv-audit-empty">None.</div>';
      return;
    }
    el.innerHTML = items.map(formatter).join('');
  }

  function renderOverview(result) {
    const el = document.getElementById('compare-overview');
    if (!el) return;
    const overview = result?.overview || {};
    const cards = [
      ['active rows', overview.left_nrow],
      ['other rows', overview.right_nrow],
      ['active columns', overview.left_ncol],
      ['other columns', overview.right_ncol],
      ['shared columns', overview.shared_columns_n],
      ['type mismatches', overview.type_mismatches_n],
    ];
    el.innerHTML = cards.map(([label, value]) => `
      <div class="tv-audit-card">
        <div class="tv-audit-card-label">${TV.escapeHtml(label)}</div>
        <div class="tv-audit-card-value">${Number(value || 0).toLocaleString()}</div>
      </div>`).join('');
  }

  function renderKeyChips() {
    const chips = document.getElementById('compare-key-chips');
    const select = document.getElementById('compare-key-add');
    if (chips) {
      chips.innerHTML = keyCols.map(col => `
        <button class="tv-chip selected" onclick='TVCOMPARE.removeKey(${JSON.stringify(col)})'>
          ${TV.escapeHtml(col)} <span style="margin-left:3px;opacity:.6">x</span>
        </button>`).join('');
    }
    if (select) {
      const options = sharedColumns.filter(col => !keyCols.includes(col));
      select.innerHTML = `<option value="">choose shared column...</option>` +
        options.map(col => `<option value="${TV.escapeAttr(col)}">${TV.escapeHtml(col)}</option>`).join('');
    }
  }

  function addKey(col) {
    if (!col || keyCols.includes(col)) return;
    keyCols.push(col);
    renderKeyChips();
    loadSummary();
  }

  function removeKey(col) {
    keyCols = keyCols.filter(x => x !== col);
    renderKeyChips();
    loadSummary();
  }

  async function loadSummary() {
    const payload = buildPayload();
    const status = document.getElementById('compare-status');
    const preview = document.getElementById('compare-preview');
    if (!payload) {
      if (status) status.textContent = 'Choose another dataset to compare.';
      if (preview) preview.textContent = '# compare unavailable';
      renderOverview(null);
      renderList('compare-shared', [], x => x);
      renderList('compare-left-only', [], x => x);
      renderList('compare-right-only', [], x => x);
      renderList('compare-mismatches', [], x => x);
      renderList('compare-keys', [], x => x);
      return;
    }

    if (status) status.textContent = 'Loading comparison...';
    try {
      const res = await TV.api('compare_summary', payload);
      sharedColumns = res.shared_columns || [];
      keyCols = keyCols.filter(col => sharedColumns.includes(col));
      renderKeyChips();
      if (status) {
        status.textContent = `Compared ${res.overview.left_name} with ${res.overview.right_name}.`;
      }
      if (preview) preview.textContent = res.code || '# compare unavailable';
      renderOverview(res);
      renderList('compare-shared', res.shared_columns, col => `<span class="tv-audit-chip">${TV.escapeHtml(col)}</span>`);
      renderList('compare-left-only', res.left_only_columns, col => `<span class="tv-audit-chip">${TV.escapeHtml(col)}</span>`);
      renderList('compare-right-only', res.right_only_columns, col => `<span class="tv-audit-chip">${TV.escapeHtml(col)}</span>`);
      renderList('compare-mismatches', res.type_mismatches, item => `
        <div class="tv-compare-item">
          <strong>${TV.escapeHtml(item.column)}</strong>
          <span>${TV.escapeHtml(item.left_type)} vs ${TV.escapeHtml(item.right_type)}</span>
        </div>`);
      const keySummary = res.key_summary;
      const keyItems = keySummary ? [
        `matched keys: ${Number(keySummary.matched_keys || 0).toLocaleString()}`,
        `only in active: ${Number(keySummary.only_left_keys || 0).toLocaleString()}`,
        `only in other: ${Number(keySummary.only_right_keys || 0).toLocaleString()}`,
        `duplicate keys in active: ${Number(keySummary.duplicate_keys_left || 0).toLocaleString()}`,
        `duplicate keys in other: ${Number(keySummary.duplicate_keys_right || 0).toLocaleString()}`,
        keySummary.changed_rows === null || keySummary.changed_rows === undefined
          ? (keySummary.compare_ready ? 'changed matched rows: 0' : 'changed matched rows: need unique keys')
          : `changed matched rows: ${Number(keySummary.changed_rows || 0).toLocaleString()}`,
        (keySummary.changed_columns || []).length
          ? `changed columns: ${keySummary.changed_columns.join(', ')}`
          : 'changed columns: none',
      ] : ['Add one or more key columns to compare matched rows.'];
      renderList('compare-keys', keyItems, item => `<div class="tv-compare-item"><span>${TV.escapeHtml(item)}</span></div>`);
    } catch (e) {
      sharedColumns = [];
      keyCols = [];
      renderKeyChips();
      if (status) status.textContent = e.message;
      if (preview) preview.textContent = '# compare unavailable';
      renderOverview(null);
      renderList('compare-shared', [], x => x);
      renderList('compare-left-only', [], x => x);
      renderList('compare-right-only', [], x => x);
      renderList('compare-mismatches', [], x => x);
      renderList('compare-keys', [], x => x);
    }
  }

  return { init, setSourceType, addKey, removeKey, loadSummary, refreshSources };
})();
