/* tidyview ops_filter.js — filter rows panel, condition builder */
'use strict';

TV.panels = TV.panels || {};

TV.panels.filter = function(pane) {
  const cols = window.__TV_COLS__ || [];

  const colOpts = cols.map(c =>
    `<option value="${TV.escapeAttr(c.name)}" data-type="${c.type}">${TV.escapeHtml(c.name)} (${c.type})</option>`
  ).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 6h14M6 10h8M9 14h2" stroke-linecap="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">filter rows</div>
        <div class="tv-panel-sub" id="filter-sub">DT[i] · building conditions…</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">✕</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Keep rows that match your conditions. Each condition filters by
        column, operator, and value — the generated R expression updates live below.
      </div>

      <div id="cond-rows"></div>

      <button class="tv-add-btn" id="add-cond-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
        </svg>
        add condition
      </button>

      <div style="margin-top:16px;padding:12px 14px;background:var(--md-surface-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:6px;font-weight:500">combine conditions with</div>
        <div style="display:flex;gap:8px">
          <button class="tv-chip selected" id="logic-AND" onclick="TVFILTER.setLogic('AND')">AND — all must match</button>
          <button class="tv-chip" id="logic-OR"  onclick="TVFILTER.setLogic('OR')">OR — any can match</button>
        </div>
      </div>

      <div style="margin-top:14px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="filter-code-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);word-break:break-all">
          <span style="color:var(--md-on-surface-variant);font-style:italic">add a condition above…</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="filter-apply-btn">apply filter ↗</button>
    </div>`;

  document.getElementById('add-cond-btn').addEventListener('click', TVFILTER.addRow);
  document.getElementById('filter-apply-btn').addEventListener('click', TVFILTER.apply);

  TVFILTER.init(cols, colOpts);
  TVFILTER.addRow();
};


const TVFILTER = (() => {

  let cols    = [];
  let colOpts = '';
  let logic   = 'AND';
  let rows    = [];

  const OPS_BY_TYPE = {
    int:   ['==','!=','>','>=','<','<=','%between%','%in%','!%in%','is.na','!is.na'],
    dbl:   ['==','!=','>','>=','<','<=','%between%','%in%','!%in%','is.na','!is.na'],
    chr:   ['==','!=','%in%','!%in%','%like%','%starts%','%ends%','%regex%','!%regex%','is.na','!is.na'],
    lgl:   ['is.true','is.false','is.na','!is.na'],
    IDate: ['==','!=','>','>=','<','<=','%between%','is.na','!is.na'],
    Date:  ['==','!=','>','>=','<','<=','%between%','is.na','!is.na'],
    factor:['==','!=','%in%','!%in%','%starts%','%ends%','%regex%','!%regex%','is.na','!is.na'],
  };

  const OP_LABELS = {
    '==': '= equals', '!=': '≠ not equals',
    '>':  '> greater', '>=': '≥ greater or eq',
    '<':  '< less',    '<=': '≤ less or eq',
    '%between%': 'between',
    '%in%':   'in list', '!%in%': 'not in list',
    '%like%': 'contains text',
    '%starts%': 'starts with',
    '%ends%': 'ends with',
    '%regex%': 'matches regex',
    '!%regex%': 'does not match regex',
    'is.na':  'is NA', '!is.na': 'is not NA',
    'is.true': 'is TRUE', 'is.false': 'is FALSE',
  };

  const NO_VALUE_OPS = new Set(['is.na','!is.na','is.true','is.false']);

  function init(_cols, _colOpts) {
    cols    = _cols;
    colOpts = _colOpts;
    logic   = 'AND';
    rows    = [];
  }

  function setLogic(v) {
    logic = v;
    document.getElementById('logic-AND')?.classList.toggle('selected', v === 'AND');
    document.getElementById('logic-OR')?.classList.toggle('selected',  v === 'OR');
    updatePreview();
  }

  function getColType(colName) {
    const col = cols.find(c => c.name === colName);
    return col?.type || 'chr';
  }

  function addRow() {
    const id = 'r' + Date.now();
    rows.push(id);

    const container = document.getElementById('cond-rows');
    if (!container) return;

    const div = document.createElement('div');
    div.id    = 'cond-row-' + id;
    div.style.cssText = 'border:0.5px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);padding:10px 12px;margin-bottom:8px;background:var(--md-surface)';

    div.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px">
        <div>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">column</div>
          <select class="tv-select" id="col-${id}" style="padding:7px 10px;font-size:12px" onchange="TVFILTER.onColChange('${id}')">
            ${colOpts}
          </select>
        </div>
        <div>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">operator</div>
          <select class="tv-select" id="op-${id}" style="padding:7px 10px;font-size:12px" onchange="TVFILTER.onOpChange('${id}')">
          </select>
        </div>
      </div>
      <div id="val-wrap-${id}">
        <div style="font-size:10px;color:var(--md-on-surface-variant);margin-bottom:4px;font-weight:500">value</div>
        <input class="tv-input" id="val-${id}" style="padding:7px 10px;font-size:12px;font-family:var(--tv-type-mono)" placeholder="enter value…" oninput="TVFILTER.updatePreview()">
        <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:4px" id="val-hint-${id}"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:8px">
        <button onclick="TVFILTER.removeRow('${id}')" style="font-size:11px;padding:3px 10px;border-radius:var(--tv-radius-full);border:0.5px solid var(--md-outline-variant);background:transparent;color:var(--md-on-surface-variant);cursor:pointer">remove</button>
      </div>`;

    container.appendChild(div);
    populateOps(id);
    onColChange(id);
  }

  function populateOps(id) {
    const colEl = document.getElementById('col-' + id);
    const opEl  = document.getElementById('op-'  + id);
    if (!colEl || !opEl) return;

    const type    = getColType(colEl.value);
    const allowed = OPS_BY_TYPE[type] || OPS_BY_TYPE.chr;
    opEl.innerHTML = allowed.map(op =>
      `<option value="${op}">${OP_LABELS[op] || op}</option>`
    ).join('');
  }

  function onColChange(id) {
    populateOps(id);
    onOpChange(id);
    // populate value hints based on column sample
    const colEl  = document.getElementById('col-' + id);
    const hint   = document.getElementById('val-hint-' + id);
    if (!colEl || !hint) return;
    const col = cols.find(c => c.name === colEl.value);
    if (col?.sample?.length) {
      hint.textContent = `e.g. ${col.sample.slice(0,3).join(' · ')}`;
    }
    updatePreview();
  }

  function onOpChange(id) {
    const opEl      = document.getElementById('op-'       + id);
    const valWrap   = document.getElementById('val-wrap-' + id);
    if (!opEl || !valWrap) return;

    const noVal = NO_VALUE_OPS.has(opEl.value);
    valWrap.style.display = noVal ? 'none' : 'block';

    // swap to textarea for %in% / !%in%
    const isMulti = ['%in%','!%in%'].includes(opEl.value);
    const valEl   = document.getElementById('val-' + id);
    const type = getColType(document.getElementById('col-' + id)?.value || '');
    if (valEl) {
      valEl.placeholder = isMulti
        ? 'comma-separated: North, East, West'
        : ['%regex%','!%regex%'].includes(opEl.value)
          ? 'e.g. ^A|_code$'
        : ['%starts%','%ends%'].includes(opEl.value)
          ? 'e.g. San or son'
        : opEl.value === '%between%' && ['Date', 'IDate'].includes(type)
          ? 'e.g. 2024-01-01, 2024-12-31'
        : opEl.value === '%between%'
          ? 'e.g. 1, 100'
        : 'enter value…';
    }
    updatePreview();
  }

  function removeRow(id) {
    rows = rows.filter(r => r !== id);
    document.getElementById('cond-row-' + id)?.remove();
    updatePreview();
  }

  function buildExprs() {
    return rows
      .filter(id => document.getElementById('cond-row-' + id))
      .map(id => {
        const col = document.getElementById('col-' + id)?.value;
        const op  = document.getElementById('op-'  + id)?.value;
        const val = document.getElementById('val-' + id)?.value || '';
        if (!col || !op) return null;
        return { col, op, val };
      })
      .filter(Boolean)
      .map(c => condToExpr(c));
  }

  function condToExpr({ col, op, val }) {
    const colRef = TV.rName(col);
    if (op === 'is.na')    return `is.na(${colRef})`;
    if (op === '!is.na')   return `!is.na(${colRef})`;
    if (op === 'is.true')  return `${colRef} %in% TRUE`;
    if (op === 'is.false') return `${colRef} %in% FALSE`;

    const type = getColType(col);
    const isNum = ['int','dbl'].includes(type);
    const valueCode = function(item) {
      if (type === 'IDate') return `data.table::as.IDate(${TV.rString(item)})`;
      if (type === 'Date') return `as.Date(${TV.rString(item)})`;
      if (isNum) return item;
      return TV.rString(item);
    };

    if (op === '%in%' || op === '!%in%') {
      const parts = val.split(',').map(s => s.trim()).filter(Boolean);
      const items = parts.map(valueCode).join(', ');
      return op === '!%in%'
        ? `!(${colRef} %in% c(${items}))`
        : `${colRef} %in% c(${items})`;
    }
    if (op === '%between%') {
      const parts = val.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) return `${colRef} >= ${valueCode(parts[0] || '')}`;
      return `(${colRef} >= ${valueCode(parts[0])} & ${colRef} <= ${valueCode(parts[1])})`;
    }
    if (op === '%like%') return `grepl(${TV.rString(val)}, as.character(${colRef}), ignore.case = TRUE, fixed = TRUE)`;
    if (op === '%starts%') return `startsWith(as.character(${colRef}), ${TV.rString(val)})`;
    if (op === '%ends%') return `endsWith(as.character(${colRef}), ${TV.rString(val)})`;
    if (op === '%regex%') return `grepl(${TV.rString(val)}, as.character(${colRef}), perl = TRUE)`;
    if (op === '!%regex%') return `!grepl(${TV.rString(val)}, as.character(${colRef}), perl = TRUE)`;

    return `${colRef} ${op} ${valueCode(val)}`;
  }

  function updatePreview() {
    const exprs = buildExprs();
    const prev  = document.getElementById('filter-code-preview');
    const sub   = document.getElementById('filter-sub');
    if (!prev) return;

    if (!exprs.length) {
      prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">add a condition above…</span>`;
      if (sub) sub.textContent = 'DT[i] · no conditions yet';
      return;
    }

    const sep  = logic === 'AND' ? ' &\n  ' : ' |\n  ';
    const expr = exprs.join(sep);
    const source = TV.rName(TV.state.name || 'DT');
    const code = `${source} <- ${source}[${expr}]`;
    prev.textContent = code;
    if (sub) sub.textContent = `DT[i] · ${exprs.length} condition${exprs.length !== 1 ? 's' : ''}`;
  }

  async function apply() {
    const conditions = rows
      .filter(id => document.getElementById('cond-row-' + id))
      .map(id => ({
        col: document.getElementById('col-' + id)?.value,
        op:  document.getElementById('op-'  + id)?.value,
        val: document.getElementById('val-' + id)?.value || '',
      }))
      .filter(c => c.col && c.op);

    if (!conditions.length) {
      await TV.showMessage('Add at least one condition before applying.');
      return;
    }

    const btn = document.getElementById('filter-apply-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'applying…'; }

    try {
      const res = await TV.api('op_filter', { conditions, logic });
      TV.pushCode(res.code);
      TV.state.nrow = res.nrow;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch(e) {
      await TV.showError('Filter error:\n' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'apply filter ↗'; }
    }
  }

  return { init, addRow, removeRow, onColChange, onOpChange, setLogic, updatePreview, apply };

})();
