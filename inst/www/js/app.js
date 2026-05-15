/* tidyview app.js — frontend state, API calls, table rendering, panel logic */
'use strict';

const TV = (() => {

  /* ── state ── */
  const state = {
    dt:       null,   // current column metadata array
    name:     'DT',
    nrow:     0,
    ncol:     0,
    page:     1,
    perPage:  50,
    sortCol:  null,
    sortDir:  'asc',
    search:   '',
    history:  [],
    codeStyle: 'native',
    sessions: [],     // [{idx, name, nrow, ncol, active}]
    panel:    null,   // active panel id
    panelContext: null,
    renderSeq: 0,
    rcdfImport: null,
  };

  /* ── DOM refs ── */
  const $ = id => document.getElementById(id);
  const busyState = {
    count: 0,
    timer: null,
    visibleSince: 0,
    visible: false,
    label: 'working...',
  };

  /* ── bootstrap ── */
  function init() {
    const initData = window.__INIT_DATA__;
    renderStartupNotice(window.__STARTUP_NOTICE__ || '');
    api('get_settings', {}).then(function(s) {
      state.perPage = s.perPage || state.perPage;
      state.codeStyle = s.codeStyle || 'native';
      renderHistory();
    }).catch(function() {});
    if (initData) {
      state.dt    = normalizeColumnsMeta(initData.columns);
      state.name  = initData.name;
      state.nrow  = initData.nrow;
      state.ncol  = initData.ncol;
      renderTable();
      updateDimLabel();
    } else {
      state.dt = null;
      state.name = null;
      state.nrow = 0;
      state.ncol = 0;
      updateDimLabel();
      showEmpty();
    }
    /* load session list */
    api('list_sessions', {}).then(function(r) {
      state.sessions = r.sessions || [];
      renderSessionTabs(r.sessions);
    }).catch(function() {
      renderSessionTabs([]);
    });
    renderHistory();
    bindNav();
    bindTableBar();
    bindSessionTabBar();
    bindKeyboardShortcuts();
  }

  function renderStartupNotice(message) {
    const el = $('tv-startup-notice');
    if (!el) return;
    const text = String(message || '').trim();
    if (!text) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.innerHTML = `
      <div class="tv-startup-note">
        <div class="tv-startup-note-text">${escapeHtml(text)}</div>
        <button class="tv-startup-note-close" type="button" onclick="this.parentElement.parentElement.style.display='none';this.parentElement.parentElement.innerHTML=''" aria-label="dismiss note">×</button>
      </div>`;
  }

  /* ── API ── */
  function busyLabelForEndpoint(endpoint) {
    const labels = {
      get_data: 'loading data...',
      list_sessions: 'loading tabs...',
      switch_session: 'switching dataset...',
      remove_session: 'removing dataset...',
      scan_env: 'scanning R environment...',
      load_env: 'loading dataset...',
      load_file: 'importing file...',
      get_column_meta: 'profiling columns...',
      inspect_rcdf: 'inspecting RCDF file...',
      load_rcdf_tables: 'loading RCDF tables...',
      preview_op: 'checking impact...',
      op_filter: 'applying filter...',
      op_select: 'applying select...',
      op_mutate: 'applying mutate...',
      op_summarise: 'building summary...',
      op_arrange: 'sorting data...',
      op_join: 'joining datasets...',
      op_combine: 'combining datasets...',
      op_relocate: 'moving columns...',
      op_reshape: 'reshaping data...',
      op_rename: 'renaming columns...',
      op_dedupe: 'removing duplicates...',
      op_drop_na: 'removing missing rows...',
      op_slice: 'slicing rows...',
      op_count: 'counting rows...',
      op_fill_na: 'replacing missing values...',
      op_separate: 'splitting values...',
      op_unite: 'uniting values...',
      op_tabulate: 'building tabulation...',
      op_crosstab: 'building crosstab...',
      op_join_psgc: 'joining area names...',
      op_recode: 'recoding values...',
      op_factor: 'updating categories...',
      audit_summary: 'checking data quality...',
      missing_summary: 'checking missing data...',
      validate_summary: 'running validation...',
      compare_summary: 'comparing datasets...',
      col_values: 'loading values...',
      get_history: 'loading script...',
      add_history: 'adding code to script...',
      undo: 'undoing last step...',
      export: 'exporting data...',
      save_to_env: 'saving to R environment...',
      set_theme: 'saving settings...',
      get_settings: 'loading settings...',
    };
    return labels[endpoint] || 'working...';
  }

  function showBusyUi(label) {
    const indicator = $('tv-busy-indicator');
    const text = $('tv-busy-text');
    const bar = $('tv-busy-bar');
    if (text) text.textContent = label || 'working...';
    if (indicator) indicator.style.display = 'inline-flex';
    if (bar) bar.style.display = 'block';
    busyState.visible = true;
    busyState.visibleSince = Date.now();
  }

  function hideBusyUi() {
    const indicator = $('tv-busy-indicator');
    const bar = $('tv-busy-bar');
    if (indicator) indicator.style.display = 'none';
    if (bar) bar.style.display = 'none';
    busyState.visible = false;
    busyState.visibleSince = 0;
  }

  function beginBusy(endpoint) {
    busyState.count += 1;
    busyState.label = busyLabelForEndpoint(endpoint);
    if (busyState.timer) clearTimeout(busyState.timer);
    if (!busyState.visible) {
      busyState.timer = setTimeout(function() {
        if (busyState.count > 0) showBusyUi(busyState.label);
        busyState.timer = null;
      }, 120);
    } else {
      showBusyUi(busyState.label);
    }
  }

  function endBusy() {
    busyState.count = Math.max(0, busyState.count - 1);
    if (busyState.count > 0) return;
    if (busyState.timer) {
      clearTimeout(busyState.timer);
      busyState.timer = null;
    }
    if (!busyState.visible) return;
    const elapsed = Date.now() - busyState.visibleSince;
    const delay = Math.max(0, 180 - elapsed);
    setTimeout(function() {
      if (busyState.count === 0) hideBusyUi();
    }, delay);
  }

  async function api(endpoint, body = {}) {
    beginBusy(endpoint);
    try {
      const res = await fetch('/api/' + endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : {};
      } catch (e) {
        const rcdfHint = endpoint === 'inspect_rcdf' || endpoint === 'load_rcdf_tables'
          ? ' Restart tidyview in R with stop_tidygui(); tidygui() to enable the new RCDF workflow.'
          : '';
        throw new Error(`Unexpected server response.${rcdfHint}`);
      }
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      if (json.error) {
        if ((endpoint === 'inspect_rcdf' || endpoint === 'load_rcdf_tables') && /unknown endpoint/i.test(json.error)) {
          throw new Error(`${json.error} Restart tidyview in R with stop_tidygui(); tidygui().`);
        }
        throw new Error(json.error);
      }
      return json;
    } finally {
      endBusy();
    }
  }

  function formatCount(value) {
    return Number(value || 0).toLocaleString();
  }

  function formatImpactSummary(preview, kind = 'generic') {
    if (!preview) return '';
    const beforeRows = Number(preview.before_nrow || 0);
    const afterRows = Number(preview.after_nrow || 0);
    const beforeCols = Number(preview.before_ncol || 0);
    const afterCols = Number(preview.after_ncol || 0);
    const removedRows = Math.max(0, beforeRows - afterRows);
    const addedRows = Math.max(0, afterRows - beforeRows);
    const removedCols = Math.max(0, beforeCols - afterCols);
    const addedCols = Math.max(0, afterCols - beforeCols);

    if (kind === 'filter' || kind === 'drop_na') {
      if (removedRows > 0) {
        return `${formatCount(afterRows)} rows will remain; ${formatCount(removedRows)} rows will be removed.`;
      }
      return `${formatCount(afterRows)} rows will remain.`;
    }
    if (kind === 'join') {
      return `${formatCount(beforeRows)} rows -> ${formatCount(afterRows)} rows; ${formatCount(beforeCols)} columns -> ${formatCount(afterCols)} columns.`;
    }
    if (kind === 'combine_rows') {
      return `Result will have ${formatCount(afterRows)} rows and ${formatCount(afterCols)} columns.`;
    }
    if (kind === 'combine_cols') {
      return `Result will have ${formatCount(afterRows)} rows and ${formatCount(afterCols)} columns.`;
    }
    const parts = [];
    if (addedRows || removedRows) parts.push(`${formatCount(beforeRows)} rows -> ${formatCount(afterRows)} rows`);
    if (addedCols || removedCols) parts.push(`${formatCount(beforeCols)} columns -> ${formatCount(afterCols)} columns`);
    return parts.join('; ');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(value) {
    return escapeHtml(value)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function rName(name) {
    const value = String(name ?? '');
    return /^[A-Za-z.][A-Za-z0-9._]*$/.test(value)
      ? value
      : '`' + value.replace(/`/g, '\\`') + '`';
  }

  function rString(value) {
    return '"' + String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"') + '"';
  }

  function normalizeColumnLabel(label) {
    if (label == null) return null;
    if (typeof label === 'string') {
      const text = label.trim();
      return text || null;
    }
    if (Array.isArray(label)) {
      const parts = label
        .map(normalizeColumnLabel)
        .filter(Boolean);
      return parts.length ? parts.join(' ') : null;
    }
    if (typeof label === 'object') {
      return normalizeColumnLabel(label.label ?? label.text ?? label.value ?? null);
    }
    const text = String(label).trim();
    return text && text !== '[object Object]' ? text : null;
  }

  function normalizeColumnRecord(column) {
    if (!column || typeof column !== 'object') return null;
    return {
      ...column,
      label: normalizeColumnLabel(column.label),
    };
  }

  function normalizeColumnsMeta(columns) {
    if (Array.isArray(columns)) {
      const normalized = columns.map(normalizeColumnRecord).filter(Boolean);
      return normalized.length ? normalized : null;
    }
    if (!columns || typeof columns !== 'object') return null;
    const values = Object.values(columns)
      .map(normalizeColumnRecord)
      .filter(Boolean);
    return values.length ? values : null;
  }

  function mergeColumnsMeta(current, incoming) {
    const nextCols = normalizeColumnsMeta(incoming);
    if (!Array.isArray(nextCols) || !nextCols.length) return normalizeColumnsMeta(current);
    const currentCols = normalizeColumnsMeta(current);
    if (!Array.isArray(currentCols) || !currentCols.length) return nextCols;
    const currentByName = new Map(currentCols.map(c => [c.name, c]));
    return nextCols.map(c => {
      const prev = currentByName.get(c.name);
      return prev ? { ...prev, ...c } : c;
    });
  }

  function hasActiveData() {
    const cols = normalizeColumnsMeta(state.dt);
    return state.ncol > 0 && (!!state.name || (Array.isArray(cols) && cols.length > 0));
  }

  function isRightAlignedType(type) {
    return type === 'dbl' || type === 'int';
  }

  function columnAlignClass(type) {
    return isRightAlignedType(type) ? 'tv-align-right' : 'tv-align-left';
  }

  /* ── table rendering ── */
  async function renderTable() {
    const renderSeq = ++state.renderSeq;
    if (!hasActiveData()) return showEmpty();

    let data;
    try {
      data = await api('get_data', {
        page:     state.page,
        per_page: state.perPage,
        search:   state.search,
        sort_col: state.sortCol,
        sort_dir: state.sortDir,
      });
    } catch (e) {
      if (!hasActiveData()) return showEmpty();
      throw e;
    }

    if (renderSeq !== state.renderSeq || !hasActiveData()) return;

    state.nrow = data.total;
    state.dt   = mergeColumnsMeta(state.dt, data.columns);
    state.ncol = Array.isArray(state.dt) ? state.dt.length : 0;
    updateDimLabel();

    const wrap = $('table-wrap');
    if (!wrap) return;

    try {
      const cols = Array.isArray(state.dt) ? state.dt : [];
    if (!cols.length || state.ncol <= 0) return showEmpty();

    const typeRow = cols.map(c =>
      `<th class="${columnAlignClass(c.type)}"><span class="tv-type tv-type-${c.type}">${c.type}</span></th>`
    ).join('');

    const headRow = cols.map(c => {
      const sorted = state.sortCol === c.name;
      const ind    = sorted ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
      const lbl    = c.label ? `<div style="font-size:9px;font-weight:400;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${escapeHtml(c.label)}</div>` : '';
      const copyIco = `<button title="copy column name" onclick='event.stopPropagation();TV.copyToClipboard(${JSON.stringify(c.name)}, ${JSON.stringify(c.name)})'
        style="display:inline-flex;align-items:center;justify-content:center;margin-left:3px;padding:1px 3px;border:none;background:transparent;cursor:pointer;color:inherit;opacity:.3;font-size:9px;border-radius:3px;vertical-align:middle;line-height:1"
        onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='.3'">⎘</button>`;
      return `<th class="${sorted ? 'sorted' : ''} ${columnAlignClass(c.type)}"
        onclick='TV.sortBy(${JSON.stringify(c.name)})'
        >${escapeHtml(c.name)}${copyIco}<span style="font-size:9px;opacity:.6">${ind}</span>${lbl}</th>`;
    }).join('');

    const bodyRows = (Array.isArray(data.rows) ? data.rows : []).map(row => {
      const cells = cols.map(c => {
        const raw = row && typeof row === 'object' ? row[c.name] : null;
        const alignClass = columnAlignClass(c.type);
        if (raw === null || raw === undefined) {
          return `<td class="tv-cell-value tv-missing ${alignClass}" title="Click to view full value" onclick='TV.openCellValue(${JSON.stringify(c.name)}, "NA")'>NA</td>`;
        }
        /* flatten any complex objects (e.g. haven_labelled not fully stripped) */
        const v = (raw !== null && typeof raw === 'object')
          ? (Array.isArray(raw) ? raw.join(', ') : (raw.value ?? JSON.stringify(raw)))
          : raw;
        const rawText = String(v);
        const safeText = escapeHtml(rawText);
        const clickAttr = ` title="Click to view full value" onclick='TV.openCellValue(${JSON.stringify(c.name)}, ${JSON.stringify(rawText)})'`;
        if (c.type === 'dbl')   return `<td class="tv-num tv-cell-value ${alignClass}"${clickAttr}>${Number(v).toLocaleString(undefined,{maximumFractionDigits:4})}</td>`;
        if (c.type === 'int')   return `<td class="tv-int tv-cell-value ${alignClass}"${clickAttr}>${safeText}</td>`;
        return `<td class="tv-cell-value ${alignClass}"${clickAttr}>${safeText}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    wrap.innerHTML = `
      <table class="tv-dt">
        <thead>
          <tr class="type-row">${typeRow}</tr>
          <tr class="header-row">${headRow}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>`;

    const start = (state.page - 1) * state.perPage + 1;
    const end   = Math.min(start + state.perPage - 1, state.nrow);
    $('page-info').textContent = `${start.toLocaleString()}–${end.toLocaleString()} of ${state.nrow.toLocaleString()}`;
    $('prev-btn').disabled = state.page <= 1;
    $('next-btn').disabled = end >= state.nrow;
    } catch (e) {
      const msg = 'Render error: ' + e.message;
      await showError(msg);
      wrap.innerHTML = `
        <div class="tv-empty">
          <div class="tv-empty-title">Table could not be rendered</div>
          <div class="tv-empty-sub">${escapeHtml(msg)}</div>
          <button class="tv-btn-filled" onclick="TV.renderTable()" style="margin-top:8px;width:auto;padding:10px 24px">Try again</button>
        </div>`;
      const pageInfo = $('page-info');
      if (pageInfo) pageInfo.textContent = '0-0 of 0';
      const prevBtn = $('prev-btn');
      const nextBtn = $('next-btn');
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
    }
  }

  function showEmpty() {
    state.renderSeq += 1;
    const wrap = $('table-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="tv-empty">
        <div class="tv-empty-icon">
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="4" y="4" width="24" height="24" rx="4"/>
            <line x1="4" y1="12" x2="28" y2="12"/>
            <line x1="12" y1="12" x2="12" y2="28"/>
          </svg>
        </div>
        <div class="tv-empty-title">No data loaded</div>
        <div class="tv-empty-sub">Click the load button to import data from your R environment or a file.</div>
        <button class="tv-btn-filled" onclick="TV.openPanel('load')" style="margin-top:8px;width:auto;padding:10px 24px">Load data</button>
      </div>`;
    const pageInfo = $('page-info');
    if (pageInfo) pageInfo.textContent = '0-0 of 0';
    const prevBtn = $('prev-btn');
    const nextBtn = $('next-btn');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
  }

  function updateDimLabel() {
    window.__TV_COLS__ = state.dt || [];
    const el = $('dim-label');
    if (!el) return;
    el.innerHTML = `<strong>${state.nrow.toLocaleString()}</strong> rows &nbsp;·&nbsp; <strong>${state.ncol}</strong> columns &nbsp;·&nbsp; ${state.name}`;
  }

  function updateSourceChip() { renderSessionTabs(); }  /* legacy alias */

  function renderSessionTabs(sessions) {
    const bar = $('session-tab-bar');
    if (!bar) return;
    const list = sessions || state.sessions || [];

    let html = list.map(function(s) {
      const active = s.active ? ' active' : '';
      const label  = (s.name || 'untitled') + (s.nrow ? ' (' + s.nrow.toLocaleString() + ')' : '');
      return `<button class="tv-session-tab${active}" onclick="TV.switchSession(${s.idx})" title="${s.name}">`
        + label
        + `<span class="tv-tab-close" onclick="event.stopPropagation();TV.removeSession(${s.idx})" title="close">✕</span>`
        + `</button>`;
    }).join('');

    html += `<button class="tv-session-add" onclick="TV.openPanel('load')" title="add dataset">＋</button>`;
    bar.innerHTML = html;
    const activeTab = bar.querySelector('.tv-session-tab.active');
    if (activeTab) {
      requestAnimationFrame(() => {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      });
    }
    if (state.panel === 'compare' && globalThis.TVCOMPARE && typeof globalThis.TVCOMPARE.refreshSources === 'function') {
      globalThis.TVCOMPARE.refreshSources();
    }
  }

  async function switchSession(idx) {
    try {
      const res = await api('switch_session', { idx });
      state.sessions = res.sessions;
      state.dt   = normalizeColumnsMeta(res.columns);
      state.name = res.name;
      state.nrow = res.nrow;
      state.ncol = res.ncol;
      state.page = 1;
      setHistory(res.history || []);
      updateDimLabel();
      renderSessionTabs(res.sessions);
      await renderTable();
    } catch(e) { await showError('Switch error: ' + e.message); }
  }

  async function removeSession(idx) {
    if (!(await confirmMessage('Remove this dataset?', { title: 'Remove Dataset', confirmLabel: 'remove' }))) return;
    try {
      const res = await api('remove_session', { idx });
      state.sessions = res.sessions;
      state.dt   = normalizeColumnsMeta(res.columns);
      state.name = res.name || null;
      state.nrow = res.nrow || 0;
      state.ncol = res.ncol || 0;
      state.page = 1;
      setHistory(res.history || []);
      updateDimLabel();
      renderSessionTabs(res.sessions);
      await renderTable();
    } catch(e) { await showError('Remove error: ' + e.message); }
  }

  /* ── sorting ── */
  function sortBy(col) {
    if (state.sortCol === col) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortCol = col;
      state.sortDir = 'asc';
    }
    state.page = 1;
    renderTable();
  }

  /* ── nav ── */
  function bindNav() {
    document.querySelectorAll('.tv-nav-item[data-panel]').forEach(btn => {
      btn.addEventListener('click', () => openPanel(btn.dataset.panel));
    });
  }

  function openPanel(id, context = null) {
    state.panel = id;
    state.panelContext = context && typeof context === 'object' ? context : null;
    document.querySelectorAll('.tv-nav-item').forEach(b =>
      b.classList.toggle('active', b.dataset.panel === id));
    const pane = $('op-panel');
    if (!pane) return;

    const builtinPanels = {
      load:      renderLoadPanel,
      select:    renderSelectPanel,
      mutate:    renderMutatePanel,
      summarise: renderSummarisePanel,
      filter:    TV.panels.filter,
    };

    const fn = builtinPanels[id] || TV.panels[id];
    if (!fn) {
      pane.innerHTML = `<div style="padding:24px;color:var(--md-on-surface-variant);font-size:13px">Panel "${id}" not found.</div>`;
      pane.style.display = 'flex';
      return;
    }

    if (id === 'join') {
      refreshEnvCache().finally(() => {
        try {
          fn(pane);
          enhanceGeneratedCodeBlocks(pane);
        } catch(e) { pane.innerHTML = `<div style="padding:24px;color:red;font-size:12px">Error: ${e.message}</div>`; }
        pane.style.display = 'flex';
      });
      return;
    }

    try { fn(pane); } catch(e) {
      pane.innerHTML = `<div style="padding:24px;color:red;font-size:12px">Panel error: ${e.message}</div>`;
    }
    enhanceGeneratedCodeBlocks(pane);
    pane.style.display = 'flex';
  }

  function closePanel() {
    state.panel = null;
    state.panelContext = null;
    const pane = $('op-panel');
    if (pane) pane.style.display = 'none';
    document.querySelectorAll('.tv-nav-item').forEach(b => b.classList.remove('active'));
  }

  function consumePanelContext() {
    const ctx = state.panelContext;
    state.panelContext = null;
    return ctx && typeof ctx === 'object' ? ctx : null;
  }

  function openPanelForColumns(id, columns, extra = {}) {
    const list = Array.isArray(columns) ? columns.filter(Boolean) : (columns ? [columns] : []);
    openPanel(id, Object.assign({}, extra, { columns: list }));
  }

  /* ── code pane ── */
  function renderHistory(newIndex = -1) {
    const body = $('code-body');
    if (!body) return;
    if (!state.history.length) {
      body.innerHTML = `<span class="tv-cmt"># tidyview - operations will appear here as you work</span>`;
      updateHistoryCount();
      return;
    }
    const renderedLines = buildRenderedHistory();
    body.innerHTML = renderedLines.map((line, i) => {
      const highlighted = line
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"([^"]*)"/g, '<span class="tv-val">"$1"</span>')
        .replace(/\b(DT|data\.table|merge|melt|dcast|unique|setnames|fread|fwrite|readRDS|saveRDS|writexl|rcdf|tsg|phscs|haven)\b/g, "<span class='tv-fn'>$1</span>")
        .replace(/\b(library|require|as\.data\.table|data\.table::copy)\b/g, "<span class='tv-kw'>$1</span>")
        .replace(/\b(\w+)\s*:=/g, "<span class='tv-col'>$1</span> :=");
      const isNew = newIndex >= 0 && i === renderedLines.length - 1;
      return `<span class="tv-code-line${isNew ? ' new' : ''}">${highlighted}</span>`;
    }).join('\n');
    body.scrollTop = body.scrollHeight;
    updateHistoryCount();
  }

  function pushCode(code) {
    state.history.push(code);
    renderHistory(state.history.length - 1);
  }

  function normalizeHistory(history) {
    if (Array.isArray(history)) {
      return history.map(x => String(x ?? '')).filter(x => x.length);
    }
    if (typeof history === 'string') {
      return history.length ? [history] : [];
    }
    return [];
  }

  function setHistory(history) {
    state.history = normalizeHistory(history);
    renderHistory();
  }

  function updateHistoryCount() {
    const count = $('hist-count');
    if (!count) return;
    const n = state.history.length;
    count.textContent = `${n} operation${n === 1 ? '' : 's'}`;
  }

  /* ── table bar ── */
  function bindTableBar() {
    const search = $('search-input');
    if (search) {
      search.addEventListener('input', () => {
        state.search = search.value;
        state.page   = 1;
        renderTable();
      });
    }
  }

  function bindSessionTabBar() {
    const bar = $('session-tab-bar');
    if (!bar || bar.dataset.bound === 'true') return;
    bar.dataset.bound = 'true';
    bar.addEventListener('wheel', event => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (bar.scrollWidth <= bar.clientWidth) return;
      event.preventDefault();
      bar.scrollLeft += event.deltaY;
    }, { passive: false });
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = String(target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function focusSearch() {
    const input = $('search-input');
    if (!input) return;
    input.focus();
    input.select?.();
  }

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', function(event) {
      const typing = isTypingTarget(event.target);
      const key = event.key;
      const lower = String(key || '').toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;

      if (key === 'F1') {
        event.preventDefault();
        openPanel('help');
        return;
      }

      if (!typing && !ctrlOrMeta && !event.altKey && !event.shiftKey && key === '/') {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (!typing && !ctrlOrMeta && !event.altKey && event.shiftKey && key === '?') {
        event.preventDefault();
        openPanel('help');
        return;
      }

      if (ctrlOrMeta && !event.shiftKey && lower === 'k') {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (ctrlOrMeta && !event.shiftKey && lower === 'z') {
        event.preventDefault();
        undo();
        return;
      }

      if (ctrlOrMeta && event.shiftKey && lower === 'c') {
        event.preventDefault();
        copyHistory();
        return;
      }

      if (key === 'Escape' && state.panel) {
        event.preventDefault();
        closePanel();
        return;
      }

      if (typing) return;

      if (event.altKey && !ctrlOrMeta) {
        const panelMap = {
          a: 'audit',
          n: 'missing',
          y: 'validate',
          v: 'compare',
          l: 'load',
          f: 'filter',
          s: 'select',
          m: 'mutate',
          g: 'factors',
          j: 'join',
          c: 'combine',
          p: 'reshape',
          o: 'plot',
          t: 'tabulate',
          x: 'crosstab',
          r: 'rename',
          h: 'help',
        };
        const panel = panelMap[lower];
        if (panel) {
          event.preventDefault();
          openPanel(panel);
          return;
        }
      }

    });
  }

  function changePage(d) {
    const maxPage = Math.ceil(state.nrow / state.perPage);
    state.page = Math.max(1, Math.min(state.page + d, maxPage));
    renderTable();
  }

  /* ── panel renderers ── */

  function panelShell(pane, icon, title, sub, bodyHtml, applyFn) {
    pane.innerHTML = `
      <div class="tv-panel-header">
        <div class="tv-panel-icon">${icon}</div>
        <div>
          <div class="tv-panel-title">${title}</div>
          <div class="tv-panel-sub">${sub}</div>
        </div>
        <button class="tv-panel-close" onclick="TV.closePanel()">✕</button>
      </div>
      <div class="tv-panel-body" id="panel-body-inner">${bodyHtml}</div>
      <div class="tv-panel-footer">
        <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
        <button class="tv-btn-filled" id="panel-apply-btn">apply ↗</button>
      </div>`;
    const applyBtn = $('panel-apply-btn');
    if (applyBtn && applyFn) applyBtn.addEventListener('click', applyFn);
  }

  function enhanceGeneratedCodeBlocks(root) {
    if (!root) return;
    const labels = [...root.querySelectorAll('div')]
      .filter(el => /^generated r$/i.test(String(el.textContent || '').trim()));

    labels.forEach((labelEl, index) => {
      if (labelEl.dataset.copyReady === 'true') return;
      const previewEl = labelEl.nextElementSibling;
      if (!previewEl || previewEl.nodeType !== 1) return;
      if (!previewEl.id) {
        previewEl.id = `tv-preview-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`;
      }

      labelEl.dataset.copyReady = 'true';
      labelEl.classList.add('tv-preview-header');
      previewEl.classList.add('tv-preview-content');
      labelEl.parentElement?.classList.add('tv-preview-card');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tv-preview-copy-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
          <rect x="5" y="3" width="8" height="10" rx="1.8"></rect>
          <path d="M3.5 10.5V5.2A1.7 1.7 0 0 1 5.2 3.5h4.3"></path>
        </svg>`;
      btn.title = 'copy generated R';
      btn.setAttribute('aria-label', 'copy generated R');
      btn.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        copyPreviewBlock(previewEl.id, 'generated R code');
      });
      labelEl.appendChild(btn);
    });
  }

  function expressionBuilderHtml(targetId, cols, options = {}) {
    const functions = options.functions || [];
    const snippets = options.snippets || [' + ', ' - ', ' * ', ' / ', ' == ', ' != ', ' > ', ' < ', ' >= ', ' <= ', ' & ', ' | ', ' %in% ', 'ifelse(', '(', ')'];
    const snippetLabels = Object.assign({
      'ifelse(': 'ifelse()',
      ' %in% ': '%in%',
      ' + ': '+',
      ' - ': '-',
      ' * ': '*',
      ' / ': '/',
      ' == ': '==',
      ' != ': '!=',
      ' > ': '>',
      ' < ': '<',
      ' >= ': '>=',
      ' <= ': '<=',
      ' & ': '&',
      ' | ': '|',
    }, options.snippetLabels || {});
    const colOpts = (cols || []).map(c => `<option value="${escapeAttr(rName(c.name))}">${escapeHtml(c.name)}</option>`).join('');
    const fnOpts = functions.map(fn => `<option value="${fn}(">${fn}()</option>`).join('');
    const snippetButtons = snippets.map(snippet =>
      `<button type="button" class="tv-chip" style="padding:6px 12px;min-width:42px;text-align:center" onclick="TV.insertExpr('${targetId}', ${JSON.stringify(snippet)})">${snippetLabels[snippet] || snippet.trim() || snippet}</button>`
    ).join('');

    return `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <select class="tv-select" style="flex:1;min-width:130px;padding:6px 8px;font-size:12px" onchange="TV.insertExpr('${targetId}', this.value);this.value=''">
          <option value="">insert column…</option>${colOpts}
        </select>
        <select class="tv-select" style="flex:1;min-width:130px;padding:6px 8px;font-size:12px" onchange="TV.insertExpr('${targetId}', this.value);this.value=''">
          <option value="">insert function…</option>${fnOpts}
        </select>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px">${snippetButtons}</div>`;
  }

  function mutateExpressionBuilderHtml(targetId, cols, options = {}) {
    const functions = options.functions || [];
    const snippetDefs = options.snippets || [
      { insert: ' + ', label: '+ add' },
      { insert: ' - ', label: '- subtract' },
      { insert: ' * ', label: '* multiply' },
      { insert: ' / ', label: '/ divide' },
      { insert: ' == ', label: '= equals' },
      { insert: ' != ', label: '!= not equal' },
      { insert: ' > ', label: '> greater than' },
      { insert: ' < ', label: '< less than' },
      { insert: ' >= ', label: '>= at least' },
      { insert: ' <= ', label: '<= at most' },
      { insert: ' & ', label: 'and' },
      { insert: ' | ', label: 'or' },
      { insert: ' %in% ', label: 'in list' },
      { insert: 'ifelse(', label: 'ifelse()' },
      { insert: '(', label: '(' },
      { insert: ')', label: ')' }
    ];
    const colOpts = (cols || []).map(c => `<option value="${escapeAttr(rName(c.name))}">${escapeHtml(c.name)}</option>`).join('');
    const friendlyFnLabel = fn => {
      const clean = String(fn || '').replace(/^data\.table::/, '');
      const labels = {
        round: 'round a result',
        abs: 'absolute value',
        trimws: 'trim spaces',
        startsWith: 'starts with',
        endsWith: 'ends with',
        'tools::toTitleCase': 'title case text',
        'as.Date': 'parse as Date',
        'data.table::as.IDate': 'parse as IDate',
        format: 'format a date or value',
        difftime: 'difference between dates',
        'as.numeric': 'convert to number',
        'as.character': 'convert to text',
        'as.integer': 'convert to whole number',
        'as.logical': 'convert to TRUE/FALSE',
        ifelse: 'basic if/else',
        grepl: 'detect text pattern',
        gsub: 'replace matching text',
        sub: 'replace first match',
        'data.table::fifelse': 'fast if/else',
        'data.table::fcoalesce': 'fill missing values',
        'data.table::shift': 'lead or lag',
        'data.table::fcase': 'multiple conditions'
      };
      return `${labels[fn] || labels[clean] || clean} (${clean}())`;
    };
    const fnOpts = functions.map(fn => `<option value="${fn}(">${escapeHtml(friendlyFnLabel(fn))}</option>`).join('');
    const snippetButtons = snippetDefs.map(snippet =>
      `<button type="button" class="tv-chip" style="padding:6px 12px;min-width:42px;text-align:center" data-target-id="${escapeAttr(targetId)}" data-insert="${escapeAttr(snippet.insert)}" onclick="TV.insertExprFromButton(this)">${escapeHtml(snippet.label)}</button>`
    ).join('');

    return `
      <div style="margin-top:10px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:6px;font-weight:500">Build The Formula</div>
        <div style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6;margin-bottom:10px">
          Start with the source column you want to use, then add a function or formula piece. tidyview will explain the formula below in plain English.
        </div>
        <div class="tv-builder-grid">
          <div>
            <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">source column</div>
            <select class="tv-select tv-select-builder" onchange="TV.insertExpr('${targetId}', this.value);this.value=''">
              <option value="">choose column...</option>${colOpts}
            </select>
          </div>
          <div>
            <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">common function</div>
            <select class="tv-select tv-select-builder" onchange="TV.insertExpr('${targetId}', this.value);this.value=''">
              <option value="">choose function...</option>${fnOpts}
            </select>
          </div>
        </div>
        <div style="margin-top:10px">
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:6px;font-weight:500">formula pieces</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${snippetButtons}</div>
        </div>
      </div>
    `;
  }

  function formatEnglishList(items, conjunction = 'and') {
    const vals = (items || []).filter(Boolean);
    if (!vals.length) return '';
    if (vals.length === 1) return vals[0];
    if (vals.length === 2) return `${vals[0]} ${conjunction} ${vals[1]}`;
    return `${vals.slice(0, -1).join(', ')}, ${conjunction} ${vals[vals.length - 1]}`;
  }

  function detectExprColumns(expr, cols) {
    const text = String(expr || '');
    if (!text.trim()) return [];
    const names = (cols || []).map(c => String(c.name ?? '')).filter(Boolean);
    return names.filter(name => {
      const codeName = rName(name);
      if (codeName !== name) return text.includes(codeName);
      const escaped = escapeRegex(name);
      return new RegExp(`(^|[^A-Za-z0-9._])${escaped}([^A-Za-z0-9._]|$)`).test(text);
    });
  }

  function humanizeMutateExpr(expr, cols) {
    const text = String(expr || '').trim();
    const sources = detectExprColumns(text, cols);
    const sourceText = sources.length ? formatEnglishList(sources.map(name => `"${name}"`)) : '';

    if (!text) return { sources, summary: 'Choose a source column and tell tidyview how to transform it.' };

    const roundMatch = text.match(/^round\((.+),\s*([0-9]+)\)$/);
    if (roundMatch) {
      const inner = roundMatch[1].trim();
      const digits = Number(roundMatch[2]);
      const digitsText = digits === 0 ? 'a whole number' : `${digits} decimal place${digits === 1 ? '' : 's'}`;
      const innerSources = detectExprColumns(inner, cols);
      const innerSourceText = innerSources.length ? `"${innerSources[0]}"` : 'the source value';
      const divMatch = inner.match(/^(.+?)\s*\/\s*([0-9.]+)$/);
      const multMatch = inner.match(/^(.+?)\s*\*\s*([0-9.]+)$/);
      if (divMatch && innerSources.length === 1) {
        return { sources, summary: `Take ${innerSourceText}, divide it by ${divMatch[2]}, then round the result to ${digitsText}.` };
      }
      if (multMatch && innerSources.length === 1) {
        return { sources, summary: `Take ${innerSourceText}, multiply it by ${multMatch[2]}, then round the result to ${digitsText}.` };
      }
      return { sources, summary: `Calculate a value from ${sourceText || 'the selected inputs'}, then round the result to ${digitsText}.` };
    }

    if (/^data\.table::fifelse\(/.test(text) || /^ifelse\(/.test(text)) {
      return { sources, summary: `Check a condition row by row, then return one value when it is true and another value when it is false${sourceText ? ` using ${sourceText}` : ''}.` };
    }
    if (/^data\.table::fcoalesce\(/.test(text)) {
      return { sources, summary: `Fill missing values by taking the first non-missing value from ${sourceText || 'the listed inputs'} from left to right.` };
    }
    if (/^data\.table::shift\(/.test(text)) {
      const typeMatch = text.match(/type\s*=\s*"([^"]+)"/);
      const nMatch = text.match(/n\s*=\s*([0-9]+)L?/);
      const kind = (typeMatch && typeMatch[1]) === 'lead' ? 'next' : 'previous';
      const count = nMatch ? nMatch[1] : '1';
      return { sources, summary: `Use the ${kind} value ${count} row${count === '1' ? '' : 's'} away from ${sourceText || 'the chosen source column'}.` };
    }
    if (/^(data\.table::as\.IDate|as\.Date)\(/.test(text)) {
      return { sources, summary: `Parse ${sourceText || 'the source text'} as a date value.` };
    }
    if (/^as\.integer\(format\(.+,"%Y"\)\)/.test(text)) {
      return { sources, summary: `Extract the year from ${sourceText || 'the source date'}.` };
    }
    if (/^as\.integer\(format\(.+,"%m"\)\)/.test(text)) {
      return { sources, summary: `Extract the month number from ${sourceText || 'the source date'}.` };
    }
    if (/^as\.integer\(format\(.+,"%d"\)\)/.test(text)) {
      return { sources, summary: `Extract the day of the month from ${sourceText || 'the source date'}.` };
    }
    if (/^format\(.+,"%Y-%m"\)/.test(text)) {
      return { sources, summary: `Turn ${sourceText || 'the source date'} into a year-month text value.` };
    }
    if (/^grepl\(/.test(text)) {
      return { sources, summary: `Check whether ${sourceText || 'the source text'} matches a pattern and return TRUE or FALSE.` };
    }
    if (text.includes('gsub("[[:punct:]]+", "",')) {
      return { sources, summary: `Remove punctuation from ${sourceText || 'the source text'}.` };
    }
    if (/^trimws\(gsub\(/.test(text) && text.includes('\\\\s+')) {
      return { sources, summary: `Collapse repeated spaces in ${sourceText || 'the source text'} and trim leading or trailing spaces.` };
    }
    if (/^gsub\(/.test(text)) {
      return { sources, summary: `Replace every matching piece of text in ${sourceText || 'the source column'}.` };
    }
    if (/^sub\(/.test(text)) {
      return { sources, summary: `Replace the first matching piece of text in ${sourceText || 'the source column'}.` };
    }
    if (/^trimws\(/.test(text)) {
      return { sources, summary: `Trim extra spaces from ${sourceText || 'the source text'}.` };
    }
    if (/tools::toTitleCase\(/.test(text)) {
      return { sources, summary: `Convert ${sourceText || 'the source text'} to title case.` };
    }
    if (/^toupper\(/.test(text)) {
      return { sources, summary: `Convert ${sourceText || 'the source text'} to uppercase.` };
    }
    if (/^tolower\(/.test(text)) {
      return { sources, summary: `Convert ${sourceText || 'the source text'} to lowercase.` };
    }
    if (/^format\(.+,"%B"\)/.test(text)) {
      return { sources, summary: `Turn ${sourceText || 'the source date'} into a month label.` };
    }
    if (/^factor\(/.test(text)) {
      return { sources, summary: 'Turn the result into a factor, so it behaves like a categorical value.' };
    }
    if (sources.length === 1) {
      return { sources, summary: `Use ${sourceText} to calculate a new value with this formula.` };
    }
    if (sources.length > 1) {
      return { sources, summary: `Combine ${sourceText} to calculate a new value with this formula.` };
    }
    return { sources, summary: 'Use this formula exactly as written to calculate the new column.' };
  }

  function buildFilterConditionExpr(condition) {
    const col = condition?.col;
    const op = condition?.op || '==';
    const rawVal = condition?.val || '';
    if (!col) return '';
    if (op === 'is.na') return `is.na(${rName(col)})`;
    if (op === '!is.na') return `!is.na(${rName(col)})`;
    if (op === '%like%') return `grepl(${rString(rawVal || '')}, as.character(${rName(col)}), fixed = TRUE)`;
    const formatted = formatFilterHelperValue(col, op, rawVal);
    return `${rName(col)} ${op} ${formatted}`;
  }

  function buildFilterConditionsExpr(conditions, logic = 'AND') {
    const parts = (conditions || []).map(buildFilterConditionExpr).filter(Boolean);
    if (!parts.length) return '';
    return logic === 'OR' ? parts.join(' | ') : parts.join(' & ');
  }

  function describeFilterCondition(condition) {
    const col = condition?.col;
    const op = condition?.op || '==';
    const rawVal = String(condition?.val || '').trim();
    if (!col) return '';
    const wrappedCol = `"${col}"`;
    const opLabels = {
      '==': 'equals',
      '!=': 'does not equal',
      '>': 'is greater than',
      '>=': 'is at least',
      '<': 'is less than',
      '<=': 'is at most',
      '%in%': 'is in',
      '!%in%': 'is not in',
      '%like%': 'contains',
      'is.na': 'is missing',
      '!is.na': 'is not missing',
    };
    const formatHumanValue = value => {
      const text = String(value || '').trim();
      if (/^-?\d+(?:\.\d+)?$/.test(text) || /^(TRUE|FALSE)$/i.test(text)) return text;
      return `"${text}"`;
    };
    if (op === 'is.na' || op === '!is.na') return `${wrappedCol} ${opLabels[op]}`;
    if (op === '%in%' || op === '!%in%') {
      const parts = rawVal.split(',').map(x => x.trim()).filter(Boolean);
      const values = parts.length ? formatEnglishList(parts.map(formatHumanValue), 'or') : 'the listed values';
      return `${wrappedCol} ${opLabels[op]} ${values}`;
    }
    if (op === '%like%') return `${wrappedCol} contains ${formatHumanValue(rawVal)}`;
    return `${wrappedCol} ${opLabels[op] || op} ${formatHumanValue(rawVal)}`;
  }

  function describeFilterSelection(mode, cols, predicateText) {
    const sources = (cols || []).filter(Boolean);
    if (!sources.length) {
      return {
        sourceSummary: 'Source columns: choose one or more columns.',
        friendlySummary: 'Choose one or more columns, then tell tidyview what each row should match.',
      };
    }
    const sourceList = formatEnglishList(sources.map(col => `"${col}"`));
    const quantifier = mode === 'if_all' ? 'all of' : 'any of';
    return {
      sourceSummary: `Source columns: ${sources.join(', ')}`,
      friendlySummary: `Keep rows where ${quantifier} ${sourceList} ${predicateText}.`,
    };
  }

  function insertExpr(targetId, snippet) {
    const input = $(targetId);
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + snippet + input.value.slice(end);
    const nextPos = start + snippet.length;
    input.focus();
    input.selectionStart = nextPos;
    input.selectionEnd = nextPos;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertExprFromButton(button) {
    if (!button) return;
    const targetId = button.getAttribute('data-target-id') || '';
    const snippet = button.getAttribute('data-insert') || '';
    if (!targetId) return;
    insertExpr(targetId, snippet);
  }

  function caseWhenBuilderHtml(prefix, options = {}) {
    const note = options.note || 'Rules are converted into a valid data.table::fcase(...) expression.';
    const defaultLabel = options.defaultLabel || 'otherwise';
    const defaultPlaceholder = options.defaultPlaceholder || 'e.g. NA_character_';
    return `
      <div id="${prefix}-case-builder" style="margin-top:10px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant)">
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:10px;line-height:1.6">${note}</div>
        <div id="${prefix}-case-rows"></div>
        <button class="tv-add-btn" type="button" onclick="TV.addCaseWhenRow('${prefix}')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/></svg>
          add rule
        </button>
        <div class="tv-field" style="margin:10px 0 0">
          <label class="tv-field-label">${defaultLabel}</label>
          <input class="tv-input" id="${prefix}-case-default" placeholder="${defaultPlaceholder}" oninput="TV.syncCaseWhenBuilder('${prefix}')">
        </div>
      </div>`;
  }

  function ensureCaseWhenStore() {
    window.__TV_CASE_BUILDERS__ = window.__TV_CASE_BUILDERS__ || {};
    return window.__TV_CASE_BUILDERS__;
  }

  function initCaseWhenBuilder(prefix, options = {}) {
    const store = ensureCaseWhenStore();
    store[prefix] = {
      rows: [],
      targetId: options.targetId || '',
      defaultValue: options.defaultValue,
      defaultResolver: options.defaultResolver || null,
    };
    const defaultEl = $(`${prefix}-case-default`);
    if (defaultEl) {
      const resolved = options.defaultValue ?? (typeof options.defaultResolver === 'function' ? options.defaultResolver() : '');
      defaultEl.value = resolved || '';
    }
    addCaseWhenRow(prefix);
    syncCaseWhenBuilder(prefix);
  }

  function addCaseWhenRow(prefix, whenValue = '', thenValue = '') {
    const store = ensureCaseWhenStore();
    if (!store[prefix]) return;
    const id = 'cw' + Date.now() + Math.floor(Math.random() * 1000);
    store[prefix].rows.push(id);
    const container = $(`${prefix}-case-rows`);
    if (!container) return;
    const row = document.createElement('div');
    row.id = `${prefix}-case-row-${id}`;
    row.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface)';
    row.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);font-weight:500">if / then rule</div>
        <button type="button" onclick="TV.removeCaseWhenRow('${prefix}', '${id}')" style="width:26px;height:26px;border-radius:50%;border:none;background:transparent;color:var(--md-on-surface-variant);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0">x</button>
      </div>
      <div>
        <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">when</div>
        <input class="tv-input" id="${prefix}-case-when-${id}" value="${escapeAttr(whenValue)}" placeholder="e.g. sex == 1" style="font-family:var(--tv-type-mono);font-size:12px" oninput="TV.syncCaseWhenBuilder('${prefix}')">
      </div>
      <div>
        <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">then</div>
        <input class="tv-input" id="${prefix}-case-then-${id}" value="${escapeAttr(thenValue)}" placeholder='e.g. "Male"' style="font-family:var(--tv-type-mono);font-size:12px" oninput="TV.syncCaseWhenBuilder('${prefix}')">
      </div>`;
    container.appendChild(row);
    syncCaseWhenBuilder(prefix);
  }

  function removeCaseWhenRow(prefix, id) {
    const store = ensureCaseWhenStore();
    if (!store[prefix]) return;
    store[prefix].rows = store[prefix].rows.filter(rowId => rowId !== id);
    $(`${prefix}-case-row-${id}`)?.remove();
    syncCaseWhenBuilder(prefix);
  }

  function getCaseWhenExpr(prefix) {
    const store = ensureCaseWhenStore();
    const cfg = store[prefix];
    if (!cfg) return '';
    const pairs = (cfg.rows || []).map(id => ({
      when: $(`${prefix}-case-when-${id}`)?.value?.trim() || '',
      then: $(`${prefix}-case-then-${id}`)?.value?.trim() || '',
    })).filter(rule => rule.when && rule.then);
    if (!pairs.length) return '';
    const defaultEl = $(`${prefix}-case-default`);
    let defaultExpr = defaultEl?.value?.trim() || '';
    if (!defaultExpr && typeof cfg.defaultResolver === 'function') defaultExpr = cfg.defaultResolver() || '';
    if (!defaultExpr) defaultExpr = 'NA';
    const args = [];
    pairs.forEach(rule => {
      args.push(rule.when, rule.then);
    });
    args.push(`default = ${defaultExpr}`);
    return `data.table::fcase(${args.join(', ')})`;
  }

  function syncCaseWhenBuilder(prefix) {
    const store = ensureCaseWhenStore();
    const cfg = store[prefix];
    if (!cfg) return;
    const expr = getCaseWhenExpr(prefix);
    if (cfg.targetId) {
      const target = $(cfg.targetId);
      if (target) {
        target.value = expr;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    return expr;
  }

  const FILTER_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h14M6 10h8M9 15h2" stroke-linecap="round"/></svg>`;
  const SELECT_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14" rx="2"/><line x1="3" y1="8" x2="17" y2="8"/><line x1="8" y1="8" x2="8" y2="17"/></svg>`;
  const MUTATE_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>`;
  const SUM_SVG    = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 5h10M5 10h6M5 15h10" stroke-linecap="round"/><circle cx="15" cy="13" r="3" fill="currentColor" fill-opacity=".3"/></svg>`;

  function renderFilterPanel(pane) {
    if (!state.dt) return panelShell(pane, FILTER_SVG, 'filter rows', 'Load data first', '<p style="color:var(--md-on-surface-variant);font-size:13px">No data loaded.</p>', null);

    const colOpts = state.dt.map(c => `<option value="${c.name}">${c.name} (${c.type})</option>`).join('');

    const bodyHtml = `
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:12px">
        Choose the rows you want to keep. You can write step-by-step rules, or check the same rule across several columns at once.
      </div>
      <div class="tv-field" style="margin-top:0">
        <label class="tv-field-label">how to choose rows</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="filter-mode-conditions" onclick="TV.setFilterMode('conditions')">step-by-step rules</button>
          <button class="tv-chip" id="filter-mode-ifany" onclick="TV.setFilterMode('if_any')">match any column</button>
          <button class="tv-chip" id="filter-mode-ifall" onclick="TV.setFilterMode('if_all')">match all columns</button>
        </div>
      </div>

      <div id="filter-conditions-section">
        <div id="cond-list"></div>
        <button class="tv-add-btn" onclick="TV.addCondition()">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/></svg>
          add rule
        </button>
        <div style="margin-top:16px;display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--md-on-surface-variant)">when using several rules:</span>
          <button class="tv-chip selected" id="logic-and" onclick="TV.setLogic('AND')">AND</button>
          <button class="tv-chip" id="logic-or" onclick="TV.setLogic('OR')">OR</button>
        </div>
      </div>

      <div id="filter-helper-section" style="display:none">
        <div class="tv-field">
          <label class="tv-field-label">source columns</label>
          <div id="filter-helper-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
          <select class="tv-select" id="filter-helper-add" onchange="TV.addFilterHelperCol(this.value);this.value=''">
            <option value="">add column...</option>${colOpts}
          </select>
        </div>
        <div class="tv-field">
          <label class="tv-field-label">matching rule</label>
          <select class="tv-select" id="filter-helper-op" onchange="TV.updateFilterHelperPreview()">
            <option value="==">equals</option>
            <option value="!=">not equal</option>
            <option value=">">greater than</option>
            <option value=">=">greater than or equal</option>
            <option value="<">less than</option>
            <option value="<=">less than or equal</option>
            <option value="%in%">in list</option>
            <option value="!%in%">not in</option>
            <option value="%like%">contains</option>
            <option value="is.na">is NA</option>
            <option value="!is.na">not NA</option>
          </select>
        </div>
        <div class="tv-field">
          <label class="tv-field-label">compare to</label>
          <input class="tv-input" id="filter-helper-val" placeholder="e.g. 1, North, or A,B,C" oninput="TV.updateFilterHelperPreview()">
        </div>
        <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
          <div id="filter-helper-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap">
            <span style="color:var(--md-on-surface-variant);font-style:italic">choose columns above...</span>
          </div>
        </div>
        <div id="filter-impact" style="margin-top:8px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);font-size:11px;color:var(--md-on-surface-variant)">
          Choose columns above to preview the impact.
        </div>
      </div>

      <div id="filter-standard-impact" style="margin-top:8px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);font-size:11px;color:var(--md-on-surface-variant)">
        Add at least one condition to preview the impact.
      </div>
      <div style="margin-top:10px;background:var(--md-surface-variant);border-radius:8px;padding:10px 12px;border:1px solid var(--md-outline-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:6px;font-weight:500">What This Will Do</div>
        <div id="filter-target-summary" style="font-size:12px;color:var(--md-on-surface);margin-bottom:6px">Rows kept: choose at least one rule.</div>
        <div id="filter-source-summary" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:6px">Source columns: none selected yet.</div>
        <div id="filter-friendly-summary" style="font-size:11px;color:var(--md-on-surface);line-height:1.6;margin-bottom:10px">Choose the rule that rows must match to stay in the table.</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">Generated R</div>
        <div id="filter-preview-code" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap">
          <span style="color:var(--md-on-surface-variant);font-style:italic">Choose a rule above...</span>
        </div>
      </div>`;

    panelShell(pane, FILTER_SVG, 'filter rows', `DT[i] · ${state.nrow.toLocaleString()} rows`, bodyHtml, applyFilter);

    window.__colOpts = colOpts;
    window.__filterLogic = 'AND';
    window.__conditions = [];
    window.__filterMode = 'conditions';
    window.__filterHelperCols = [];
    window.__filterPreviewSeq = 0;
    addCondition();
    updateFilterModeUI();
  }

  function addCondition() {
    window.__conditions = window.__conditions || [];
    const id = Date.now();
    window.__conditions.push(id);
    const list = $('cond-list');
    if (!list) return;

    const row = document.createElement('div');
    row.id = 'cond-' + id;
    row.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface)';
    row.innerHTML = `
      <select class="tv-select" style="padding:7px 10px;font-size:12px" id="col-${id}" onchange="TV.updateFilterConditionsPreview()">${window.__colOpts}</select>
      <select class="tv-select" style="padding:7px 8px;font-size:12px" id="op-${id}" onchange="TV.updateFilterConditionsPreview()">
        <option value="==">=</option>
        <option value="!=">≠</option>
        <option value=">">&gt;</option>
        <option value=">=">&gt;=</option>
        <option value="<">&lt;</option>
        <option value="<=">&lt;=</option>
        <option value="%in%">in list</option>
        <option value="!%in%">not in</option>
        <option value="%like%">contains</option>
        <option value="is.na">is NA</option>
        <option value="!is.na">not NA</option>
      </select>
      <input class="tv-input" style="padding:7px 10px;font-size:12px" id="val-${id}" placeholder="value or values" oninput="TV.updateFilterConditionsPreview()">
      <button onclick="TV.removeCondition(${id})" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;cursor:pointer;color:var(--md-on-surface-variant);font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>`;
    list.appendChild(row);
    updateFilterConditionsPreview();
  }

  function removeCondition(id) {
    const el = $('cond-' + id);
    if (el) el.remove();
    window.__conditions = (window.__conditions || []).filter(c => c !== id);
    updateFilterConditionsPreview();
  }

  function setLogic(v) {
    window.__filterLogic = v;
    $('logic-and').classList.toggle('selected', v === 'AND');
    $('logic-or').classList.toggle('selected',  v === 'OR');
    updateFilterConditionsPreview();
  }

  function setFilterMode(mode) {
    window.__filterMode = mode;
    updateFilterModeUI();
    if (mode === 'conditions') updateFilterConditionsPreview();
    else updateFilterHelperPreview();
  }

  function updateFilterModeUI() {
    const mode = window.__filterMode || 'conditions';
    $('filter-mode-conditions')?.classList.toggle('selected', mode === 'conditions');
    $('filter-mode-ifany')?.classList.toggle('selected', mode === 'if_any');
    $('filter-mode-ifall')?.classList.toggle('selected', mode === 'if_all');
    const condSection = $('filter-conditions-section');
    const helperSection = $('filter-helper-section');
    const stdImpact = $('filter-standard-impact');
    if (condSection) condSection.style.display = mode === 'conditions' ? '' : 'none';
    if (helperSection) helperSection.style.display = mode === 'conditions' ? 'none' : '';
    if (stdImpact) stdImpact.style.display = mode === 'conditions' ? '' : 'none';
    const targetEl = $('filter-target-summary');
    if (targetEl) {
      targetEl.textContent = mode === 'conditions'
        ? 'Rows kept: choose at least one rule.'
        : 'Rows kept: choose columns and one shared rule.';
    }
  }

  function addFilterHelperCol(col) {
    window.__filterHelperCols = window.__filterHelperCols || [];
    if (!col || window.__filterHelperCols.includes(col)) return;
    window.__filterHelperCols.push(col);
    renderFilterHelperCols();
    updateFilterHelperPreview();
  }

  function removeFilterHelperCol(col) {
    window.__filterHelperCols = (window.__filterHelperCols || []).filter(c => c !== col);
    renderFilterHelperCols();
    updateFilterHelperPreview();
  }

  function renderFilterHelperCols() {
    const el = $('filter-helper-chips');
    if (!el) return;
    el.innerHTML = (window.__filterHelperCols || []).map(c => `
      <button class="tv-chip selected" onclick='TV.removeFilterHelperCol(${JSON.stringify(c)})'>
        ${escapeHtml(c)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function formatFilterHelperValue(col, op, rawVal) {
    const meta = (state.dt || []).find(c => c.name === col) || {};
    const type = meta.type || 'chr';
    if (op === 'is.na' || op === '!is.na') return '';
    if (op === '%in%' || op === '!%in%') {
      const parts = String(rawVal || '').split(',').map(x => x.trim()).filter(Boolean);
      if (!parts.length) return 'character(0)';
      if (type === 'int' || type === 'dbl') return `c(${parts.join(', ')})`;
      if (type === 'lgl') return `c(${parts.map(v => String(v).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE').join(', ')})`;
      return `c(${parts.map(v => rString(v)).join(', ')})`;
    }
    if (type === 'int' || type === 'dbl') return rawVal;
    if (type === 'lgl') return String(rawVal).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
    return rString(rawVal);
  }

  function buildFilterHelperPredicate(col, op, rawVal) {
    const name = rName(col);
    if (op === 'is.na') return `is.na(${name})`;
    if (op === '!is.na') return `!is.na(${name})`;
    if (op === '%like%') return `grepl(${rString(rawVal || '')}, as.character(${name}), fixed = TRUE)`;
    const formatted = formatFilterHelperValue(col, op, rawVal);
    return `${name} ${op} ${formatted}`;
  }

  function buildFilterHelperExpr() {
    const cols = window.__filterHelperCols || [];
    const op = $('filter-helper-op')?.value || '==';
    const rawVal = $('filter-helper-val')?.value || '';
    if (!cols.length) return '';
    if (!['is.na', '!is.na'].includes(op) && !String(rawVal).trim()) return '';
    const predicates = cols.map(col => buildFilterHelperPredicate(col, op, rawVal));
    const cmp = (window.__filterMode || 'if_any') === 'if_all' ? `== ${cols.length}` : '> 0';
    return `rowSums(cbind(${predicates.join(', ')}), na.rm = TRUE) ${cmp}`;
  }

  function updateFilterHelperPreview() {
    const prev = $('filter-helper-preview');
    const summaryPrev = $('filter-preview-code');
    const sourceEl = $('filter-source-summary');
    const friendlyEl = $('filter-friendly-summary');
    const targetEl = $('filter-target-summary');
    if (!prev) return;
    const expr = buildFilterHelperExpr();
    if (!expr) {
      prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">choose columns above...</span>`;
      const impact = $('filter-impact');
      if (impact) impact.textContent = 'Choose columns above to preview the impact.';
      if (summaryPrev) summaryPrev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">Choose columns and a rule above...</span>`;
      if (targetEl) targetEl.textContent = 'Rows kept: choose columns and one shared rule.';
      if (sourceEl) sourceEl.textContent = 'Source columns: none selected yet.';
      if (friendlyEl) friendlyEl.textContent = 'Choose one or more columns, then tell tidyview what each row should match.';
      return;
    }
    prev.textContent = `${rName(state.name || 'DT')} <- ${rName(state.name || 'DT')}[${expr}]`;
    if (summaryPrev) summaryPrev.textContent = `${rName(state.name || 'DT')} <- ${rName(state.name || 'DT')}[${expr}]`;
    const cols = window.__filterHelperCols || [];
    const op = $('filter-helper-op')?.value || '==';
    const rawVal = $('filter-helper-val')?.value || '';
    const predicateText = describeFilterCondition({ col: cols[0], op, val: rawVal }).replace(/^"[^"]+"\s+/, '');
    const friendly = describeFilterSelection(window.__filterMode || 'if_any', cols, predicateText || 'match the chosen rule');
    if (targetEl) targetEl.textContent = 'Rows kept: rows that match the shared rule.';
    if (sourceEl) sourceEl.textContent = friendly.sourceSummary;
    if (friendlyEl) friendlyEl.textContent = friendly.friendlySummary;
    requestFilterPreview({ expr });
  }

  function updateFilterConditionsPreview() {
    if ((window.__filterMode || 'conditions') !== 'conditions') return;
    const impact = $('filter-standard-impact');
    const summaryPrev = $('filter-preview-code');
    const targetEl = $('filter-target-summary');
    const sourceEl = $('filter-source-summary');
    const friendlyEl = $('filter-friendly-summary');
    const conditions = (window.__conditions || []).map(id => ({
      col: $('col-' + id)?.value,
      op:  $('op-'  + id)?.value,
      val: $('val-' + id)?.value || '',
    })).filter(c => c.col);
    if (!conditions.length) {
      if (impact) impact.textContent = 'Add at least one condition to preview the impact.';
      if (summaryPrev) summaryPrev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">Choose a rule above...</span>`;
      if (targetEl) targetEl.textContent = 'Rows kept: choose at least one rule.';
      if (sourceEl) sourceEl.textContent = 'Source columns: none selected yet.';
      if (friendlyEl) friendlyEl.textContent = 'Choose the rule that rows must match to stay in the table.';
      return;
    }
    const expr = buildFilterConditionsExpr(conditions, window.__filterLogic);
    const logicWord = window.__filterLogic === 'OR' ? 'or' : 'and';
    const sourceCols = [...new Set(conditions.map(c => c.col).filter(Boolean))];
    const ruleSummary = formatEnglishList(conditions.map(describeFilterCondition), logicWord);
    if (summaryPrev) summaryPrev.textContent = `${rName(state.name || 'DT')} <- ${rName(state.name || 'DT')}[${expr}]`;
    if (targetEl) targetEl.textContent = window.__filterLogic === 'OR'
      ? 'Rows kept: rows that match at least one rule.'
      : 'Rows kept: rows that match every rule.';
    if (sourceEl) sourceEl.textContent = `Source columns: ${sourceCols.join(', ')}`;
    if (friendlyEl) friendlyEl.textContent = `Keep rows where ${ruleSummary}.`;
    requestFilterPreview({ conditions, logic: window.__filterLogic });
  }

  async function requestFilterPreview(payload) {
    const mode = window.__filterMode || 'conditions';
    const impact = mode === 'conditions' ? $('filter-standard-impact') : $('filter-impact');
    if (!impact) return;
    const seq = (window.__filterPreviewSeq || 0) + 1;
    window.__filterPreviewSeq = seq;
    impact.textContent = 'Previewing impact...';
    try {
      const res = await api('preview_op', { op: 'filter', params: payload });
      if ((window.__filterPreviewSeq || 0) !== seq) return;
      impact.textContent = formatImpactSummary(res, mode === 'conditions' ? 'filter' : 'filter');
    } catch (e) {
      if ((window.__filterPreviewSeq || 0) !== seq) return;
      impact.textContent = humanizeErrorMessage(e.message);
    }
  }

  async function applyFilter() {
    if ((window.__filterMode || 'conditions') !== 'conditions') {
      const expr = buildFilterHelperExpr();
      if (!expr) {
        await showMessage('Choose columns and complete the helper predicate.', { title: 'Filter Incomplete' });
        return;
      }
      try {
        const res = await api('op_filter', { expr });
        state.nrow = res.nrow; state.ncol = res.ncol || state.ncol;
        pushCode(res.code);
        updateDimLabel();
        renderTable();
        closePanel();
      } catch(e) { await showError('Filter error: ' + e.message); }
      return;
    }

    const conditions = (window.__conditions || []).map(id => ({
      col: $('col-' + id)?.value,
      op:  $('op-'  + id)?.value,
      val: $('val-' + id)?.value || '',
    })).filter(c => c.col);

    if (!conditions.length) {
      const impact = $('filter-standard-impact');
      if (impact) impact.textContent = 'Add at least one condition to preview the impact.';
      return;
    }

    requestFilterPreview({ conditions, logic: window.__filterLogic });

    try {
      const res = await api('op_filter', { conditions, logic: window.__filterLogic });
      state.nrow = res.nrow; state.ncol = res.ncol || state.ncol;
      pushCode(res.code);
      updateDimLabel();
      renderTable();
      closePanel();
    } catch(e) { await showError('Filter error: ' + e.message); }
  }

  function renderSelectPanel(pane) {
    if (!state.dt) return;
    const items = state.dt.map(c => `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border:0.5px solid var(--md-outline-variant);border-radius:8px;cursor:pointer;margin-bottom:5px;background:var(--md-surface)"
           onclick="TV.toggleSelectCol(this)" data-col="${escapeAttr(c.name)}" data-sel="true" class="sel-col-item sel-col-on">
        <div style="width:16px;height:16px;border-radius:4px;background:var(--md-primary);border:1px solid var(--md-primary);display:flex;align-items:center;justify-content:center;flex-shrink:0" class="sel-cb">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,4 3.5,6.5 9,1"/></svg>
        </div>
        <div style="flex:1;font-size:12px;font-weight:500">${escapeHtml(c.name)}</div>
        <span class="tv-type tv-type-${c.type}">${c.type}</span>
      </div>`).join('');

    const bodyHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:11px;color:var(--md-on-surface-variant)" id="sel-count">${state.dt.length} of ${state.dt.length} selected</span>
        <div style="display:flex;gap:6px">
          <button class="tv-chip" onclick="TV.selectAllCols(true)">all</button>
          <button class="tv-chip" onclick="TV.selectAllCols(false)">none</button>
        </div>
      </div>
      <div id="sel-col-list">${items}</div>`;

    panelShell(pane, SELECT_SVG, 'select columns', `DT[, .(cols)] · keep ${state.dt.length} columns`, bodyHtml, applySelect);
  }

  function toggleSelectCol(el) {
    const on = el.dataset.sel === 'true';
    el.dataset.sel = (!on).toString();
    el.classList.toggle('sel-col-on', !on);
    el.style.opacity = on ? '.45' : '1';
    el.querySelector('.sel-cb').style.background = on ? 'transparent' : 'var(--md-primary)';
    el.querySelector('.sel-cb').style.borderColor = on ? 'var(--md-outline)' : 'var(--md-primary)';
    const svg = el.querySelector('svg');
    if (svg) svg.style.opacity = on ? '0' : '1';
    const count = document.querySelectorAll('.sel-col-item[data-sel="true"]').length;
    const total = state.dt.length;
    const lbl = $('sel-count');
    if (lbl) lbl.textContent = `${count} of ${total} selected`;
  }

  function selectAllCols(val) {
    document.querySelectorAll('.sel-col-item').forEach(el => {
      el.dataset.sel = val.toString();
      el.style.opacity = val ? '1' : '.45';
      el.querySelector('.sel-cb').style.background = val ? 'var(--md-primary)' : 'transparent';
      el.querySelector('.sel-cb').style.borderColor = val ? 'var(--md-primary)' : 'var(--md-outline)';
      const svg = el.querySelector('svg');
      if (svg) svg.style.opacity = val ? '1' : '0';
    });
    const lbl = $('sel-count');
    if (lbl) lbl.textContent = `${val ? state.dt.length : 0} of ${state.dt.length} selected`;
  }

  async function applySelect() {
    const cols = [...document.querySelectorAll('.sel-col-item[data-sel="true"]')]
      .map(el => el.dataset.col);
    if (!cols.length) { await showMessage('Select at least one column.', { title: 'Selection Required' }); return; }
    try {
      const res = await api('op_select', { columns: cols });
      state.dt = res.columns; state.nrow = res.nrow; state.ncol = res.ncol;
      pushCode(res.code); updateDimLabel(); renderTable(); closePanel();
    } catch(e) { await showError('Error: ' + e.message); }
  }

  function renderMutatePanel(pane) {
    if (!state.dt) return;
    const sourceExprToLabel = new Map(state.dt.map(c => [rName(c.name), c.name]));
    const helperColOpts = state.dt.map(c => `<option value="${escapeAttr(rName(c.name))}">${escapeHtml(c.name)}</option>`).join('');
    const numericColOpts = state.dt
      .filter(c => ['int', 'dbl'].includes(c.type))
      .map(c => `<option value="${escapeAttr(rName(c.name))}">${escapeHtml(c.name)}</option>`)
      .join('');
    const builderHtml = mutateExpressionBuilderHtml('mut-expr', state.dt, {
      functions: ['round','floor','ceiling','abs','log','log2','log10','sqrt',
        'cumsum','cumprod','cummax','cummin','nchar','toupper','tolower',
        'trimws','startsWith','endsWith','tools::toTitleCase','as.Date','data.table::as.IDate','format','difftime','as.numeric','as.character','as.integer','as.logical','ifelse',
        'grepl','gsub','sub','data.table::fifelse','data.table::fcoalesce','data.table::shift','data.table::fcase']
    });
    const caseHtml = caseWhenBuilderHtml('mut', {
      note: 'Build tidyverse-style case_when rules. tidyview will generate the equivalent data.table::fcase(...) expression.',
      defaultLabel: 'otherwise expression',
      defaultPlaceholder: 'e.g. NA_character_',
      defaultValue: 'NA_character_',
    });
    const helperHtml = `
      <div style="margin-top:10px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:8px;font-weight:500">helper recipes and builders</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          <button class="tv-chip selected" id="mut-helper-manual">manual</button>
          <button class="tv-chip" id="mut-helper-convert">conversion</button>
          <button class="tv-chip" id="mut-helper-ifelse">if_else</button>
          <button class="tv-chip" id="mut-helper-coalesce">coalesce</button>
          <button class="tv-chip" id="mut-helper-shift">lead / lag</button>
          <button class="tv-chip" id="mut-helper-date">date</button>
          <button class="tv-chip" id="mut-helper-string">string</button>
          <button class="tv-chip" id="mut-helper-regex">regex</button>
          <button class="tv-chip" id="mut-helper-across">across</button>
        </div>

        <div id="mut-helper-manual-panel" style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6">
          <div style="margin-bottom:8px">
            Start from a quick recipe, or type the formula yourself. These recipe buttons switch to the matching helper and prefill the common setup for you.
          </div>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">numeric and unit conversions</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <button type="button" class="tv-chip" data-mut-recipe="convert:cm_to_in">cm -&gt; inches</button>
            <button type="button" class="tv-chip" data-mut-recipe="convert:kg_to_lb">kg -&gt; pounds</button>
            <button type="button" class="tv-chip" data-mut-recipe="convert:prop_to_pct">ratio -&gt; percent</button>
            <button type="button" class="tv-chip" data-mut-recipe="convert:pct_to_prop">percent -&gt; proportion</button>
          </div>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">text cleanup recipes</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <button type="button" class="tv-chip" data-mut-recipe="string:trim">trim spaces</button>
            <button type="button" class="tv-chip" data-mut-recipe="string:title">title case</button>
            <button type="button" class="tv-chip" data-mut-recipe="string:upper">UPPER CASE</button>
            <button type="button" class="tv-chip" data-mut-recipe="string:lower">lower case</button>
            <button type="button" class="tv-chip" data-mut-recipe="string:remove_punct">remove punctuation</button>
            <button type="button" class="tv-chip" data-mut-recipe="string:collapse_spaces">collapse spaces</button>
          </div>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">date helpers</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="tv-chip" data-mut-recipe="date:year">extract year</button>
            <button type="button" class="tv-chip" data-mut-recipe="date:month_label">month label</button>
            <button type="button" class="tv-chip" data-mut-recipe="date:age_years">age in years</button>
          </div>
        </div>

        <div id="mut-helper-convert-panel" style="display:none">
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.6">
            Build common unit conversions without typing the full expression by hand.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">source column</div>
              <select class="tv-select" id="mut-convert-source" style="font-size:12px">
                <option value="">choose numeric column...</option>${numericColOpts}
              </select>
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">conversion</div>
              <select class="tv-select" id="mut-convert-kind" style="font-size:12px">
                <option value="cm_to_in">centimeters -&gt; inches</option>
                <option value="in_to_cm">inches -&gt; centimeters</option>
                <option value="kg_to_lb">kilograms -&gt; pounds</option>
                <option value="lb_to_kg">pounds -&gt; kilograms</option>
                <option value="m_to_ft">meters -&gt; feet</option>
                <option value="ft_to_m">feet -&gt; meters</option>
                <option value="prop_to_pct">proportion -&gt; percent</option>
                <option value="pct_to_prop">percent -&gt; proportion</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">round digits</div>
              <input class="tv-input" id="mut-convert-digits" type="number" min="0" step="1" value="1" style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
            <div style="font-size:10px;color:var(--md-on-surface-variant);line-height:1.6;align-self:end">
              Tip: name the output column with the new unit, like <code>height_in</code> or <code>mass_lb</code>.
            </div>
          </div>
        </div>

        <div id="mut-helper-ifelse-panel" style="display:none">
          <div style="display:grid;grid-template-columns:1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">condition</div>
              <input class="tv-input" id="mut-ifelse-cond" placeholder="e.g. sex == 1" style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">value when true</div>
              <input class="tv-input" id="mut-ifelse-true" placeholder='e.g. "Male"' style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">value when false</div>
              <input class="tv-input" id="mut-ifelse-false" value="NA_character_" placeholder='e.g. "Female"' style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
          </div>
        </div>

        <div id="mut-helper-coalesce-panel" style="display:none">
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.6">
            Fill missing values by taking the first non-missing expression from left to right.
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">expression 1</div>
              <select class="tv-select" id="mut-coalesce-1" style="font-size:12px">
                <option value="">choose column or type in the expression box...</option>${helperColOpts}
              </select>
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">expression 2</div>
              <select class="tv-select" id="mut-coalesce-2" style="font-size:12px">
                <option value="">choose column or type in the expression box...</option>${helperColOpts}
              </select>
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">expression 3 (optional)</div>
              <select class="tv-select" id="mut-coalesce-3" style="font-size:12px">
                <option value="">optional fallback...</option>${helperColOpts}
              </select>
            </div>
          </div>
        </div>

        <div id="mut-helper-shift-panel" style="display:none">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">type</div>
              <select class="tv-select" id="mut-shift-type" style="font-size:12px">
                <option value="lead">lead</option>
                <option value="lag">lag</option>
              </select>
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">n</div>
              <input class="tv-input" id="mut-shift-n" type="number" min="1" step="1" value="1" style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">source expression</div>
              <select class="tv-select" id="mut-shift-source" style="font-size:12px">
                <option value="">choose column or type in the expression box...</option>${helperColOpts}
              </select>
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">fill value (optional)</div>
              <input class="tv-input" id="mut-shift-fill" placeholder='e.g. NA_real_ or 0' style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
          </div>
        </div>

        <div id="mut-helper-date-panel" style="display:none">
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.6">
            Parse text into dates, extract date parts, or calculate age from a date column.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">source column</div>
              <select class="tv-select" id="mut-date-source" style="font-size:12px">
                <option value="">choose column...</option>${helperColOpts}
              </select>
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">action</div>
              <select class="tv-select" id="mut-date-mode" style="font-size:12px">
                <option value="parse_idate">parse as IDate</option>
                <option value="parse_date">parse as Date</option>
                <option value="year">extract year</option>
                <option value="month">extract month</option>
                <option value="month_label">month label</option>
                <option value="day">extract day</option>
                <option value="year_month">year-month text</option>
                <option value="age_years">age in years</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">input format (optional)</div>
              <input class="tv-input" id="mut-date-format" placeholder='e.g. %Y-%m-%d' style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
            <div id="mut-date-ref-wrap" style="display:none">
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">reference date</div>
              <input class="tv-input" id="mut-date-ref" value="Sys.Date()" placeholder='e.g. Sys.Date() or as.Date("2026-01-01")' style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
          </div>
        </div>

        <div id="mut-helper-string-panel" style="display:none">
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.6">
            Common text operations inspired by stringr, generated as paste-ready base R or data.table-friendly expressions.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">source column</div>
              <select class="tv-select" id="mut-string-source" style="font-size:12px">
                <option value="">choose column...</option>${helperColOpts}
              </select>
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">action</div>
              <select class="tv-select" id="mut-string-mode" style="font-size:12px">
                <option value="detect">detect pattern</option>
                <option value="extract">extract match</option>
                <option value="replace">replace text</option>
                <option value="remove">remove text</option>
                <option value="trim">trim whitespace</option>
                <option value="title">title case</option>
                <option value="upper">UPPER CASE</option>
                <option value="lower">lower case</option>
                <option value="remove_punct">remove punctuation</option>
                <option value="collapse_spaces">collapse repeated spaces</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px">
            <div id="mut-string-pattern-wrap">
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">pattern</div>
              <input class="tv-input" id="mut-string-pattern" placeholder='e.g. [0-9]+ or ^A' style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
            <div id="mut-string-replacement-wrap">
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">replacement</div>
              <input class="tv-input" id="mut-string-replacement" placeholder='e.g. "_" or "\\1"' style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
            <label id="mut-string-ignore-case-wrap" style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--md-on-surface-variant)">
              <input type="checkbox" id="mut-string-ignore-case">
              ignore case
            </label>
          </div>
        </div>

        <div id="mut-helper-regex-panel" style="display:none">
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.6">
            Use regular expressions to detect, remove, or replace text in a character column.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">source column</div>
              <select class="tv-select" id="mut-regex-source" style="font-size:12px">
                <option value="">choose column...</option>${helperColOpts}
              </select>
            </div>
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">action</div>
              <select class="tv-select" id="mut-regex-mode" style="font-size:12px">
                <option value="detect">detect match</option>
                <option value="replace">replace matches</option>
                <option value="remove">remove matches</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">pattern</div>
              <input class="tv-input" id="mut-regex-pattern" placeholder='e.g. ^[A-Z]{2}[0-9]+$' style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
            <div id="mut-regex-replacement-wrap">
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">replacement</div>
              <input class="tv-input" id="mut-regex-replacement" placeholder='e.g. "_" or ""' style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--md-on-surface-variant)">
              <input type="checkbox" id="mut-regex-ignore-case">
              ignore case
            </label>
          </div>
        </div>

        <div id="mut-helper-across-panel" style="display:none">
          <div class="tv-field" style="margin-top:0">
            <label class="tv-field-label">columns</label>
            <div id="mut-across-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
            <select class="tv-select" id="mut-across-add" style="font-size:12px">
              <option value="">add column...</option>${helperColOpts}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">transform</div>
              <select class="tv-select" id="mut-across-transform" style="font-size:12px">
                <option value="tolower">tolower</option>
                <option value="toupper">toupper</option>
                <option value="trimws">trimws</option>
                <option value="as.numeric">as.numeric</option>
                <option value="as.character">as.character</option>
                <option value="as.integer">as.integer</option>
                <option value="as.logical">as.logical</option>
                <option value="abs">abs</option>
                <option value="round">round</option>
                <option value="custom">custom template</option>
              </select>
            </div>
            <div id="mut-across-digits-wrap" style="display:none">
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">digits</div>
              <input class="tv-input" id="mut-across-digits" type="number" min="0" step="1" value="0" style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
          </div>
          <div id="mut-across-template-wrap" style="display:none;margin-top:8px">
            <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">template</div>
            <input class="tv-input" id="mut-across-template" placeholder="e.g. .x / 100" style="font-family:var(--tv-type-mono);font-size:12px">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            <div>
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">output names</div>
              <select class="tv-select" id="mut-across-names" style="font-size:12px">
                <option value="overwrite">overwrite selected columns</option>
                <option value="prefix">add prefix</option>
                <option value="suffix">add suffix</option>
              </select>
            </div>
            <div id="mut-across-name-value-wrap" style="display:none">
              <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">name text</div>
              <input class="tv-input" id="mut-across-name-value" placeholder="e.g. clean_" style="font-family:var(--tv-type-mono);font-size:12px">
            </div>
          </div>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:8px;line-height:1.6">
            Use <code>.x</code> in a custom template to refer to each selected column.
          </div>
        </div>
      </div>`;
    const bodyHtml = `
      <div class="tv-field">
        <label class="tv-field-label">result column name</label>
        <input class="tv-input" id="mut-name" placeholder="e.g. tax_amount or height_in">
      </div>
      <div class="tv-field">
        <label class="tv-field-label">mode</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="mut-mode-expression">expression</button>
          <button class="tv-chip" id="mut-mode-case">case_when builder</button>
        </div>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">expression</label>
        <textarea class="tv-input" id="mut-expr" placeholder="e.g. round(height / 2.54, 1)" style="font-family:var(--tv-type-mono);min-height:92px;resize:vertical"></textarea>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.6">
          Type the formula yourself, or let the builder and helpers below create it for you.
        </div>
        <div id="mut-expression-tools">${builderHtml}${helperHtml}</div>
        <div id="mut-case-tools" style="display:none">${caseHtml}</div>
      </div>
      <div style="background:var(--md-surface-variant);border-radius:8px;padding:10px 12px;border:1px solid var(--md-outline-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:6px;font-weight:500">What This Will Do</div>
        <div id="mut-target-summary" style="font-size:12px;color:var(--md-on-surface);margin-bottom:6px">Result column: choose a name above.</div>
        <div id="mut-source-summary" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:6px">Source columns: none detected yet.</div>
        <div id="mut-friendly-summary" style="font-size:11px;color:var(--md-on-surface);line-height:1.6;margin-bottom:10px">Choose a source column and tell tidyview how to transform it.</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">Generated R</div>
        <div class="tv-preview-code-left" style="font:var(--tv-type-mono);font-size:11px;color:var(--md-on-surface-variant)"><span id="mut-preview" style="color:var(--md-on-surface)">mutate(.data, &lt;name&gt; = &lt;expr&gt;)</span></div>
      </div>`;

    panelShell(pane, MUTATE_SVG, 'mutate', 'create or update a column from other columns', bodyHtml, applyMutate);

    const nameEl = $('mut-name'), exprEl = $('mut-expr');
    let helperMode = 'manual';
    let autoSuggestedName = '';
    window.__mutateHelperState = { mode: 'manual', acrossCols: [] };
    const helperSourceLabel = sourceExpr => sourceExprToLabel.get(sourceExpr) || String(sourceExpr || '').replace(/^`|`$/g, '');
    const firstOptionValue = id => {
      const el = $(id);
      if (!el || !el.options) return '';
      return Array.from(el.options).map(option => option.value).find(Boolean) || '';
    };
    const ensureSelectValue = id => {
      const el = $(id);
      if (!el) return '';
      if (!el.value) el.value = firstOptionValue(id);
      return el.value || '';
    };
    const sanitizeTargetBase = name => {
      const base = String(name || '')
        .replace(/^`|`$/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_')
        .toLowerCase();
      if (!base) return 'new_value';
      return /^[0-9]/.test(base) ? `x_${base}` : base;
    };
    const suggestTargetName = (sourceExpr, suffix) => {
      if (!nameEl || !suffix) return;
      const current = nameEl.value.trim();
      if (current && current !== autoSuggestedName) return;
      const source = helperSourceLabel(sourceExpr);
      const next = `${sanitizeTargetBase(source)}_${suffix}`;
      autoSuggestedName = next;
      nameEl.value = next;
      nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const helperSpecificSummary = () => {
      if (helperMode === 'convert') {
        const sourceExpr = $('mut-convert-source')?.value?.trim() || '';
        const source = helperSourceLabel(sourceExpr);
        const kind = $('mut-convert-kind')?.value || 'cm_to_in';
        const digits = Math.max(0, parseInt($('mut-convert-digits')?.value || '1', 10) || 0);
        if (!source) return null;
        const digitsText = digits === 0 ? 'a whole number' : `${digits} decimal place${digits === 1 ? '' : 's'}`;
        const actions = {
          cm_to_in: `convert "${source}" from centimeters to inches`,
          in_to_cm: `convert "${source}" from inches to centimeters`,
          kg_to_lb: `convert "${source}" from kilograms to pounds`,
          lb_to_kg: `convert "${source}" from pounds to kilograms`,
          m_to_ft: `convert "${source}" from meters to feet`,
          ft_to_m: `convert "${source}" from feet to meters`,
          prop_to_pct: `turn "${source}" from a proportion into a percent`,
          pct_to_prop: `turn "${source}" from a percent into a proportion`,
        };
        return {
          sources: [source],
          summary: `This recipe will ${actions[kind] || `transform "${source}"`} and round the result to ${digitsText}.`,
        };
      }
      if (helperMode === 'date') {
        const sourceExpr = $('mut-date-source')?.value?.trim() || '';
        const source = helperSourceLabel(sourceExpr);
        const dateMode = $('mut-date-mode')?.value || 'parse_idate';
        if (!source) return null;
        const actions = {
          parse_idate: `parse "${source}" as an IDate value`,
          parse_date: `parse "${source}" as a Date value`,
          year: `extract the year from "${source}"`,
          month: `extract the month number from "${source}"`,
          month_label: `turn "${source}" into a month label`,
          day: `extract the day of the month from "${source}"`,
          year_month: `turn "${source}" into year-month text`,
          age_years: `calculate age in years from "${source}"`,
        };
        return {
          sources: [source],
          summary: `This helper will ${actions[dateMode] || `transform "${source}"`} for each row.`,
        };
      }
      if (helperMode === 'string') {
        const sourceExpr = $('mut-string-source')?.value?.trim() || '';
        const source = helperSourceLabel(sourceExpr);
        const stringMode = $('mut-string-mode')?.value || 'detect';
        const pattern = $('mut-string-pattern')?.value || '';
        const replacement = $('mut-string-replacement')?.value || '';
        if (!source) return null;
        if (stringMode === 'trim') {
          return { sources: [source], summary: `This recipe will trim extra spaces from "${source}".` };
        }
        if (stringMode === 'title') {
          return { sources: [source], summary: `This recipe will convert "${source}" to title case.` };
        }
        if (stringMode === 'upper') {
          return { sources: [source], summary: `This recipe will convert "${source}" to uppercase.` };
        }
        if (stringMode === 'lower') {
          return { sources: [source], summary: `This recipe will convert "${source}" to lowercase.` };
        }
        if (stringMode === 'remove_punct') {
          return { sources: [source], summary: `This recipe will remove punctuation from "${source}".` };
        }
        if (stringMode === 'collapse_spaces') {
          return { sources: [source], summary: `This recipe will collapse repeated spaces in "${source}" and trim the result.` };
        }
        if (!pattern) return null;
        if (stringMode === 'detect') {
          return { sources: [source], summary: `This helper will return TRUE or FALSE depending on whether "${source}" matches the pattern "${pattern}".` };
        }
        if (stringMode === 'extract') {
          return { sources: [source], summary: `This helper will extract text from "${source}" using the pattern "${pattern}"${replacement ? ` and replacement "${replacement}"` : ''}.` };
        }
        if (stringMode === 'remove') {
          return { sources: [source], summary: `This helper will remove text from "${source}" wherever it matches "${pattern}".` };
        }
        return { sources: [source], summary: `This helper will replace text in "${source}" where it matches "${pattern}".` };
      }
      return null;
    };
    const update = () => {
      const p = $('mut-preview');
      const targetEl = $('mut-target-summary');
      const sourceEl = $('mut-source-summary');
      const friendlyEl = $('mut-friendly-summary');
      if (!p) return;
      const currentName = nameEl?.value?.trim() || '';
      if (helperMode === 'across') {
        const cols = window.__mutateHelperState?.acrossCols || [];
        const transform = $('mut-across-transform')?.value || '<fn>';
        const namesMode = $('mut-across-names')?.value || 'overwrite';
        const nameValue = $('mut-across-name-value')?.value || '';
        const namesText = namesMode === 'overwrite' ? '.names = "{.col}"' : `.names = "${namesMode === 'prefix' ? nameValue + '{.col}' : '{.col}' + nameValue}"`;
        p.textContent = `mutate(.data, across(c(${cols.join(', ') || '...'}), ${transform === 'custom' ? '~ ' + ($('mut-across-template')?.value || '.x') : transform}, ${namesText}))`;
        if (targetEl) targetEl.textContent = 'Result columns: update multiple columns at once.';
        if (sourceEl) sourceEl.textContent = cols.length ? `Source columns: ${cols.join(', ')}` : 'Source columns: choose one or more columns.';
        const acrossSummary = cols.length
          ? `Apply ${transform === 'custom' ? 'your custom template' : `"${transform}"`} to ${formatEnglishList(cols.map(col => `"${col}"`))}${namesMode === 'overwrite' ? ' and keep the same column names.' : ` and write the results to ${namesMode === 'prefix' ? 'new prefixed names' : 'new suffixed names'}.`}`
          : 'Choose one or more source columns to apply the same transformation across them.';
        if (friendlyEl) friendlyEl.textContent = acrossSummary;
        return;
      }
      const n = currentName || '<name>';
      const e = exprEl?.value || '<expr>';
      p.textContent = `mutate(.data, ${n} = ${e})`;
      const english = helperSpecificSummary() || humanizeMutateExpr(exprEl?.value || '', state.dt || []);
      const sourceSummary = english.sources.length ? `Source columns: ${english.sources.join(', ')}` : 'Source columns: none detected yet.';
      if (targetEl) targetEl.textContent = currentName ? `Result column: create or update "${currentName}".` : 'Result column: choose a name above.';
      if (sourceEl) sourceEl.textContent = sourceSummary;
      if (friendlyEl) friendlyEl.textContent = english.summary;
    };
    const setExpr = (expr) => {
      if (!exprEl) return;
      exprEl.value = expr;
      exprEl.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const applyRecipe = recipe => {
      if (!recipe) return;
      const parts = String(recipe).split(':');
      const group = parts[0];
      const action = parts[1] || '';
      if (group === 'convert') {
        setHelperMode('convert');
        const sourceExpr = ensureSelectValue('mut-convert-source');
        if ($('mut-convert-kind')) $('mut-convert-kind').value = action || 'cm_to_in';
        const suffixMap = {
          cm_to_in: 'in',
          in_to_cm: 'cm',
          kg_to_lb: 'lb',
          lb_to_kg: 'kg',
          m_to_ft: 'ft',
          ft_to_m: 'm',
          prop_to_pct: 'pct',
          pct_to_prop: 'prop',
        };
        suggestTargetName(sourceExpr, suffixMap[action] || 'calc');
        syncHelper();
        return;
      }
      if (group === 'string') {
        setHelperMode('string');
        const sourceExpr = ensureSelectValue('mut-string-source');
        if ($('mut-string-mode')) $('mut-string-mode').value = action || 'trim';
        if ($('mut-string-pattern')) $('mut-string-pattern').value = '';
        if ($('mut-string-replacement')) $('mut-string-replacement').value = '';
        const suffixMap = {
          trim: 'trim',
          title: 'title',
          upper: 'upper',
          lower: 'lower',
          remove_punct: 'clean',
          collapse_spaces: 'clean',
        };
        suggestTargetName(sourceExpr, suffixMap[action] || 'text');
        syncHelper();
        return;
      }
      if (group === 'date') {
        setHelperMode('date');
        const sourceExpr = ensureSelectValue('mut-date-source');
        if ($('mut-date-mode')) $('mut-date-mode').value = action || 'year';
        const suffixMap = {
          year: 'year',
          month_label: 'month',
          age_years: 'age',
        };
        suggestTargetName(sourceExpr, suffixMap[action] || 'date');
        syncHelper();
      }
    };
    const syncHelper = () => {
      if (!exprEl) return;
      if (helperMode === 'convert') {
        const source = $('mut-convert-source')?.value?.trim() || '';
        const kind = $('mut-convert-kind')?.value || 'cm_to_in';
        const digits = String(Math.max(0, parseInt($('mut-convert-digits')?.value || '1', 10) || 0));
        if (!source) {
          setExpr('');
          return;
        }
        const rounded = inner => `round(${inner}, ${digits})`;
        const exprMap = {
          cm_to_in: rounded(`${source} / 2.54`),
          in_to_cm: rounded(`${source} * 2.54`),
          kg_to_lb: rounded(`${source} * 2.205`),
          lb_to_kg: rounded(`${source} / 2.205`),
          m_to_ft: rounded(`${source} * 3.28084`),
          ft_to_m: rounded(`${source} / 3.28084`),
          prop_to_pct: rounded(`${source} * 100`),
          pct_to_prop: rounded(`${source} / 100`)
        };
        setExpr(exprMap[kind] || '');
        return;
      }
      if (helperMode === 'ifelse') {
        const cond = $('mut-ifelse-cond')?.value?.trim() || '';
        const yes = $('mut-ifelse-true')?.value?.trim() || '';
        const no = $('mut-ifelse-false')?.value?.trim() || 'NA_character_';
        if (!cond || !yes) {
          setExpr('');
          return;
        }
        setExpr(`data.table::fifelse(${cond}, ${yes}, ${no})`);
        return;
      }
      if (helperMode === 'coalesce') {
        const parts = [
          $('mut-coalesce-1')?.value?.trim() || '',
          $('mut-coalesce-2')?.value?.trim() || '',
          $('mut-coalesce-3')?.value?.trim() || '',
        ].filter(Boolean);
        if (parts.length < 2) {
          setExpr('');
          return;
        }
        setExpr(`data.table::fcoalesce(${parts.join(', ')})`);
        return;
      }
      if (helperMode === 'shift') {
        const source = $('mut-shift-source')?.value?.trim() || '';
        const kind = $('mut-shift-type')?.value || 'lead';
        const nRaw = $('mut-shift-n')?.value?.trim() || '1';
        const nVal = String(Math.max(1, parseInt(nRaw, 10) || 1));
        const fill = $('mut-shift-fill')?.value?.trim() || '';
        if (!source) {
          setExpr('');
          return;
        }
        const fillClause = fill ? `, fill = ${fill}` : '';
        setExpr(`data.table::shift(${source}, n = ${nVal}L, type = "${kind}"${fillClause})`);
        return;
      }
      if (helperMode === 'date') {
        const source = $('mut-date-source')?.value?.trim() || '';
        const dateMode = $('mut-date-mode')?.value || 'parse_idate';
        const fmt = $('mut-date-format')?.value?.trim() || '';
        const refWrap = $('mut-date-ref-wrap');
        const ref = $('mut-date-ref')?.value?.trim() || 'Sys.Date()';
        if (refWrap) refWrap.style.display = dateMode === 'age_years' ? '' : 'none';
        if (!source) {
          setExpr('');
          return;
        }
        const fmtClause = fmt ? `, format = ${rString(fmt)}` : '';
        const parsedDateExpr = `as.Date(as.character(${source})${fmtClause})`;
        const parsedIDateExpr = `data.table::as.IDate(as.character(${source})${fmtClause})`;
        if (dateMode === 'parse_idate') {
          setExpr(parsedIDateExpr);
          return;
        }
        if (dateMode === 'parse_date') {
          setExpr(parsedDateExpr);
          return;
        }
        if (dateMode === 'year') {
          setExpr(`as.integer(format(${parsedDateExpr}, "%Y"))`);
          return;
        }
        if (dateMode === 'month') {
          setExpr(`as.integer(format(${parsedDateExpr}, "%m"))`);
          return;
        }
        if (dateMode === 'month_label') {
          setExpr(`format(${parsedDateExpr}, "%B")`);
          return;
        }
        if (dateMode === 'day') {
          setExpr(`as.integer(format(${parsedDateExpr}, "%d"))`);
          return;
        }
        if (dateMode === 'year_month') {
          setExpr(`format(${parsedDateExpr}, "%Y-%m")`);
          return;
        }
        setExpr(`as.integer(floor(as.numeric(difftime(${ref}, ${parsedDateExpr}, units = "days")) / 365.25))`);
        return;
      }
      if (helperMode === 'string') {
        const source = $('mut-string-source')?.value?.trim() || '';
        const stringMode = $('mut-string-mode')?.value || 'detect';
        const pattern = $('mut-string-pattern')?.value || '';
        const replacement = $('mut-string-replacement')?.value || '';
        const ignoreCase = $('mut-string-ignore-case')?.checked;
        const sourceExpr = `as.character(${source})`;
        const patternWrap = $('mut-string-pattern-wrap');
        const replacementWrap = $('mut-string-replacement-wrap');
        const ignoreCaseWrap = $('mut-string-ignore-case-wrap');
        const noPatternModes = ['trim', 'title', 'upper', 'lower', 'remove_punct', 'collapse_spaces'];
        if (patternWrap) patternWrap.style.display = noPatternModes.includes(stringMode) ? 'none' : '';
        if (replacementWrap) replacementWrap.style.display = ['replace', 'extract'].includes(stringMode) ? '' : 'none';
        if (ignoreCaseWrap) ignoreCaseWrap.style.display = noPatternModes.includes(stringMode) ? 'none' : 'flex';
        if (!source) {
          setExpr('');
          return;
        }
        if (stringMode === 'trim') {
          setExpr(`trimws(${sourceExpr})`);
          return;
        }
        if (stringMode === 'title') {
          setExpr(`tools::toTitleCase(tolower(${sourceExpr}))`);
          return;
        }
        if (stringMode === 'upper') {
          setExpr(`toupper(${sourceExpr})`);
          return;
        }
        if (stringMode === 'lower') {
          setExpr(`tolower(${sourceExpr})`);
          return;
        }
        if (stringMode === 'remove_punct') {
          setExpr(`gsub("[[:punct:]]+", "", ${sourceExpr}, perl = TRUE)`);
          return;
        }
        if (stringMode === 'collapse_spaces') {
          setExpr(`trimws(gsub("\\\\s+", " ", ${sourceExpr}, perl = TRUE))`);
          return;
        }
        if (!pattern) {
          setExpr('');
          return;
        }
        const caseClause = ignoreCase ? ', ignore.case = TRUE' : '';
        if (stringMode === 'detect') {
          setExpr(`grepl(${rString(pattern)}, ${sourceExpr}${caseClause}, perl = TRUE)`);
          return;
        }
        if (stringMode === 'extract') {
          setExpr(`sub(${rString(pattern)}, ${rString(replacement || '\\\\1')}, ${sourceExpr}${caseClause}, perl = TRUE)`);
          return;
        }
        if (stringMode === 'remove') {
          setExpr(`gsub(${rString(pattern)}, "", ${sourceExpr}${caseClause}, perl = TRUE)`);
          return;
        }
        setExpr(`gsub(${rString(pattern)}, ${rString(replacement)}, ${sourceExpr}${caseClause}, perl = TRUE)`);
        return;
      }
      if (helperMode === 'regex') {
        const source = $('mut-regex-source')?.value?.trim() || '';
        const regexMode = $('mut-regex-mode')?.value || 'detect';
        const pattern = $('mut-regex-pattern')?.value || '';
        const replacement = $('mut-regex-replacement')?.value || '';
        const ignoreCase = $('mut-regex-ignore-case')?.checked;
        const replacementWrap = $('mut-regex-replacement-wrap');
        if (replacementWrap) replacementWrap.style.display = regexMode === 'detect' ? 'none' : '';
        if (!source || !pattern) {
          setExpr('');
          return;
        }
        const sourceExpr = `as.character(${source})`;
        const caseClause = ignoreCase ? ', ignore.case = TRUE' : '';
        if (regexMode === 'detect') {
          setExpr(`grepl(${rString(pattern)}, ${sourceExpr}${caseClause}, perl = TRUE)`);
          return;
        }
        if (regexMode === 'remove') {
          setExpr(`gsub(${rString(pattern)}, "", ${sourceExpr}${caseClause}, perl = TRUE)`);
          return;
        }
        setExpr(`gsub(${rString(pattern)}, ${rString(replacement)}, ${sourceExpr}${caseClause}, perl = TRUE)`);
        return;
      }
      if (helperMode === 'across') {
        update();
      }
    };
    const renderAcrossChips = () => {
      const el = $('mut-across-chips');
      if (!el) return;
      const cols = window.__mutateHelperState?.acrossCols || [];
      el.innerHTML = cols.map(col => `
        <button class="tv-chip selected" data-col="${escapeAttr(col)}">
          ${escapeHtml(col)} <span style="margin-left:3px;opacity:.6">x</span>
        </button>`).join('');
      el.querySelectorAll('[data-col]').forEach(btn => {
        btn.addEventListener('click', () => {
          window.__mutateHelperState.acrossCols = (window.__mutateHelperState.acrossCols || []).filter(c => c !== btn.dataset.col);
          renderAcrossChips();
          syncHelper();
        });
      });
    };
    const syncAcrossUI = () => {
      const transform = $('mut-across-transform')?.value || 'tolower';
      const namesMode = $('mut-across-names')?.value || 'overwrite';
      const digitsWrap = $('mut-across-digits-wrap');
      const templateWrap = $('mut-across-template-wrap');
      const nameValueWrap = $('mut-across-name-value-wrap');
      if (digitsWrap) digitsWrap.style.display = transform === 'round' ? '' : 'none';
      if (templateWrap) templateWrap.style.display = transform === 'custom' ? '' : 'none';
      if (nameValueWrap) nameValueWrap.style.display = namesMode === 'overwrite' ? 'none' : '';
      update();
    };
    const setHelperMode = (mode) => {
      helperMode = mode;
      if (window.__mutateHelperState) window.__mutateHelperState.mode = mode;
      ['manual', 'convert', 'ifelse', 'coalesce', 'shift', 'date', 'string', 'regex', 'across'].forEach(name => {
        $(`mut-helper-${name}`)?.classList.toggle('selected', name === mode);
        const panelId = name === 'manual' ? 'mut-helper-manual-panel' : `mut-helper-${name}-panel`;
        const panel = $(panelId);
        if (panel) panel.style.display = name === mode ? '' : 'none';
      });
      if (mode === 'across') syncAcrossUI();
      if (mode !== 'manual') syncHelper();
    };
    const setMode = (mode) => {
      window.__mutateUiMode = mode;
      $('mut-mode-expression')?.classList.toggle('selected', mode === 'expression');
      $('mut-mode-case')?.classList.toggle('selected', mode === 'case');
      const exprTools = $('mut-expression-tools');
      const caseTools = $('mut-case-tools');
      if (exprTools) exprTools.style.display = mode === 'expression' ? '' : 'none';
      if (caseTools) caseTools.style.display = mode === 'case' ? '' : 'none';
      if (mode === 'case') syncCaseWhenBuilder('mut');
      update();
    };
    $('mut-mode-expression')?.addEventListener('click', () => setMode('expression'));
    $('mut-mode-case')?.addEventListener('click', () => setMode('case'));
    pane.querySelectorAll('[data-mut-recipe]').forEach(btn => {
      btn.addEventListener('click', () => applyRecipe(btn.dataset.mutRecipe));
    });
    $('mut-helper-manual')?.addEventListener('click', () => setHelperMode('manual'));
    $('mut-helper-convert')?.addEventListener('click', () => setHelperMode('convert'));
    $('mut-helper-ifelse')?.addEventListener('click', () => setHelperMode('ifelse'));
    $('mut-helper-coalesce')?.addEventListener('click', () => setHelperMode('coalesce'));
    $('mut-helper-shift')?.addEventListener('click', () => setHelperMode('shift'));
    $('mut-helper-date')?.addEventListener('click', () => setHelperMode('date'));
    $('mut-helper-string')?.addEventListener('click', () => setHelperMode('string'));
    $('mut-helper-regex')?.addEventListener('click', () => setHelperMode('regex'));
    $('mut-helper-across')?.addEventListener('click', () => setHelperMode('across'));
    [
      'mut-convert-source', 'mut-convert-kind', 'mut-convert-digits',
      'mut-ifelse-cond', 'mut-ifelse-true', 'mut-ifelse-false',
      'mut-coalesce-1', 'mut-coalesce-2', 'mut-coalesce-3',
      'mut-shift-type', 'mut-shift-n', 'mut-shift-source', 'mut-shift-fill',
      'mut-date-source', 'mut-date-mode', 'mut-date-format', 'mut-date-ref',
      'mut-string-source', 'mut-string-mode', 'mut-string-pattern', 'mut-string-replacement',
      'mut-regex-source', 'mut-regex-mode', 'mut-regex-pattern', 'mut-regex-replacement',
      'mut-across-transform', 'mut-across-digits', 'mut-across-template',
      'mut-across-names', 'mut-across-name-value'
    ].forEach(id => $(id)?.addEventListener('input', syncHelper));
    [
      'mut-convert-source', 'mut-convert-kind',
      'mut-coalesce-1', 'mut-coalesce-2', 'mut-coalesce-3',
      'mut-shift-type', 'mut-shift-source', 'mut-date-source', 'mut-date-mode',
      'mut-string-source', 'mut-string-mode',
      'mut-regex-source', 'mut-regex-mode',
      'mut-across-transform', 'mut-across-names'
    ].forEach(id => $(id)?.addEventListener('change', syncHelper));
    $('mut-string-ignore-case')?.addEventListener('change', syncHelper);
    $('mut-regex-ignore-case')?.addEventListener('change', syncHelper);
    $('mut-across-add')?.addEventListener('change', (e) => {
      const col = e.target.value;
      if (!col) return;
      window.__mutateHelperState.acrossCols = window.__mutateHelperState.acrossCols || [];
      if (!window.__mutateHelperState.acrossCols.includes(col)) window.__mutateHelperState.acrossCols.push(col);
      e.target.value = '';
      renderAcrossChips();
      syncHelper();
    });
    $('mut-across-transform')?.addEventListener('change', syncAcrossUI);
    $('mut-across-names')?.addEventListener('change', syncAcrossUI);
    nameEl?.addEventListener('input', update);
    exprEl?.addEventListener('input', update);
    initCaseWhenBuilder('mut', {
      targetId: 'mut-expr',
      defaultValue: 'NA_character_',
    });
    window.__mutateUiMode = 'expression';
    renderAcrossChips();
    syncAcrossUI();
    setHelperMode('manual');
    setMode('expression');
  }

  async function applyMutate() {
    const helperState = window.__mutateHelperState || { mode: 'manual', acrossCols: [] };
    if ((window.__mutateUiMode || 'expression') === 'expression' && helperState.mode === 'across') {
      const cols = helperState.acrossCols || [];
      const transform = $('mut-across-transform')?.value || 'tolower';
      const digits = String(Math.max(0, parseInt($('mut-across-digits')?.value || '0', 10) || 0));
      const template = $('mut-across-template')?.value?.trim() || '';
      const namesMode = $('mut-across-names')?.value || 'overwrite';
      const nameValue = $('mut-across-name-value')?.value || '';
      if (!cols.length) {
        await showMessage('Choose at least one column for across.', { title: 'Mutate Incomplete' });
        return;
      }
      if (transform === 'custom' && !template) {
        await showMessage('Enter a custom template that uses .x for each selected column.', { title: 'Mutate Incomplete' });
        return;
      }
      const plan = cols.map(col => {
        const x = rName(col);
        const target = namesMode === 'overwrite' ? col : (namesMode === 'prefix' ? `${nameValue}${col}` : `${col}${nameValue}`);
        let expr;
        if (transform === 'round') expr = `round(${x}, ${digits})`;
        else if (transform === 'custom') expr = template.replace(/\.x\b/g, x);
        else expr = `${transform}(${x})`;
        return { col_name: target, expr };
      });
      const targets = plan.map(step => step.col_name);
      if (new Set(targets).size !== targets.length) {
        await showMessage('The across naming setup produces duplicate output names. Adjust the prefix or suffix and try again.', { title: 'Duplicate Names' });
        return;
      }
      try {
        for (const step of plan) {
          const res = await api('op_mutate', step);
          state.dt = res.columns;
          state.nrow = res.nrow;
          pushCode(res.code);
        }
        updateDimLabel();
        renderTable();
        closePanel();
      } catch(e) { await showError('Error: ' + e.message); }
      return;
    }

    const col_name = $('mut-name')?.value?.trim();
    const expr     = $('mut-expr')?.value?.trim();
    if (!col_name || !expr) { await showMessage('Enter a column name and expression.', { title: 'Mutate Incomplete' }); return; }
    try {
      const res = await api('op_mutate', { col_name, expr });
      state.dt = res.columns; state.nrow = res.nrow;
      pushCode(res.code); updateDimLabel(); renderTable(); closePanel();
    } catch(e) { await showError('Error: ' + e.message); }
  }

  function renderSummarisePanel(pane) {
    if (!state.dt) return;
    const numCols = state.dt.filter(c => ['int','dbl'].includes(c.type));
    const allCols = state.dt;
    const numOpts = numCols.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const allOpts = allCols.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const fns = ['sum','mean','median','min','max','sd','var','n','n_distinct'];

    const bodyHtml = `
      <div class="tv-field">
        <label class="tv-field-label">group by (optional)</label>
        <div id="grp-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px"></div>
        <select class="tv-select" id="grp-add" onchange="TV.addGroupCol(this.value);this.value=''">
          <option value="">add grouping column…</option>${allOpts}
        </select>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.5">
          Each unique group becomes one summary row in the result.
        </div>
      </div>
      <div class="tv-field" style="margin-top:0">
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--md-on-surface);cursor:pointer;line-height:1.5">
          <input type="checkbox" id="sum-ignore-missing" style="margin-top:2px">
          <span>
            <strong style="font-weight:500">ignore missing values</strong><br>
            <span style="font-size:11px;color:var(--md-on-surface-variant)">Use <code>na.rm = TRUE</code> for numeric summaries like mean, sum, median, min, max, sd, and var.</span>
          </span>
        </label>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);margin-bottom:12px;background:var(--md-surface-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:8px;font-weight:500">across</div>
        <div style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6;margin-bottom:10px">
          Add one summarise output per selected column.
        </div>
        <div class="tv-field" style="margin-top:0">
          <label class="tv-field-label">columns</label>
          <div id="sum-across-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
          <select class="tv-select" id="sum-across-add" onchange="TV.addSummariseAcrossCol(this.value);this.value=''">
            <option value="">add column...</option>${allOpts}
          </select>
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.5">
            Pick the columns that should all use the same summary rule.
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">function</div>
            <select class="tv-select" id="sum-across-fn" style="font-size:12px">
              ${fns.map(f => `<option value="${f}">${f}</option>`).join('')}
            </select>
            <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:4px;line-height:1.5">
              Choose the statistic to calculate for each selected column.
            </div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">output names</div>
            <select class="tv-select" id="sum-across-names" style="font-size:12px">
              <option value="fn_col">fn_col</option>
              <option value="col_fn">col_fn</option>
            </select>
            <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:4px;line-height:1.5">
              <code>fn_col</code> gives names like <code>mean_height</code>. <code>col_fn</code> gives <code>height_mean</code>.
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="tv-btn-outlined" type="button" onclick="TV.applySummariseAcross()">add across outputs</button>
        </div>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">aggregations</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-top:-2px;margin-bottom:8px;line-height:1.5">
          Use these rows when each summary needs its own output name, function, or source column.
        </div>
        <div id="agg-list"></div>
        <button class="tv-add-btn" onclick="TV.addAggRow()">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/></svg>
          add aggregation
        </button>
      </div>`;

    window.__groupCols = [];
    window.__aggRows   = [];
    window.__sumAcrossCols = [];
    panelShell(pane, SUM_SVG, 'summarise', 'group_by(...) |> summarise(...)', bodyHtml, applySummarise);
    window.__numOpts = numOpts;
    renderSummariseAcrossChips();
    addAggRow();
  }

  function addGroupCol(col) {
    if (!col || (window.__groupCols || []).includes(col)) return;
    window.__groupCols = [...(window.__groupCols || []), col];
    renderGroupChips();
  }

  function renderGroupChips() {
    const el = $('grp-chips');
    if (!el) return;
    el.innerHTML = (window.__groupCols || []).map(c => `
      <button class="tv-chip selected" onclick="TV.removeGroupCol('${c}')">
        ${c} <span style="margin-left:3px;opacity:.6">✕</span>
      </button>`).join('');
  }

  function removeGroupCol(col) {
    window.__groupCols = (window.__groupCols || []).filter(c => c !== col);
    renderGroupChips();
  }

  function renderSummariseAcrossChips() {
    const el = $('sum-across-chips');
    if (!el) return;
    el.innerHTML = (window.__sumAcrossCols || []).map(c => `
      <button class="tv-chip selected" onclick='TV.removeSummariseAcrossCol(${JSON.stringify(c)})'>
        ${escapeHtml(c)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function addSummariseAcrossCol(col) {
    if (!col || (window.__sumAcrossCols || []).includes(col)) return;
    window.__sumAcrossCols = [...(window.__sumAcrossCols || []), col];
    renderSummariseAcrossChips();
  }

  function removeSummariseAcrossCol(col) {
    window.__sumAcrossCols = (window.__sumAcrossCols || []).filter(c => c !== col);
    renderSummariseAcrossChips();
  }

  function applySummariseAcross() {
    const cols = window.__sumAcrossCols || [];
    const fn = $('sum-across-fn')?.value || 'sum';
    const namesMode = $('sum-across-names')?.value || 'fn_col';
    const na_rm = $('sum-ignore-missing')?.checked === true;
    if (!cols.length) {
      showMessage('Choose at least one column for across.', { title: 'Summarise Incomplete' });
      return;
    }
    cols.forEach(col => {
      const output = namesMode === 'col_fn' ? `${col}_${fn}` : `${fn}_${col}`;
      addAggRow({ output, fn, col, na_rm });
    });
  }

  function addAggRow(initial = null) {
    const id   = 'agg' + Date.now() + Math.random().toString(36).slice(2, 5);
    window.__aggRows = [...(window.__aggRows || []), id];
    const list = $('agg-list');
    if (!list) return;
    const outVal = initial?.output || '';
    const fnVal = initial?.fn || 'sum';
    const colVal = initial?.col || (state.dt[0]?.name || '');
    const naRmVal = initial?.na_rm === true || (!initial && $('sum-ignore-missing')?.checked === true);
    const row  = document.createElement('div');
    row.id     = 'agg-' + id;
    row.style.cssText = 'display:grid;grid-template-columns:92px minmax(0,1fr) 30px;gap:6px;align-items:start;margin-bottom:10px';
    row.innerHTML = `
      <input class="tv-input" id="agg-out-${id}" placeholder="output name" value="${escapeAttr(outVal)}" style="grid-column:1 / span 3;padding:7px 10px;font-size:12px;font-family:var(--tv-type-mono);min-width:0">
      <select class="tv-select" id="agg-fn-${id}" style="grid-column:1;padding:7px 8px;font-size:12px;min-width:0">
        ${['sum','mean','median','min','max','sd','n','n_distinct'].map(f=>`<option value="${f}" ${f === fnVal ? 'selected' : ''}>${f}</option>`).join('')}
      </select>
      <select class="tv-select" id="agg-col-${id}" style="grid-column:2;padding:7px 10px;font-size:12px;min-width:0">
        ${state.dt.map(c=>`<option value="${c.name}" ${c.name === colVal ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
      <label style="grid-column:1 / span 2;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--md-on-surface-variant);cursor:pointer;line-height:1.4;padding-left:2px">
        <input type="checkbox" id="agg-na-rm-${id}" ${naRmVal ? 'checked' : ''}>
        ignore NA
      </label>
      <button onclick="document.getElementById('agg-${id}').remove()" style="grid-column:3;grid-row:2 / span 2;width:28px;height:28px;border-radius:50%;border:none;background:transparent;cursor:pointer;color:var(--md-on-surface-variant);font-size:16px;display:flex;align-items:center;justify-content:center;align-self:start">✕</button>`;
    list.appendChild(row);
  }

  async function applySummarise() {
    const aggregations = (window.__aggRows || [])
      .filter(id => document.getElementById('agg-' + id))
      .map(id => ({
        output: $('agg-out-' + id)?.value  || $('agg-fn-' + id)?.value + '_' + $('agg-col-' + id)?.value,
        fn:     $('agg-fn-'  + id)?.value,
        col:    $('agg-col-' + id)?.value,
        na_rm:  $('agg-na-rm-' + id)?.checked === true,
      }));
    if (!aggregations.length) { await showMessage('Add at least one aggregation.', { title: 'Summarise Incomplete' }); return; }
    try {
      const res = await api('op_summarise', { group_by: window.__groupCols || [], aggregations });
      state.dt = res.columns; state.nrow = res.nrow; state.ncol = res.ncol || state.ncol;
      if (res.name) state.name = res.name;
      pushCode(res.code); updateDimLabel(); updateSourceChip(); renderTable(); closePanel();
    } catch(e) { await showError('Error: ' + e.message); }
  }


  function renderEnvItems(objects) {
    const envSection = document.getElementById('tv-env-list');
    if (!envSection) return;
    if (!objects.length) {
      envSection.innerHTML = `<div style="font-size:12px;color:var(--md-on-surface-variant);padding:12px 0">No data objects in R environment.</div>`;
      return;
    }
    envSection.innerHTML = objects.map(o => {
      if (o.type === 'list') {
        const children = (o.children || []).map(c => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 10px 6px 44px;border-radius:6px;cursor:pointer;background:var(--md-surface-variant)"
               onclick='TV.loadFromEnv(${JSON.stringify(o.name)}, ${JSON.stringify(c.name)})'>
            <div style="width:22px;height:22px;border-radius:4px;background:var(--md-secondary-container);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="var(--md-on-secondary-container)" stroke-width="1.4"><rect x="1" y="1" width="12" height="12" rx="2"/><line x1="1" y1="5" x2="13" y2="5"/><line x1="5" y1="5" x2="5" y2="13"/></svg>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:500">${escapeHtml(c.name)}</div>
              <div style="font-size:10px;color:var(--md-on-surface-variant)">${c.class} · ${c.nrow}×${c.ncol}</div>
            </div>
          </div>`).join('');
        return `
          <div style="border:0.5px solid var(--md-outline-variant);border-radius:8px;margin-bottom:5px;overflow:hidden">
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--md-surface);cursor:default">
              <div style="width:28px;height:28px;border-radius:6px;background:var(--md-tertiary-container);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--md-on-tertiary-container)" stroke-width="1.4"><path d="M1 4h12M1 4v8h12V4M4 4V2h6v2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:500">${escapeHtml(o.name)}</div>
                <div style="font-size:10px;color:var(--md-on-surface-variant)">list · ${o.n_tables} table${o.n_tables !== 1 ? 's' : ''}</div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;padding:4px 0 6px">${children}</div>
          </div>`;
      }
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:0.5px solid var(--md-outline-variant);border-radius:8px;margin-bottom:5px;cursor:pointer;background:var(--md-surface)"
             onclick='TV.loadFromEnv(${JSON.stringify(o.name)})'>
          <div style="width:28px;height:28px;border-radius:6px;background:var(--md-primary-container);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--md-on-primary-container)" stroke-width="1.4"><rect x="1" y="1" width="12" height="12" rx="2"/><line x1="1" y1="5" x2="13" y2="5"/><line x1="5" y1="5" x2="5" y2="13"/></svg>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:500">${escapeHtml(o.name)}</div>
            <div style="font-size:10px;color:var(--md-on-surface-variant)">${o.class} · ${o.nrow}×${o.ncol}</div>
          </div>
        </div>`;
    }).join('');
  }

  function renderLoadPanel(pane) {
    state.rcdfImport = null;
    pane.innerHTML = `
      <div class="tv-panel-header">
        <div class="tv-panel-icon">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 14V6M7 9l3-3 3 3" stroke-linecap="round"/><path d="M4 16h12" stroke-linecap="round"/></svg>
        </div>
        <div><div class="tv-panel-title">load data</div><div class="tv-panel-sub">environment or file</div></div>
        <button class="tv-panel-close" onclick="TV.closePanel()">✕</button>
      </div>
      <div class="tv-panel-body">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant)">R environment</div>
          <button onclick="TV.refreshEnv()" style="font-size:10px;background:none;border:none;cursor:pointer;color:var(--md-primary);padding:0">refresh</button>
        </div>
        <div id="tv-env-list"><div style="font-size:12px;color:var(--md-on-surface-variant);padding:12px 0">scanning...</div></div>
        <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin:16px 0 8px">import file</div>
        <div class="tv-load-dropzone" onclick="document.getElementById('file-picker').click()">
          <div style="font-size:13px;font-weight:500;margin-bottom:4px">drop a file or click to browse</div>
          <div style="font-size:11px;margin-bottom:8px">csv - tsv - xlsx - rds - sav - dta</div>
          <input type="file" id="file-picker" style="display:none" accept=".csv,.tsv,.xlsx,.xls,.rds,.sav,.dta" onchange="TV.loadFile(this)">
        </div>
        <div class="tv-rcdf-card">
          <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:8px">RCDF import</div>
          <div class="tv-rcdf-intro">
            Use this order for encrypted RCDF files:
            <br>1. load the decryption key
            <br>2. enter the key password
            <br>3. load the RCDF file
          </div>
          <div class="tv-rcdf-step">Step 1 - Decryption key</div>
          <div class="tv-field" style="margin-bottom:10px">
            <label class="tv-field-label">decryption key path (optional)</label>
            <input class="tv-input" id="rcdf-key-path" placeholder="no key selected">
          </div>
          <div class="tv-field" style="margin-bottom:10px">
            <label class="tv-field-label">or upload decryption key</label>
            <div class="tv-file-choice">
              <button class="tv-btn-outlined" type="button" onclick="document.getElementById('rcdf-key-picker').click()">choose key file</button>
            </div>
            <input type="file" id="rcdf-key-picker" style="display:none" accept=".pem,.key,.txt" onchange="TV.setRcdfKeyFile(this)">
          </div>
          <div class="tv-rcdf-step" style="margin-top:4px">Step 2 - Password</div>
          <div class="tv-field" style="margin-bottom:0">
            <label class="tv-field-label">key password (optional)</label>
            <input class="tv-input" id="rcdf-password" type="password" placeholder="password">
          </div>
          <label style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;font-size:11px;color:var(--md-on-surface);cursor:pointer">
            <input type="checkbox" id="rcdf-return-meta" style="margin-top:2px">
            <span>
              <span style="display:block;font-weight:500">include RCDF metadata</span>
              <span style="display:block;color:var(--md-on-surface-variant);line-height:1.5">
                Attach RCDF metadata to the imported tables and include any tabular dictionary returned by <code>return_meta = TRUE</code>.
              </span>
            </span>
          </label>
          <div class="tv-rcdf-step" style="margin-top:12px">Step 3 - RCDF file</div>
          <div class="tv-file-choice">
            <button class="tv-btn-filled" type="button" onclick="document.getElementById('rcdf-file-picker').click()">load RCDF file</button>
            <span id="rcdf-file-label" class="tv-file-name">no RCDF file selected</span>
          </div>
          <div id="rcdf-status" class="tv-rcdf-status" style="display:none"></div>
          <input type="file" id="rcdf-file-picker" style="display:none" accept=".rcdf" onchange="TV.loadRcdfFile(this)">
          <div id="rcdf-table-picker" class="tv-rcdf-picker" style="display:none"></div>
        </div>
      </div>`;
    api('scan_env', {}).then(r => renderEnvItems(r.objects || [])).catch(() => renderEnvItems([]));
  }

  function setRcdfStatus(message, tone = 'muted') {
    const el = $('rcdf-status');
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.className = 'tv-rcdf-status';
      el.textContent = '';
      return;
    }
    el.style.display = '';
    el.className = `tv-rcdf-status tv-rcdf-status-${tone}`;
    el.textContent = humanizeErrorMessage(message);
  }

  async function refreshEnv() {
    try {
      const objects = await refreshEnvCache();
      renderEnvItems(objects);
    }
    catch(e) { renderEnvItems([]); }
  }

  async function refreshEnvCache() {
    const r = await api('scan_env', {});
    window.__ENV_OBJECTS__ = r.objects || [];
    return window.__ENV_OBJECTS__;
  }

  async function loadFromEnv(name, element) {
    try {
      const params = { name, as: element || name };
      if (element) params.element = element;
      const res = await api('load_env', params);
      state.dt = normalizeColumnsMeta(res.columns); state.name = res.name;
      state.nrow = res.nrow; state.ncol = res.ncol;
      state.sessions = res.sessions || state.sessions;
      if (Array.isArray(res.history)) setHistory(res.history);
      else pushCode(res.code);
      updateDimLabel(); renderSessionTabs(res.sessions); await renderTable(); closePanel();
    } catch(e) { await showError('Error loading: ' + e.message); }
  }

  async function loadFile(input) {
    if (!input.files?.length) return;
    const file = input.files[0];
    try {
      const contents = await fileToBase64(file);
      const payload = {
        file_name: file.name,
        contents,
        as: 'DT',
      };
      const res = await api('load_file', payload);
      state.dt = normalizeColumnsMeta(res.columns); state.name = res.name;
      state.nrow = res.nrow; state.ncol = res.ncol;
      state.sessions = res.sessions || state.sessions;
      if (Array.isArray(res.history)) setHistory(res.history);
      else pushCode(res.code);
      updateDimLabel(); renderSessionTabs(res.sessions); await renderTable(); closePanel();
    } catch(e) { await showError('Error loading file: ' + e.message); }
    finally { input.value = ''; }
  }

  async function loadRcdfFile(input) {
    if (!input.files?.length) return;
    const file = input.files[0];
    const keyPath = $('rcdf-key-path')?.value?.trim();
    const keyFile = $('rcdf-key-picker')?.files?.[0];
    const fileLabel = $('rcdf-file-label');
    if (fileLabel) fileLabel.textContent = file.name;
    try {
      if (!keyPath && !keyFile) {
        setRcdfStatus('Load the decryption key first, then try the RCDF file again.', 'error');
        await showMessage('Step 1 is required first: load the decryption key path or choose the key file.', { title: 'Decryption Key Required' });
        return;
      }
      setRcdfStatus('Inspecting RCDF file...', 'info');
      const payload = {
        file_name: file.name,
        contents: await fileToBase64(file),
        password: $('rcdf-password')?.value || '',
        return_meta: !!$('rcdf-return-meta')?.checked,
        rcdf_object_name: (file.name.replace(/\.[^.]+$/, '') || 'rcdf_data').replace(/[^A-Za-z0-9._]/g, '_'),
      };
      if (keyPath) payload.decryption_key = keyPath;
      if (keyFile) {
        payload.decryption_key_name = keyFile.name;
        payload.decryption_key_contents = await fileToBase64(keyFile);
      }
      const res = await api('inspect_rcdf', payload);
      state.rcdfImport = {
        file_path: res.file_path,
        file_code_path: res.file_code_path,
        key_path: res.key_path,
        password: payload.password,
        return_meta: !!res.return_meta,
        rcdf_object_name: res.rcdf_object_name,
        tables: res.tables || [],
      };
      renderRcdfTablePicker(res.tables || []);
    } catch(e) {
      setRcdfStatus(e.message, 'error');
      await showError('Error inspecting RCDF file: ' + e.message);
    }
    finally {
      input.value = '';
    }
  }

  function renderRcdfTablePicker(tables) {
    const el = $('rcdf-table-picker');
    if (!el) return;
    if (!tables.length) {
      setRcdfStatus('No tabular datasets were found in this RCDF file.', 'error');
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    const includeMeta = !!state.rcdfImport?.return_meta;
    setRcdfStatus(
      `Found ${tables.length} RCDF table${tables.length === 1 ? '' : 's'}${includeMeta ? ', including metadata outputs.' : ''} Choose which ones to open below.`,
      'success'
    );
    el.style.display = '';
    el.innerHTML = `
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--md-primary);margin-bottom:8px">Step 4 - Choose tables to open</div>
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px">Select only the RCDF datasets you want to open as tabs.</div>
      ${includeMeta ? '<div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px">RCDF metadata will be attached to the imported tables. If the RCDF includes a tabular data dictionary, it appears in the list below as its own table.</div>' : ''}
      <div id="rcdf-table-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
        ${tables.map((tbl, idx) => `
          <label style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--md-outline-variant);border-radius:10px;cursor:pointer">
            <input type="checkbox" class="rcdf-table-check" value="${TV.escapeAttr(tbl.name)}" ${idx === 0 ? 'checked' : ''} style="margin-top:2px">
            <span style="flex:1;min-width:0">
              <span style="display:block;font-size:12px;font-weight:500">${TV.escapeHtml(tbl.name)}</span>
              <span style="display:block;font-size:10px;color:var(--md-on-surface-variant)">${tbl.nrow.toLocaleString()} rows - ${tbl.ncol} columns</span>
            </span>
          </label>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="tv-btn-outlined" type="button" onclick="TV.selectAllRcdfTables(true)">select all</button>
        <button class="tv-btn-outlined" type="button" onclick="TV.selectAllRcdfTables(false)">clear</button>
        <button class="tv-btn-filled" type="button" onclick="TV.applyRcdfImport()">open selected tables</button>
      </div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function selectAllRcdfTables(selected) {
    document.querySelectorAll('.rcdf-table-check').forEach(el => {
      el.checked = selected;
    });
  }

  async function applyRcdfImport() {
    if (!state.rcdfImport) {
      await showMessage('Choose and inspect an RCDF file first.', { title: 'No RCDF Ready' });
      return;
    }
    const tables = [...document.querySelectorAll('.rcdf-table-check:checked')].map(el => el.value);
    if (!tables.length) {
      await showMessage('Select at least one RCDF table to open.', { title: 'No Tables Selected' });
      return;
    }
    try {
      setRcdfStatus('Opening selected RCDF tables...', 'info');
      const res = await api('load_rcdf_tables', {
        file_path: state.rcdfImport.file_path,
        file_code_path: state.rcdfImport.file_code_path,
        key_path: state.rcdfImport.key_path,
        password: state.rcdfImport.password,
        return_meta: !!state.rcdfImport.return_meta,
        rcdf_object_name: state.rcdfImport.rcdf_object_name,
        tables,
        as: tables.length === 1 ? 'DT' : '',
      });
      state.dt = normalizeColumnsMeta(res.columns); state.name = res.name;
      state.nrow = res.nrow; state.ncol = res.ncol;
      state.sessions = res.sessions || state.sessions;
      if (Array.isArray(res.history)) setHistory(res.history);
      else pushCode(res.code);
      state.rcdfImport = null;
      setRcdfStatus('');
      updateDimLabel(); renderSessionTabs(res.sessions); await renderTable(); closePanel();
    } catch (e) {
      setRcdfStatus(e.message, 'error');
      await showError('Error loading RCDF tables: ' + e.message);
    }
  }

  function setRcdfKeyFile(input) {
    const file = input?.files?.[0];
    const pathInput = $('rcdf-key-path');
    const reflectedPath = file ? file.name : '';
    if (pathInput) {
      pathInput.value = reflectedPath;
      pathInput.placeholder = file ? file.name : 'no key selected';
    }
  }

  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function undo() {
    try {
      const res = await api('undo');
      state.dt = normalizeColumnsMeta(res.columns);
      state.name = res.name || 'DT';
      state.nrow = res.nrow || 0;
      state.ncol = res.ncol || 0;
      state.page = 1;
      setHistory(res.history || []);
      updateDimLabel();
      updateSourceChip();
      await renderTable();
      closePanel();
    } catch(e) {
      await showError('Undo error: ' + e.message);
    }
  }

  async function copyHistory() {
    const text = buildRenderedHistory().join('\n');
    await navigator.clipboard.writeText(text).catch(() => {});
    const btn = $('copy-btn');
    if (btn) { btn.textContent = 'copied!'; setTimeout(() => btn.textContent = 'copy all', 1500); }
  }

  function ensureCellDialog() {
    let overlay = document.getElementById('tv-cell-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'tv-cell-overlay';
    overlay.className = 'tv-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="tv-dialog tv-cell-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-cell-title">
        <div class="tv-panel-header">
          <div>
            <div class="tv-panel-title" id="tv-cell-title">Cell value</div>
            <div class="tv-panel-sub" id="tv-cell-sub"></div>
          </div>
          <button class="tv-panel-close" type="button" onclick="TV.closeCellValue()">x</button>
        </div>
        <div class="tv-panel-body">
          <div id="tv-cell-value" class="tv-cell-full"></div>
        </div>
        <div class="tv-panel-footer">
          <button class="tv-btn-outlined" type="button" onclick="TV.closeCellValue()">close</button>
          <button class="tv-btn-filled" type="button" id="tv-cell-copy-btn">copy value</button>
        </div>
      </div>`;

    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) closeCellValue();
    });

    document.body.appendChild(overlay);
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && overlay.style.display !== 'none') closeCellValue();
    });
    return overlay;
  }

  function openCellValue(colName, value) {
    const overlay = ensureCellDialog();
    const sub = document.getElementById('tv-cell-sub');
    const body = document.getElementById('tv-cell-value');
    const copyBtn = document.getElementById('tv-cell-copy-btn');
    const text = String(value ?? '');

    if (sub) sub.textContent = colName ? `column: ${colName}` : '';
    if (body) body.textContent = text;
    if (copyBtn) {
      copyBtn.onclick = function() { copyToClipboard(text, colName || 'cell value'); };
    }
    overlay.style.display = 'flex';
  }

  function closeCellValue() {
    const overlay = document.getElementById('tv-cell-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function ensureAppDialog() {
    let overlay = document.getElementById('tv-app-dialog-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'tv-app-dialog-overlay';
    overlay.className = 'tv-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="tv-dialog tv-app-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-app-dialog-title">
        <div class="tv-panel-header">
          <div>
            <div class="tv-panel-title" id="tv-app-dialog-title">Message</div>
            <div class="tv-panel-sub" id="tv-app-dialog-sub"></div>
          </div>
          <button class="tv-panel-close" type="button" onclick="TV.closeAppDialog(false)">x</button>
        </div>
        <div class="tv-panel-body">
          <div id="tv-app-dialog-message" class="tv-app-dialog-message"></div>
        </div>
        <div class="tv-panel-footer">
          <button class="tv-btn-outlined" type="button" id="tv-app-dialog-cancel">cancel</button>
          <button class="tv-btn-filled" type="button" id="tv-app-dialog-confirm">ok</button>
        </div>
      </div>`;

    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) closeAppDialog(false);
    });

    document.body.appendChild(overlay);
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && overlay.style.display !== 'none') closeAppDialog(false);
    });
    return overlay;
  }

  let appDialogResolver = null;

  function openAppDialog(options = {}) {
    const overlay = ensureAppDialog();
    const titleEl = document.getElementById('tv-app-dialog-title');
    const subEl = document.getElementById('tv-app-dialog-sub');
    const messageEl = document.getElementById('tv-app-dialog-message');
    const cancelBtn = document.getElementById('tv-app-dialog-cancel');
    const confirmBtn = document.getElementById('tv-app-dialog-confirm');

    if (titleEl) titleEl.textContent = options.title || 'Message';
    if (subEl) {
      subEl.textContent = options.subtitle || '';
      subEl.style.display = options.subtitle ? '' : 'none';
    }
    if (messageEl) messageEl.textContent = options.message || '';
    if (cancelBtn) {
      cancelBtn.textContent = options.cancelLabel || 'cancel';
      cancelBtn.style.display = options.cancelLabel ? '' : 'none';
      cancelBtn.onclick = function() { closeAppDialog(false); };
    }
    if (confirmBtn) {
      confirmBtn.textContent = options.confirmLabel || 'ok';
      confirmBtn.onclick = function() { closeAppDialog(true); };
    }

    overlay.style.display = 'flex';

    return new Promise(resolve => {
      appDialogResolver = resolve;
    });
  }

  function closeAppDialog(result) {
    const overlay = document.getElementById('tv-app-dialog-overlay');
    if (overlay) overlay.style.display = 'none';
    if (appDialogResolver) {
      const resolve = appDialogResolver;
      appDialogResolver = null;
      resolve(Boolean(result));
    }
  }

  function showMessage(message, options = {}) {
    return openAppDialog({
      title: options.title || 'Message',
      subtitle: options.subtitle || '',
      message,
      confirmLabel: options.confirmLabel || 'ok',
      cancelLabel: '',
    });
  }

  function showError(message, options = {}) {
    return showMessage(humanizeErrorMessage(message), {
      title: options.title || 'Error',
      subtitle: options.subtitle || '',
      confirmLabel: options.confirmLabel || 'close',
    });
  }

  function confirmMessage(message, options = {}) {
    return openAppDialog({
      title: options.title || 'Confirm',
      subtitle: options.subtitle || '',
      message,
      confirmLabel: options.confirmLabel || 'confirm',
      cancelLabel: options.cancelLabel || 'cancel',
    });
  }

  function buildRenderedHistory() {
    if (state.codeStyle === 'tidyverse') {
      return buildTidyverseHistory(state.history) || buildPipeHistory(state.history) || flattenHistory(state.history);
    }
    return buildPipeHistory(state.history) || flattenHistory(state.history);
  }

  function flattenHistory(history) {
    return (history || []).flatMap(step => String(step || '').split(/\r?\n/));
  }

  function buildTidyverseHistory(history) {
    if (!history?.length) return null;
    const lines = [];
    let currentName = parseAssignment(String(history[0]).split(/\r?\n/)[0].trim())?.lhs || 'DT';

    for (const step of history) {
      const translated = translateHistoryStep(step, currentName);
      if (translated?.text) {
        lines.push(...String(translated.text).split(/\r?\n/));
        currentName = translated.nextName || currentName;
      } else {
        lines.push(...String(step || '').split(/\r?\n/));
        const next = parseAssignment(String(step).split(/\r?\n/)[0].trim());
        if (next?.lhs) currentName = next.lhs;
      }
    }
    return lines;
  }

  function buildPipeHistory(history) {
    if (!history?.length) return null;
    const first = parseAssignment(history[0]);
    if (!first) return null;

    let currentName = first.lhs;
    let outputName = first.lhs;
    const steps = [first.rhs];

    for (let i = 1; i < history.length; i += 1) {
      const step = historyLineToPipe(history[i], currentName);
      if (!step) return null;
      steps.push(step.code);
      currentName = step.nextName;
      outputName = step.outputName;
    }

    if (steps.length <= 1) return history;

    const lines = [];
    for (let i = 0; i < steps.length; i += 1) {
      const prefix = i === 0 ? `${outputName} <- ` : '  ';
      const suffix = i < steps.length - 1 ? ' |>' : '';
      lines.push(`${prefix}${steps[i]}${suffix}`);
    }
    return lines;
  }

  function parseAssignment(line) {
    const match = line.match(/^([A-Za-z.][A-Za-z0-9._]*) <- (.+)$/);
    if (!match) return null;
    return { lhs: match[1], rhs: match[2] };
  }

  function parseQuotedVector(text) {
    return [...String(text || '').matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(match =>
      match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    );
  }

  function transformArrangeArgs(colsText, orderText) {
    const cols = parseQuotedVector(colsText);
    const order = String(orderText || '').split(',').map(x => parseInt(x.trim(), 10));
    if (!cols.length || cols.length !== order.length) return null;
    return cols.map((col, idx) => order[idx] === -1 ? `dplyr::desc(${col})` : col).join(', ');
  }

  function transformRenamePairs(oldText, newText) {
    const oldNames = parseQuotedVector(oldText);
    const newNames = parseQuotedVector(newText);
    if (!oldNames.length || oldNames.length !== newNames.length) return null;
    return newNames.map((name, idx) => `${name} = ${oldNames[idx]}`).join(', ');
  }

  function transformAggExpr(expr) {
    return String(expr || '')
      .replace(/\b\.N\b/g, 'dplyr::n()')
      .replace(/\buniqueN\(/g, 'dplyr::n_distinct(');
  }

  function translateHistoryStep(step, currentName) {
    const block = String(step || '').trim();
    const parts = block.split(/\r?\n/);
    const first = parts[0]?.trim() || '';
    const escaped = escapeRegex(currentName || '');
    const assignment = parseAssignment(first);

    const arrangeMatch = block.match(new RegExp(`^(${escaped}) <- data\\.table::copy\\(${escaped}\\)\\r?\\ndata\\.table::setorderv\\(${escaped}, cols = c\\((.+)\\), order = c\\((.+)\\), na\\.last = TRUE\\)$`));
    if (arrangeMatch) {
      const args = transformArrangeArgs(arrangeMatch[2], arrangeMatch[3]);
      if (args) {
        return { text: `${currentName} <- dplyr::arrange(${currentName}, ${args})`, nextName: currentName };
      }
    }

    const countSortMatch = block.match(/^([A-Za-z.][A-Za-z0-9._]*) <- ([A-Za-z.][A-Za-z0-9._]*)\[, \.\(n = \.N\), by = \.\((.+)\)\]\r?\n\1 <- \1\[order\(-n\)\]$/);
    if (countSortMatch) {
      return { text: `${countSortMatch[1]} <- dplyr::count(${countSortMatch[2]}, ${countSortMatch[3]}, sort = TRUE, name = "n")`, nextName: countSortMatch[1] };
    }

    const combineColsMatch = block.match(/^..tv_bound <- data\.table::as\.data\.table\(cbind\(([A-Za-z.][A-Za-z0-9._]*), ([^)]+)\)\)\r?\ndata\.table::setnames\(\.\.tv_bound, make\.unique\(names\(\.\.tv_bound\)\)\)\r?\n([A-Za-z.][A-Za-z0-9._]*) <- \.\.tv_bound$/);
    if (combineColsMatch) {
      return { text: `${combineColsMatch[3]} <- dplyr::bind_cols(${combineColsMatch[1]}, ${combineColsMatch[2]})`, nextName: combineColsMatch[3] };
    }

    const semiAntiMatch = block.match(/^\.\.tv_left <- data\.table::copy\(([A-Za-z.][A-Za-z0-9._]*)\)\r?\n\.\.tv_left\[, \.\.tv_rowid__ := \.I\]\r?\n\.\.tv_keys <- unique\(([A-Za-z.][A-Za-z0-9._]*)\[, \.\((.+)\)\]\)\r?\n[\s\S]+?\r?\n([A-Za-z.][A-Za-z0-9._]*) <- \.\.tv_left\[(.+)\]\r?\n\4\[, \.\.tv_rowid__ := NULL\]$/);
    if (semiAntiMatch) {
      const type = semiAntiMatch[5].includes('%in%') ? 'anti_join' : 'semi_join';
      return {
        text: `${semiAntiMatch[4]} <- dplyr::${type}(${semiAntiMatch[1]}, dplyr::distinct(${semiAntiMatch[2]}, ${semiAntiMatch[3]}), by = c(${semiAntiMatch[3].split(',').map(x => rString(x.trim().replace(/^`|`$/g, ''))).join(', ')}))`,
        nextName: semiAntiMatch[4],
      };
    }

    if (assignment) {
      const { lhs, rhs } = assignment;
      const self = escapeRegex(lhs);

      const loadMatch = rhs.match(/^data\.table::as\.data\.table\((.+)\)$/);
      if (loadMatch) return { text: `${lhs} <- tibble::as_tibble(${loadMatch[1]})`, nextName: lhs };

      const selectMatch = rhs.match(new RegExp(`^${self}\\[, \\.\\((.+)\\)\\]$`));
      if (selectMatch) return { text: `${lhs} <- dplyr::select(${lhs}, ${selectMatch[1]})`, nextName: lhs };

      const summariseByMatch = rhs.match(/^([A-Za-z.][A-Za-z0-9._]*)\[, \.\((.+)\), by = \.\((.+)\)\]$/);
      if (summariseByMatch) {
        return {
          text: `${lhs} <- ${summariseByMatch[1]} |>\n  dplyr::group_by(${summariseByMatch[3]}) |>\n  dplyr::summarise(${transformAggExpr(summariseByMatch[2])}, .groups = "drop")`,
          nextName: lhs,
        };
      }

      const summariseMatch = rhs.match(/^([A-Za-z.][A-Za-z0-9._]*)\[, \.\((.+)\)\]$/);
      if (summariseMatch && !summariseMatch[2].includes(':=') && !summariseMatch[2].includes('.(')) {
        return { text: `${lhs} <- dplyr::summarise(${summariseMatch[1]}, ${transformAggExpr(summariseMatch[2])})`, nextName: lhs };
      }

      const arrangeSimpleMatch = rhs.match(new RegExp(`^${self}\\[order\\((.+)\\)\\]$`));
      if (arrangeSimpleMatch) {
        const args = arrangeSimpleMatch[1].split(',').map(x => x.trim()).filter(Boolean).map(arg =>
          arg.startsWith('-') ? `dplyr::desc(${arg.slice(1)})` : arg
        ).join(', ');
        return { text: `${lhs} <- dplyr::arrange(${lhs}, ${args})`, nextName: lhs };
      }

      const dropNaColsMatch = rhs.match(new RegExp(`^${self}\\[stats::complete\\.cases\\(${self}\\[, \\.\\((.+)\\)\\]\\)\\]$`));
      if (dropNaColsMatch) return { text: `${lhs} <- tidyr::drop_na(${lhs}, ${dropNaColsMatch[1]})`, nextName: lhs };

      const dropNaMatch = rhs.match(new RegExp(`^${self}\\[stats::complete\\.cases\\(${self}\\)\\]$`));
      if (dropNaMatch) return { text: `${lhs} <- tidyr::drop_na(${lhs})`, nextName: lhs };

      const filterMatch = rhs.match(new RegExp(`^${self}\\[(.+)\\]$`));
      if (filterMatch && !filterMatch[1].startsWith('order(')) {
        return { text: `${lhs} <- dplyr::filter(${lhs}, ${filterMatch[1]})`, nextName: lhs };
      }

      const mergeMatch = rhs.match(/^merge\(([A-Za-z.][A-Za-z0-9._]*), ([A-Za-z.][A-Za-z0-9._]*), by = c\((.+)\), all\.x = (TRUE|FALSE), all\.y = (TRUE|FALSE)\)$/);
      if (mergeMatch) {
        const joinFn = mergeMatch[4] === 'TRUE' && mergeMatch[5] === 'TRUE' ? 'full_join'
          : mergeMatch[4] === 'TRUE' ? 'left_join'
          : mergeMatch[5] === 'TRUE' ? 'right_join'
          : 'inner_join';
        return { text: `${lhs} <- dplyr::${joinFn}(${mergeMatch[1]}, ${mergeMatch[2]}, by = c(${mergeMatch[3]}))`, nextName: lhs };
      }

      const bindRowsMatch = rhs.match(/^data\.table::rbindlist\(list\(([A-Za-z.][A-Za-z0-9._]*), ([^)]+)\), use\.names = (TRUE|FALSE), fill = (TRUE|FALSE)\)$/);
      if (bindRowsMatch) {
        return { text: `${lhs} <- dplyr::bind_rows(${bindRowsMatch[1]}, ${bindRowsMatch[2]})`, nextName: lhs };
      }

      const dedupeByMatch = rhs.match(new RegExp(`^unique\\(${self}, by = c\\((.+)\\)\\)$`));
      if (dedupeByMatch) {
        return { text: `${lhs} <- dplyr::distinct(${lhs}, ${dedupeByMatch[1]}, .keep_all = TRUE)`, nextName: lhs };
      }

      const dedupeMatch = rhs.match(new RegExp(`^unique\\(${self}\\)$`));
      if (dedupeMatch) return { text: `${lhs} <- dplyr::distinct(${lhs})`, nextName: lhs };

      const headMatch = rhs.match(new RegExp(`^head\\(${self}, (.+)\\)$`));
      if (headMatch) return { text: `${lhs} <- dplyr::slice_head(${lhs}, n = ${headMatch[1]})`, nextName: lhs };

      const tailMatch = rhs.match(new RegExp(`^tail\\(${self}, (.+)\\)$`));
      if (tailMatch) return { text: `${lhs} <- dplyr::slice_tail(${lhs}, n = ${tailMatch[1]})`, nextName: lhs };

      const sampleMatch = rhs.match(new RegExp(`^${self}\\[sample\\(\\.N, min\\((.+), \\.N\\)\\)\\]$`));
      if (sampleMatch) return { text: `${lhs} <- dplyr::slice_sample(${lhs}, n = ${sampleMatch[1]})`, nextName: lhs };

      const meltMatch = rhs.match(/^melt\(([A-Za-z.][A-Za-z0-9._]*), id\.vars = c\((.+)\), measure\.vars = c\((.+)\), variable\.name = "([^"]+)", value\.name = "([^"]+)"\)$/);
      if (meltMatch) {
        return { text: `${lhs} <- tidyr::pivot_longer(${meltMatch[1]}, cols = c(${meltMatch[3]}), names_to = ${rString(meltMatch[4])}, values_to = ${rString(meltMatch[5])})`, nextName: lhs };
      }

      const dcastMatch = rhs.match(/^dcast\(([A-Za-z.][A-Za-z0-9._]*), (.+), value\.var = "([^"]+)"\)$/);
      if (dcastMatch) {
        const formulaBits = dcastMatch[2].split('~').map(x => x.trim());
        if (formulaBits.length === 2) {
          return { text: `${lhs} <- tidyr::pivot_wider(${dcastMatch[1]}, names_from = ${formulaBits[1]}, values_from = ${rString(dcastMatch[3])})`, nextName: lhs };
        }
      }
    }

    const mutateMatch = first.match(new RegExp(`^${escaped}\\[, (.+?) := (.+)\\]$`));
    if (mutateMatch) {
      return { text: `${currentName} <- dplyr::mutate(${currentName}, ${mutateMatch[1]} = ${mutateMatch[2]})`, nextName: currentName };
    }

    const setnamesMatch = first.match(new RegExp(`^data\\.table::setnames\\(${escaped}, c\\((.+)\\), c\\((.+)\\)\\)$`));
    if (setnamesMatch) {
      const pairs = transformRenamePairs(setnamesMatch[1], setnamesMatch[2]);
      if (pairs) return { text: `${currentName} <- dplyr::rename(${currentName}, ${pairs})`, nextName: currentName };
    }

    const setcolorderMatch = first.match(new RegExp(`^data\\.table::setcolorder\\(${escaped}, c\\((.+)\\)\\)$`));
    if (setcolorderMatch) {
      return { text: `${currentName} <- dplyr::select(${currentName}, ${parseQuotedVector(setcolorderMatch[1]).join(', ')})`, nextName: currentName };
    }

    return null;
  }

  function historyLineToPipe(line, currentName) {
    const escaped = escapeRegex(currentName);
    const assignment = parseAssignment(line);

    if (assignment) {
      const { lhs, rhs } = assignment;
      const rhsSelfSubset = rhs.match(new RegExp(`^${escaped}(\\[.+\\])$`));
      if (lhs === currentName && rhsSelfSubset) {
        return { code: `(\\(x) x${rhsSelfSubset[1]})()`, nextName: currentName, outputName: lhs };
      }

      const wrappedFns = ['unique', 'merge', 'melt', 'dcast'];
      for (const fn of wrappedFns) {
        const fnMatch = rhs.match(new RegExp(`^${fn}\\(${escaped}(.*)\\)$`));
        if (fnMatch) {
          return { code: `(\\(x) ${fn}(x${fnMatch[1]}))()`, nextName: lhs, outputName: lhs };
        }
      }

      const tableCall = rhs.match(new RegExp(`^${escaped}\\[, (.+)\\]$`));
      if (tableCall) {
        return { code: `(\\(x) x[, ${tableCall[1]}])()`, nextName: lhs, outputName: lhs };
      }

      return null;
    }

    const inPlace = line.match(new RegExp(`^${escaped}(\\[.+\\])$`));
    if (inPlace) {
      return {
        code: `(\\(x) { x${inPlace[1]}; x })()`,
        nextName: currentName,
        outputName: currentName,
      };
    }

    const setnames = line.match(new RegExp(`^setnames\\(${escaped}, (.+)\\)$`));
    if (setnames) {
      return {
        code: `(\\(x) { data.table::setnames(x, ${setnames[1]}); x })()`,
        nextName: currentName,
        outputName: currentName,
      };
    }

    return null;
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* ── clipboard & toast ── */
  function humanizeErrorMessage(message) {
    let msg = String(message ?? '').trim();
    if (!msg) return 'Something went wrong. Please try again.';

    msg = msg.replace(/^(Switch error|Remove error|Filter error|Join error|Arrange error|Reshape error|Relocate error|Drop NA error|Separate error|Unite error|Tabulate error|Crosstab error|Slice error|Count error|Undo error|Settings error|Area-name join error|Recode error|Rename error|Dedupe error|Export error|Error loading file|Error loading RCDF tables|Error inspecting RCDF file|Error loading|Error)\s*:\s*/i, '');

    const low = msg.toLowerCase();
    if (low.includes('openssl error') && low.includes('empty password')) {
      return 'The selected PEM key is password-protected. Enter the key password, then try again.';
    }
    if (low.includes('openssl error') && /(bad decrypt|cipherfinal error|mac verify failure|wrong password|invalid password)/i.test(msg)) {
      return 'The PEM key password looks incorrect. Check the password and try again.';
    }
    if (low.includes('openssl error')) {
      return 'The selected key file could not be opened. Check that you chose the correct PEM key and password, then try again.';
    }
    if (low.includes('unknown endpoint')) {
      return 'This action needs a tidyview restart. Run stop_tidygui(); tidygui(), then try again.';
    }
    if (low === 'column required' || low === 'col required') return 'Choose a column first.';
    if (low === 'row_var required') return 'Choose a row variable first.';
    if (low === 'col_var required') return 'Choose a column variable first.';
    if (low === 'mapping required') return 'Add at least one recode mapping, then try again.';
    if (low === 'name required') return 'Enter an object name first.';
    if (low.includes('path or file_name required') || low.includes('no readable file contents were provided')) {
      return 'Choose a file first, then try again.';
    }
    if (low === 'file_path required' || low === 'key_path required') {
      return 'The RCDF import details are incomplete. Choose the key and file again, then retry.';
    }

    return msg;
  }

  function showToast(msg) {
    let t = document.getElementById('tv-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'tv-toast';
      t.style.cssText = [
        'position:fixed;bottom:28px;left:50%;transform:translateX(-50%)',
        'background:var(--md-on-surface);color:var(--md-surface)',
        'padding:7px 18px;border-radius:20px;font-size:12px',
        'pointer-events:none;opacity:0;transition:opacity .18s;z-index:9999',
        'white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.18)',
      ].join(';');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._tmr);
    t._tmr = setTimeout(() => { t.style.opacity = '0'; }, 1800);
  }

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(`copied: ${label || text}`))
      .catch(() => {
        /* fallback for http contexts */
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(`copied: ${label || text}`);
      });
  }

  /* ── public API ── */
  function copyPreviewBlock(targetId, label) {
    const target = $(targetId);
    const text = String(target?.innerText || target?.textContent || '').trim();
    if (!text) {
      showToast('nothing to copy');
      return;
    }
    copyToClipboard(text, label || 'generated R code');
  }

  return {
    panels: {},
    api,
    init, renderTable, renderHistory, sortBy, changePage, openPanel, closePanel,
    consumePanelContext, openPanelForColumns,
    pushCode, setHistory, updateDimLabel, undo,
    updateSourceChip, expressionBuilderHtml, mutateExpressionBuilderHtml, insertExpr, insertExprFromButton, openCellValue, closeCellValue,
    openAppDialog, closeAppDialog, showMessage, showError, confirmMessage,
    addCondition, removeCondition, setLogic, setFilterMode, addFilterHelperCol, removeFilterHelperCol, updateFilterHelperPreview, updateFilterConditionsPreview,
    toggleSelectCol, selectAllCols,
    addGroupCol, removeGroupCol, addAggRow, addSummariseAcrossCol, removeSummariseAcrossCol, applySummariseAcross,
    caseWhenBuilderHtml, initCaseWhenBuilder, addCaseWhenRow, removeCaseWhenRow, getCaseWhenExpr, syncCaseWhenBuilder,
    loadFromEnv, loadFile, loadRcdfFile, applyRcdfImport, selectAllRcdfTables, setRcdfKeyFile, copyHistory, refreshEnv, refreshEnvCache,
    switchSession, removeSession, renderSessionTabs,
    copyToClipboard, copyPreviewBlock, showToast, escapeHtml, escapeAttr, rName, rString, formatImpactSummary,
    state,
  };

})();

document.addEventListener('DOMContentLoaded', TV.init);
