/* tidyview ops_extra.js — slice, count, replace_na / fill panels */
'use strict';

TV.panels = TV.panels || {};


/* ── slice ───────────────────────────────────────────────────────────── */

TV.panels.slice = function(pane) {
  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 5h14M3 10h14" stroke-linecap="round"/>
          <path d="M3 15h8" stroke-linecap="round"/>
          <path d="M14 13l3 2-3 2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">slice</div><div class="tv-panel-sub">slice_head() · slice_tail() · slice_sample()</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">✕</button>
    </div>
    <div class="tv-panel-body">
      <div class="tv-field">
        <label class="tv-field-label">method</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="slice-head"   onclick="TVSLICE.setType('head')">slice_head</button>
          <button class="tv-chip"          id="slice-tail"   onclick="TVSLICE.setType('tail')">slice_tail</button>
          <button class="tv-chip"          id="slice-sample" onclick="TVSLICE.setType('sample')">slice_sample</button>
        </div>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">n (number of rows)</label>
        <input class="tv-input" id="slice-n" type="number" min="1" value="100"
          style="padding:7px 10px;font-size:13px" oninput="TVSLICE.updatePreview()">
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="slice-preview" style="font:var(--tv-type-mono);font-size:11px;color:var(--md-on-surface)"></div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="slice-apply-btn">apply ↗</button>
    </div>`;

  document.getElementById('slice-apply-btn').addEventListener('click', TVSLICE.apply);
  TVSLICE.init();
};

const TVSLICE = (() => {
  let type = 'head';

  function init() { type = 'head'; updatePreview(); }

  function setType(t) {
    type = t;
    ['head','tail','sample'].forEach(x =>
      document.getElementById('slice-' + x)?.classList.toggle('selected', x === t));
    updatePreview();
  }

  function updatePreview() {
    const n    = document.getElementById('slice-n')?.value || '100';
    const name = TV.rName(TV.state.name || 'DT');
    const prev = document.getElementById('slice-preview');
    if (!prev) return;
    const code = {
      head:   `${name} <- head(${name}, ${n})`,
      tail:   `${name} <- tail(${name}, ${n})`,
      sample: `${name} <- ${name}[sample(.N, min(${n}, .N))]`,
    };
    prev.textContent = code[type];
  }

  async function apply() {
    const n = parseInt(document.getElementById('slice-n')?.value || '100');
    try {
      const res = await TV.api('op_slice', { type, n });
      TV.pushCode(res.code);
      TV.state.dt   = res.columns;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel(); TV.renderTable(); TV.closePanel();
    } catch(e) { await TV.showError('Slice error:\n' + e.message); }
  }

  return { init, setType, updatePreview, apply };
})();


/* ── count ───────────────────────────────────────────────────────────── */

TV.panels.count = function(pane) {
  const cols    = window.__TV_COLS__ || [];
  const colOpts = cols.map(c =>
    `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 14v-3l3-3 3 3 4-5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 17h12" stroke-linecap="round"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">count</div><div class="tv-panel-sub">count(.data, ...)</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">✕</button>
    </div>
    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Count rows per group. Leave empty to count total rows.
      </div>
      <div class="tv-field">
        <label class="tv-field-label">group by columns</label>
        <div id="count-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
        <select class="tv-select" id="count-add" onchange="TVCOUNT.addCol(this.value);this.value=''">
          <option value="">add column…</option>${colOpts}
        </select>
      </div>
      <div class="tv-field" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="count-sort" checked style="width:16px;height:16px;cursor:pointer">
        <label for="count-sort" style="font-size:12px;cursor:pointer">sort descending by count</label>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="count-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface)"></div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="count-apply-btn">count ↗</button>
    </div>`;

  document.getElementById('count-apply-btn').addEventListener('click', TVCOUNT.apply);
  document.getElementById('count-sort').addEventListener('change', TVCOUNT.updatePreview);
  TVCOUNT.init();
};

const TVCOUNT = (() => {
  let byCols = [];

  function init() { byCols = []; renderChips(); updatePreview(); }

  function addCol(col) {
    if (!col || byCols.includes(col)) return;
    byCols.push(col);
    renderChips(); updatePreview();
  }

  function removeCol(col) {
    byCols = byCols.filter(c => c !== col);
    renderChips(); updatePreview();
  }

  function renderChips() {
    const el = document.getElementById('count-chips');
    if (!el) return;
    el.innerHTML = byCols.map(c => `
      <button class="tv-chip selected" onclick='TVCOUNT.removeCol(${JSON.stringify(c)})'>
        ${TV.escapeHtml(c)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function updatePreview() {
    const name = TV.rName(TV.state.name || 'DT');
    const sort = document.getElementById('count-sort')?.checked;
    const prev = document.getElementById('count-preview');
    if (!prev) return;
    let code;
    if (byCols.length) {
      const by = byCols.map(c => TV.rName(c)).join(', ');
      code = `result <- ${name}[, .(n = .N), by = .(${by})]`;
      if (sort) code += `\nresult <- result[order(-n)]`;
    } else {
      code = `result <- data.table::data.table(n = nrow(${name}))`;
    }
    prev.textContent = code;
  }

  async function apply() {
    const sort = document.getElementById('count-sort')?.checked ?? true;
    try {
      const res = await TV.api('op_count', { by_cols: byCols, sort });
      TV.pushCode(res.code);
      TV.state.dt   = res.columns;
      TV.state.name = res.name || 'result';
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel(); TV.updateSourceChip(); TV.renderTable(); TV.closePanel();
    } catch(e) { await TV.showError('Count error:\n' + e.message); }
  }

  return { init, addCol, removeCol, updatePreview, apply };
})();


/* ── tabulate ────────────────────────────────────────────────────────── */

TV.panels.tabulate = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const colOpts = cols.map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`).join('');
  const builder = TV.expressionBuilderHtml('tab-weight', cols, {
    functions: ['ifelse', 'as.numeric', 'as.integer', 'abs', 'round'],
    snippets: [' + ', ' - ', ' * ', ' / ', 'ifelse(', '(', ')']
  });
  const defaultName = `${TV.state.name || 'DT'}_tab`;

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 5h12M4 10h9M4 15h6" stroke-linecap="round"/>
          <circle cx="15" cy="15" r="2"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">tabulate</div><div class="tv-panel-sub">frequency table to a new object</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">×</button>
    </div>
    <div class="tv-panel-body">
      <div class="tv-field">
        <label class="tv-field-label">column</label>
        <select class="tv-select" id="tab-col" onchange="TVTABULATE.updatePreview()">
          <option value="">choose column…</option>${colOpts}
        </select>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">output object</label>
        <input class="tv-input" id="tab-out" value="${defaultName}" style="font-family:var(--tv-type-mono)" oninput="TVTABULATE.updatePreview()">
      </div>
      <div class="tv-field">
        <label class="tv-field-label">engine</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="tab-engine-dt" onclick="TVTABULATE.setEngine('data.table')">data.table</button>
          <button class="tv-chip" id="tab-engine-tsg" onclick="TVTABULATE.setEngine('tsg')">tsg</button>
        </div>
      </div>
      <div class="tv-field" id="tab-weight-field">
        <label class="tv-field-label">weight expression (optional)</label>
        <textarea class="tv-input" id="tab-weight" placeholder="leave empty for simple counts" style="font-family:var(--tv-type-mono);min-height:72px;resize:vertical" oninput="TVTABULATE.updatePreview()"></textarea>
        ${builder}
      </div>
      <div class="tv-field" style="display:flex;gap:14px;flex-wrap:wrap" id="tab-dt-options">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="tab-sort" checked onchange="TVTABULATE.updatePreview()"> sort descending</label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="tab-pct" checked onchange="TVTABULATE.updatePreview()"> add percent</label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="tab-cum" onchange="TVTABULATE.updatePreview()"> cumulative percent</label>
      </div>
      <div class="tv-field" id="tab-tsg-options" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="tab-tsg-convert" onchange="TVTABULATE.updatePreview()"> convert factor labels</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="tab-tsg-include-na" checked onchange="TVTABULATE.updatePreview()"> include missing values</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="tab-tsg-total" checked onchange="TVTABULATE.updatePreview()"> add total row</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="tab-tsg-top-only" onchange="TVTABULATE.updatePreview()"> top n only</label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label class="tv-field-label">top n (optional)</label>
            <input class="tv-input" id="tab-tsg-topn" type="number" min="1" placeholder="e.g. 5" oninput="TVTABULATE.updatePreview()">
          </div>
          <div>
            <label class="tv-field-label">total position</label>
            <select class="tv-select" id="tab-tsg-position" onchange="TVTABULATE.updatePreview()">
              <option value="bottom" selected>bottom</option>
              <option value="top">top</option>
            </select>
          </div>
        </div>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="tab-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="tab-apply-btn">tabulate ↗</button>
    </div>`;

  document.getElementById('tab-apply-btn').addEventListener('click', TVTABULATE.apply);
  TVTABULATE.updatePreview();
};

const TVTABULATE = (() => {
  let engine = 'data.table';

  function setEngine(next) {
    engine = next;
    document.getElementById('tab-engine-dt')?.classList.toggle('selected', next === 'data.table');
    document.getElementById('tab-engine-tsg')?.classList.toggle('selected', next === 'tsg');
    const weightField = document.getElementById('tab-weight-field');
    const dtOptions = document.getElementById('tab-dt-options');
    const tsgOptions = document.getElementById('tab-tsg-options');
    if (weightField) weightField.style.display = next === 'data.table' ? '' : 'none';
    if (dtOptions) dtOptions.style.display = next === 'data.table' ? 'flex' : 'none';
    if (tsgOptions) tsgOptions.style.display = next === 'tsg' ? '' : 'none';
    updatePreview();
  }

  function updatePreview() {
    const source = TV.rName(TV.state.name || 'DT');
    const column = document.getElementById('tab-col')?.value;
    const out = document.getElementById('tab-out')?.value || `${source}_tab`;
    const weight = document.getElementById('tab-weight')?.value?.trim() || '';
    const sort = document.getElementById('tab-sort')?.checked ?? true;
    const pct = document.getElementById('tab-pct')?.checked ?? true;
    const cum = document.getElementById('tab-cum')?.checked ?? false;
    const prev = document.getElementById('tab-preview');
    if (!prev) return;
    if (!column) {
      prev.textContent = '# choose a column to tabulate';
      return;
    }
    const lines = [];
    if (engine === 'tsg') {
      const topN = document.getElementById('tab-tsg-topn')?.value?.trim();
      lines.push(`${TV.rName(out)} <- tsg::generate_frequency(${source}, ${TV.rName(column)}, sort_value = ${sort ? 'TRUE' : 'FALSE'}, convert_factor = ${document.getElementById('tab-tsg-convert')?.checked ? 'TRUE' : 'FALSE'}, add_total = ${document.getElementById('tab-tsg-total')?.checked ? 'TRUE' : 'FALSE'}, include_na = ${document.getElementById('tab-tsg-include-na')?.checked ? 'TRUE' : 'FALSE'}${topN ? `, top_n = ${topN}` : ''}${document.getElementById('tab-tsg-top-only')?.checked ? ', top_n_only = TRUE' : ''}, position_total = ${TV.rString(document.getElementById('tab-tsg-position')?.value || 'bottom')})`);
    } else {
      if (weight) lines.push(`${TV.rName(out)} <- ${source}[, .(n = sum(${weight}, na.rm = TRUE)), by = .(${TV.rName(column)})]`);
      else lines.push(`${TV.rName(out)} <- ${source}[, .(n = .N), by = .(${TV.rName(column)})]`);
      if (sort) lines.push(`${TV.rName(out)} <- ${TV.rName(out)}[order(-n)]`);
      if (pct || cum) lines.push(`${TV.rName(out)}[, pct := n / sum(n) * 100]`);
      if (cum) lines.push(`${TV.rName(out)}[, cum_pct := cumsum(pct)]`);
    }
    prev.textContent = lines.join('\n');
  }

  async function apply() {
    const column = document.getElementById('tab-col')?.value;
    if (!column) { await TV.showMessage('Choose a column to tabulate.'); return; }
    const payload = {
      column,
      output_name: document.getElementById('tab-out')?.value?.trim() || `${TV.state.name || 'DT'}_tab`,
      engine,
      weight_expr: document.getElementById('tab-weight')?.value || '',
      sort: document.getElementById('tab-sort')?.checked ?? true,
      percent: document.getElementById('tab-pct')?.checked ?? true,
      cumulative: document.getElementById('tab-cum')?.checked ?? false,
      convert_factor: document.getElementById('tab-tsg-convert')?.checked ?? false,
      include_na: document.getElementById('tab-tsg-include-na')?.checked ?? true,
      add_total: document.getElementById('tab-tsg-total')?.checked ?? true,
      top_n: document.getElementById('tab-tsg-topn')?.value || '',
      top_n_only: document.getElementById('tab-tsg-top-only')?.checked ?? false,
      position_total: document.getElementById('tab-tsg-position')?.value || 'bottom',
    };
    try {
      const res = await TV.api('op_tabulate', payload);
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.name = res.name || TV.state.name;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel(); TV.updateSourceChip(); TV.renderTable(); TV.closePanel();
    } catch(e) { await TV.showError('Tabulate error:\n' + e.message); }
  }

  return { setEngine, updatePreview, apply };
})();


/* ── crosstab ────────────────────────────────────────────────────────── */

TV.panels.crosstab = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const colOpts = cols.map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`).join('');
  const builder = TV.expressionBuilderHtml('xtab-weight', cols, {
    functions: ['ifelse', 'as.numeric', 'as.integer', 'abs', 'round'],
    snippets: [' + ', ' - ', ' * ', ' / ', 'ifelse(', '(', ')']
  });
  const defaultName = `${TV.state.name || 'DT'}_xtab`;

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="14" height="14" rx="2"/>
          <line x1="3" y1="8" x2="17" y2="8"/>
          <line x1="8" y1="3" x2="8" y2="17"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">crosstab</div><div class="tv-panel-sub">cross tabulation to a new object</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">×</button>
    </div>
    <div class="tv-panel-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="tv-field">
          <label class="tv-field-label">row variable</label>
          <select class="tv-select" id="xtab-row" onchange="TVCROSSTAB.updatePreview()">
            <option value="">choose row…</option>${colOpts}
          </select>
        </div>
        <div class="tv-field">
          <label class="tv-field-label">column variable</label>
          <select class="tv-select" id="xtab-col" onchange="TVCROSSTAB.updatePreview()">
            <option value="">choose column…</option>${colOpts}
          </select>
        </div>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">output object</label>
        <input class="tv-input" id="xtab-out" value="${defaultName}" style="font-family:var(--tv-type-mono)" oninput="TVCROSSTAB.updatePreview()">
      </div>
      <div class="tv-field">
        <label class="tv-field-label">engine</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="xtab-engine-dt" onclick="TVCROSSTAB.setEngine('data.table')">data.table</button>
          <button class="tv-chip" id="xtab-engine-tsg" onclick="TVCROSSTAB.setEngine('tsg')">tsg</button>
        </div>
      </div>
      <div class="tv-field" id="xtab-weight-field">
        <label class="tv-field-label">weight expression (optional)</label>
        <textarea class="tv-input" id="xtab-weight" placeholder="leave empty for simple counts" style="font-family:var(--tv-type-mono);min-height:72px;resize:vertical" oninput="TVCROSSTAB.updatePreview()"></textarea>
        ${builder}
      </div>
      <div class="tv-field" id="xtab-dt-options">
        <label class="tv-field-label">normalize</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="xtab-norm-none" onclick="TVCROSSTAB.setNormalize('none')">counts</button>
          <button class="tv-chip" id="xtab-norm-row" onclick="TVCROSSTAB.setNormalize('row')">row %</button>
          <button class="tv-chip" id="xtab-norm-col" onclick="TVCROSSTAB.setNormalize('col')">col %</button>
          <button class="tv-chip" id="xtab-norm-all" onclick="TVCROSSTAB.setNormalize('all')">overall %</button>
        </div>
      </div>
      <div class="tv-field" id="xtab-dt-totals">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="xtab-totals" onchange="TVCROSSTAB.updatePreview()"> add totals row and column</label>
      </div>
      <div class="tv-field" id="xtab-tsg-options" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="xtab-tsg-total" checked onchange="TVCROSSTAB.updatePreview()"> add totals</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="xtab-tsg-total-row" checked onchange="TVCROSSTAB.updatePreview()"> total row</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="xtab-tsg-total-col" checked onchange="TVCROSSTAB.updatePreview()"> total column</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="xtab-tsg-percent" checked onchange="TVCROSSTAB.updatePreview()"> add percent</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="xtab-tsg-percent-col" onchange="TVCROSSTAB.updatePreview()"> percent by column</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="xtab-tsg-convert" onchange="TVCROSSTAB.updatePreview()"> convert factor labels</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" id="xtab-tsg-include-na" checked onchange="TVCROSSTAB.updatePreview()"> include missing values</label>
        </div>
        <div>
          <label class="tv-field-label">total position</label>
          <select class="tv-select" id="xtab-tsg-position" onchange="TVCROSSTAB.updatePreview()">
            <option value="bottom" selected>bottom</option>
            <option value="top">top</option>
          </select>
        </div>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="xtab-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="xtab-apply-btn">crosstab ↗</button>
    </div>`;

  document.getElementById('xtab-apply-btn').addEventListener('click', TVCROSSTAB.apply);
  TVCROSSTAB.init();
  TVCROSSTAB.updatePreview();
};

const TVCROSSTAB = (() => {
  let engine = 'data.table';
  let normalize = 'none';

  function init() {
    engine = 'data.table';
    normalize = 'none';
  }

  function setEngine(next) {
    engine = next;
    document.getElementById('xtab-engine-dt')?.classList.toggle('selected', next === 'data.table');
    document.getElementById('xtab-engine-tsg')?.classList.toggle('selected', next === 'tsg');
    const weightField = document.getElementById('xtab-weight-field');
    const dtOptions = document.getElementById('xtab-dt-options');
    const dtTotals = document.getElementById('xtab-dt-totals');
    const tsgOptions = document.getElementById('xtab-tsg-options');
    if (weightField) weightField.style.display = next === 'data.table' ? '' : 'none';
    if (dtOptions) dtOptions.style.display = next === 'data.table' ? '' : 'none';
    if (dtTotals) dtTotals.style.display = next === 'data.table' ? '' : 'none';
    if (tsgOptions) tsgOptions.style.display = next === 'tsg' ? '' : 'none';
    updatePreview();
  }

  function setNormalize(mode) {
    normalize = mode;
    ['none', 'row', 'col', 'all'].forEach(x =>
      document.getElementById('xtab-norm-' + x)?.classList.toggle('selected', x === mode));
    updatePreview();
  }

  function updatePreview() {
    const source = TV.rName(TV.state.name || 'DT');
    const rowVar = document.getElementById('xtab-row')?.value;
    const colVar = document.getElementById('xtab-col')?.value;
    const out = document.getElementById('xtab-out')?.value || `${source}_xtab`;
    const weight = document.getElementById('xtab-weight')?.value?.trim() || '';
    const totals = document.getElementById('xtab-totals')?.checked ?? false;
    const prev = document.getElementById('xtab-preview');
    if (!prev) return;
    if (!rowVar || !colVar) {
      prev.textContent = '# choose row and column variables';
      return;
    }
    const lines = [];
    if (engine === 'tsg') {
      lines.push(`${TV.rName(out)} <- tsg::generate_crosstab(${source}, ${TV.rName(rowVar)}, ${TV.rName(colVar)}, add_total = ${document.getElementById('xtab-tsg-total')?.checked ? 'TRUE' : 'FALSE'}, add_total_row = ${document.getElementById('xtab-tsg-total-row')?.checked ? 'TRUE' : 'FALSE'}, add_total_column = ${document.getElementById('xtab-tsg-total-col')?.checked ? 'TRUE' : 'FALSE'}, add_percent = ${document.getElementById('xtab-tsg-percent')?.checked ? 'TRUE' : 'FALSE'}, percent_by_column = ${document.getElementById('xtab-tsg-percent-col')?.checked ? 'TRUE' : 'FALSE'}, convert_factor = ${document.getElementById('xtab-tsg-convert')?.checked ? 'TRUE' : 'FALSE'}, include_na = ${document.getElementById('xtab-tsg-include-na')?.checked ? 'TRUE' : 'FALSE'}, position_total = ${TV.rString(document.getElementById('xtab-tsg-position')?.value || 'bottom')})`);
    } else {
      if (weight) lines.push(`${TV.rName(out)} <- ${source}[, .(n = sum(${weight}, na.rm = TRUE)), by = .(${TV.rName(rowVar)}, ${TV.rName(colVar)})]`);
      else lines.push(`${TV.rName(out)} <- ${source}[, .(n = .N), by = .(${TV.rName(rowVar)}, ${TV.rName(colVar)})]`);
      if (normalize === 'row') lines.push(`${TV.rName(out)}[, value := n / sum(n) * 100, by = ${TV.rName(rowVar)}]`);
      if (normalize === 'col') lines.push(`${TV.rName(out)}[, value := n / sum(n) * 100, by = ${TV.rName(colVar)}]`);
      if (normalize === 'all') lines.push(`${TV.rName(out)}[, value := n / sum(n) * 100]`);
      lines.push(`${TV.rName(out)} <- data.table::dcast(${TV.rName(out)}, ${TV.rName(rowVar)} ~ ${TV.rName(colVar)}, value.var = "${normalize === 'none' ? 'n' : 'value'}", fill = 0)`);
      if (totals) lines.push(`# totals will be added to ${out}`);
    }
    prev.textContent = lines.join('\n');
  }

  async function apply() {
    const row_var = document.getElementById('xtab-row')?.value;
    const col_var = document.getElementById('xtab-col')?.value;
    if (!row_var || !col_var) { await TV.showMessage('Choose row and column variables.'); return; }
    const payload = {
      row_var,
      col_var,
      output_name: document.getElementById('xtab-out')?.value?.trim() || `${TV.state.name || 'DT'}_xtab`,
      engine,
      weight_expr: document.getElementById('xtab-weight')?.value || '',
      normalize,
      totals: document.getElementById('xtab-totals')?.checked ?? false,
      add_total: document.getElementById('xtab-tsg-total')?.checked ?? true,
      add_total_row: document.getElementById('xtab-tsg-total-row')?.checked ?? true,
      add_total_column: document.getElementById('xtab-tsg-total-col')?.checked ?? true,
      add_percent: document.getElementById('xtab-tsg-percent')?.checked ?? true,
      percent_by_column: document.getElementById('xtab-tsg-percent-col')?.checked ?? false,
      convert_factor: document.getElementById('xtab-tsg-convert')?.checked ?? false,
      include_na: document.getElementById('xtab-tsg-include-na')?.checked ?? true,
      position_total: document.getElementById('xtab-tsg-position')?.value || 'bottom',
    };
    try {
      const res = await TV.api('op_crosstab', payload);
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.name = res.name || TV.state.name;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel(); TV.updateSourceChip(); TV.renderTable(); TV.closePanel();
    } catch(e) { await TV.showError('Crosstab error:\n' + e.message); }
  }

  return { init, setEngine, setNormalize, updatePreview, apply };
})();


/* ── replace_na / fill ───────────────────────────────────────────────── */

TV.panels.fill_na = function(pane) {
  const cols    = window.__TV_COLS__ || [];
  const colOpts = cols.map(c =>
    `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="14" height="14" rx="2"/>
          <path d="M8 10h4M10 8v4" stroke-linecap="round" opacity=".5"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">replace_na / fill</div><div class="tv-panel-sub">replace_na() · fill()</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">✕</button>
    </div>
    <div class="tv-panel-body">
      <div class="tv-field">
        <label class="tv-field-label">columns to fill</label>
        <div id="fillna-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
        <select class="tv-select" id="fillna-add" onchange="TVFILLNA.addCol(this.value);this.value=''">
          <option value="">add column…</option>${colOpts}
        </select>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">method</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="fillna-value"  onclick="TVFILLNA.setMethod('value')">replace_na</button>
          <button class="tv-chip"          id="fillna-down"   onclick="TVFILLNA.setMethod('down')">fill down</button>
          <button class="tv-chip"          id="fillna-up"     onclick="TVFILLNA.setMethod('up')">fill up</button>
        </div>
      </div>
      <div id="fillna-value-field" class="tv-field">
        <label class="tv-field-label">replacement value</label>
        <input class="tv-input" id="fillna-val" style="padding:7px 10px;font-size:13px;font-family:var(--tv-type-mono)"
          placeholder="e.g. 0 or Unknown" oninput="TVFILLNA.updatePreview()">
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="fillna-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="fillna-apply-btn">apply ↗</button>
    </div>`;

  document.getElementById('fillna-apply-btn').addEventListener('click', TVFILLNA.apply);
  TVFILLNA.init();
};

const TVFILLNA = (() => {
  let cols   = [];
  let method = 'value';

  function init() { cols = []; method = 'value'; renderChips(); updatePreview(); }

  function addCol(col) {
    if (!col || cols.includes(col)) return;
    cols.push(col);
    renderChips(); updatePreview();
  }

  function removeCol(col) {
    cols = cols.filter(c => c !== col);
    renderChips(); updatePreview();
  }

  function renderChips() {
    const el = document.getElementById('fillna-chips');
    if (!el) return;
    el.innerHTML = cols.map(c => `
      <button class="tv-chip selected" onclick='TVFILLNA.removeCol(${JSON.stringify(c)})'>
        ${TV.escapeHtml(c)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function setMethod(m) {
    method = m;
    ['value','down','up'].forEach(x =>
      document.getElementById('fillna-' + x)?.classList.toggle('selected', x === m));
    const field = document.getElementById('fillna-value-field');
    if (field) field.style.display = m === 'value' ? '' : 'none';
    updatePreview();
  }

  function updatePreview() {
    const name = TV.rName(TV.state.name || 'DT');
    const val  = document.getElementById('fillna-val')?.value || '';
    const prev = document.getElementById('fillna-preview');
    if (!prev) return;
    if (!cols.length) { prev.textContent = '# select columns above'; return; }
    const lines = cols.map(col => {
      if (method === 'value') {
        const q = isNaN(val) || val === '' ? `"${val}"` : val;
        return `${name}[is.na(${TV.rName(col)}), ${TV.rName(col)} := ${q}]`;
      }
      const t = method === 'down' ? 'locf' : 'nocb';
      return `${name}[, ${TV.rName(col)} := data.table::nafill(${TV.rName(col)}, type = "${t}")]`;
    });
    prev.textContent = lines.join('\n');
  }

  async function apply() {
    if (!cols.length) { await TV.showMessage('Select at least one column.'); return; }
    const val = document.getElementById('fillna-val')?.value || '';
    try {
      const res = await TV.api('op_fill_na', { columns: cols, method, value: val });
      TV.pushCode(res.code);
      TV.state.dt   = res.columns;
      TV.state.nrow = res.nrow;
      TV.updateDimLabel(); TV.renderTable(); TV.closePanel();
    } catch(e) { await TV.showError('Fill NA error:\n' + e.message); }
  }

  return { init, addCol, removeCol, setMethod, updatePreview, apply };
})();


/* columns panel moved to ops_columns.js */

/* ── (end of ops_extra.js) ───────────────────────────────────────────── */

if (false) { TV.panels.columns = function(pane) {
  const cols = window.__TV_COLS__ || [];

  function renderList(filter) {
    const q = (filter || '').toLowerCase();
    const visible = q ? cols.filter(c => c.name.toLowerCase().includes(q)) : cols;
    if (!visible.length) return `<div style="padding:16px;color:var(--md-on-surface-variant);font-size:12px;text-align:center">no columns match</div>`;

    return visible.map((c, i) => {
      const na    = (c.n_na || 0);
      const nrow  = TV.state.nrow || 0;
      const naPct = nrow > 0 ? ((na / nrow) * 100).toFixed(1) : '—';
      const samp  = (c.sample || []).map(s => `<span style="background:var(--md-surface-variant);padding:1px 5px;border-radius:4px;font-size:10px">${String(s).replace(/</g,'&lt;')}</span>`).join(' ');
      const esc   = c.name.replace(/'/g, "\\'");
      return `
        <div style="display:grid;grid-template-columns:28px 1fr auto;gap:6px;align-items:start;padding:8px 4px;border-bottom:1px solid var(--md-outline-variant)">
          <span style="font-size:10px;color:var(--md-on-surface-variant);padding-top:2px;text-align:right">${i + 1}</span>
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
              <span style="font-weight:500;font-size:13px">${c.name}</span>
              <span class="tv-type tv-type-${c.type}" style="font-size:9px">${c.type}</span>
              ${c.label ? `<span style="font-size:10px;color:var(--md-on-surface-variant)">${c.label}</span>` : ''}
            </div>
            <div style="font-size:10px;color:var(--md-on-surface-variant);line-height:1.5">
              ${c.n_unique} unique · ${na} NA (${naPct}%)
              ${samp ? `<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px">${samp}</div>` : ''}
            </div>
          </div>
          <button title="copy name" onclick="TV.copyToClipboard('${esc}','${esc}')"
            style="padding:4px 6px;border:1px solid var(--md-outline-variant);border-radius:6px;background:transparent;cursor:pointer;font-size:11px;color:var(--md-primary);white-space:nowrap">⎘</button>
        </div>`;
    }).join('');
  }

  const allNames = cols.map(c => c.name);
  const asRVec   = `c(${allNames.map(n => `"${n}"`).join(', ')})`;
  const asCSV    = allNames.join(', ');
  const asBTick  = allNames.map(n => `\`${n}\``).join(', ');

  /* store strings on helper so onclick can reference them without quoting issues */
  window.TVCOLBROWSER = {
    render:    renderList,
    copyRVec:  () => TV.copyToClipboard(asRVec,  'column names as R vector'),
    copyCSV:   () => TV.copyToClipboard(asCSV,   'column names'),
    copyBTick: () => TV.copyToClipboard(asBTick, 'column names (backtick)'),
  };

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="14" height="14" rx="2"/>
          <line x1="3" y1="8" x2="17" y2="8"/>
          <line x1="8" y1="8" x2="8" y2="17"/>
          <line x1="13" y1="8" x2="13" y2="17"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">columns</div>
        <div class="tv-panel-sub">${cols.length} column${cols.length === 1 ? '' : 's'}</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">✕</button>
    </div>

    <div class="tv-panel-body">

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        <button class="tv-btn-outlined" style="font-size:11px;padding:5px 10px"
          onclick="TVCOLBROWSER.copyRVec()">⎘ R vector</button>
        <button class="tv-btn-outlined" style="font-size:11px;padding:5px 10px"
          onclick="TVCOLBROWSER.copyCSV()">⎘ comma list</button>
        <button class="tv-btn-outlined" style="font-size:11px;padding:5px 10px"
          onclick="TVCOLBROWSER.copyBTick()">⎘ backtick list</button>
      </div>

      <input class="tv-input" id="col-browser-search" placeholder="search column names…"
        style="margin-bottom:8px;width:100%"
        oninput="document.getElementById('col-browser-list').innerHTML = TVCOLBROWSER.render(this.value)">

      <div id="col-browser-list" style="overflow-y:auto;max-height:420px">
        ${renderList('')}
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">close</button>
    </div>`;
}; }
