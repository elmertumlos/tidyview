/* tidyview ops_tidyverse.js - relocate, drop_na, separate, unite */
'use strict';

TV.panels = TV.panels || {};

TV.panels.relocate = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const options = cols.map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6h5M4 10h12M4 14h8" stroke-linecap="round"/>
          <path d="M14 6l2-2M16 4l2 2M16 4v7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">relocate</div><div class="tv-panel-sub">move columns before or after another column</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>
    <div class="tv-panel-body">
      <div class="tv-field">
        <label class="tv-field-label">columns to move</label>
        <div id="relocate-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
        <select class="tv-select" id="relocate-add" onchange="TVRELOCATE.addCol(this.value);this.value=''">
          <option value="">add column...</option>${options}
        </select>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">position</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <button class="tv-chip selected" id="rel-pos-front" onclick="TVRELOCATE.setMode('front')">to front</button>
          <button class="tv-chip" id="rel-pos-before" onclick="TVRELOCATE.setMode('before')">before</button>
          <button class="tv-chip" id="rel-pos-after" onclick="TVRELOCATE.setMode('after')">after</button>
        </div>
        <select class="tv-select" id="relocate-anchor" onchange="TVRELOCATE.updatePreview()" style="display:none">
          <option value="">choose anchor column...</option>${options}
        </select>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="relocate-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="relocate-apply-btn">apply -></button>
    </div>`;

  document.getElementById('relocate-apply-btn').addEventListener('click', TVRELOCATE.apply);
  TVRELOCATE.init();
};

const TVRELOCATE = (() => {
  let cols = [];
  let mode = 'front';

  function init() {
    cols = [];
    mode = 'front';
    renderChips();
    syncMode();
    updatePreview();
  }

  function addCol(col) {
    if (!col || cols.includes(col)) return;
    cols.push(col);
    renderChips();
    updatePreview();
  }

  function removeCol(col) {
    cols = cols.filter(x => x !== col);
    renderChips();
    updatePreview();
  }

  function renderChips() {
    const el = document.getElementById('relocate-chips');
    if (!el) return;
    el.innerHTML = cols.map(col => `
      <button class="tv-chip selected" onclick='TVRELOCATE.removeCol(${JSON.stringify(col)})'>
        ${TV.escapeHtml(col)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function setMode(nextMode) {
    mode = nextMode;
    syncMode();
    updatePreview();
  }

  function syncMode() {
    ['front', 'before', 'after'].forEach(id => {
      document.getElementById('rel-pos-' + id)?.classList.toggle('selected', id === mode);
    });
    const anchor = document.getElementById('relocate-anchor');
    if (anchor) anchor.style.display = mode === 'front' ? 'none' : '';
  }

  function buildCode() {
    if (!cols.length) return '# choose one or more columns to move';
    const name = TV.rName(TV.state.name || 'DT');
    const current = (window.__TV_COLS__ || []).map(c => c.name);
    const anchor = document.getElementById('relocate-anchor')?.value || '';
    let order = current.filter(col => !cols.includes(col));
    if (mode === 'before' && anchor) {
      const idx = order.indexOf(anchor);
      order.splice(Math.max(0, idx), 0, ...cols);
    } else if (mode === 'after' && anchor) {
      const idx = order.indexOf(anchor);
      order.splice(idx + 1, 0, ...cols);
    } else {
      order = cols.concat(order);
    }
    return `data.table::setcolorder(${name}, c(${order.map(TV.rString).join(', ')}))`;
  }

  function updatePreview() {
    const prev = document.getElementById('relocate-preview');
    if (!prev) return;
    prev.textContent = buildCode();
  }

  async function apply() {
    if (!cols.length) {
      await TV.showMessage('Choose at least one column to move.', { title: 'Relocate Incomplete' });
      return;
    }
    const anchor = document.getElementById('relocate-anchor')?.value || '';
    if ((mode === 'before' || mode === 'after') && !anchor) {
      await TV.showMessage('Choose the anchor column first.', { title: 'Relocate Incomplete' });
      return;
    }
    try {
      const res = await TV.api('op_relocate', {
        columns: cols,
        before: mode === 'before' ? anchor : null,
        after: mode === 'after' ? anchor : null,
      });
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Relocate error:\n' + e.message);
    }
  }

  return { init, addCol, removeCol, setMode, updatePreview, apply };
})();


TV.panels.drop_na = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const options = cols.map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6h12M6 10h8M8 14h4" stroke-linecap="round"/>
          <path d="M13 12l3 3M16 12l-3 3" stroke-linecap="round"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">drop_na</div><div class="tv-panel-sub">remove rows with missing values</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>
    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Leave the selection empty to drop rows with missing values anywhere in the table.
      </div>
      <div class="tv-field">
        <label class="tv-field-label">check missing values in</label>
        <div id="dropna-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
        <select class="tv-select" id="dropna-add" onchange="TVDROPNA.addCol(this.value);this.value=''">
          <option value="">add column...</option>${options}
        </select>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="dropna-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
      </div>
      <div id="dropna-impact" style="margin-top:8px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);font-size:11px;color:var(--md-on-surface-variant)">
        Previewing impact...
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="dropna-apply-btn">apply -></button>
    </div>`;

  document.getElementById('dropna-apply-btn').addEventListener('click', TVDROPNA.apply);
  TVDROPNA.init();
};

const TVDROPNA = (() => {
  let cols = [];
  let previewSeq = 0;

  function init() {
    cols = [];
    previewSeq = 0;
    renderChips();
    updatePreview();
  }

  function addCol(col) {
    if (!col || cols.includes(col)) return;
    cols.push(col);
    renderChips();
    updatePreview();
  }

  function removeCol(col) {
    cols = cols.filter(x => x !== col);
    renderChips();
    updatePreview();
  }

  function renderChips() {
    const el = document.getElementById('dropna-chips');
    if (!el) return;
    el.innerHTML = cols.map(col => `
      <button class="tv-chip selected" onclick='TVDROPNA.removeCol(${JSON.stringify(col)})'>
        ${TV.escapeHtml(col)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function updatePreview() {
    const prev = document.getElementById('dropna-preview');
    const impact = document.getElementById('dropna-impact');
    if (!prev) return;
    const name = TV.rName(TV.state.name || 'DT');
    prev.textContent = cols.length
      ? `${name} <- ${name}[stats::complete.cases(${name}[, .(${cols.map(TV.rName).join(', ')})])]`
      : `${name} <- ${name}[stats::complete.cases(${name})]`;
    if (!impact) return;
    const seq = ++previewSeq;
    impact.textContent = 'Previewing impact...';
    TV.api('preview_op', { op: 'drop_na', params: { columns: cols } })
      .then(res => {
        if (seq !== previewSeq) return;
        impact.textContent = TV.formatImpactSummary(res, 'drop_na');
      })
      .catch(e => {
        if (seq !== previewSeq) return;
        impact.textContent = e.message;
      });
  }

  async function apply() {
    try {
      const res = await TV.api('op_drop_na', { columns: cols });
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Drop NA error:\n' + e.message);
    }
  }

  return { init, addCol, removeCol, updatePreview, apply };
})();


TV.panels.separate = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const options = cols.map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M5 5v10M15 5v10" stroke-linecap="round"/>
          <path d="M8 10h4" stroke-linecap="round"/>
          <path d="M10 7l3 3-3 3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">separate / unite</div><div class="tv-panel-sub">split one column or combine many columns</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>
    <div class="tv-panel-body">
      <div class="tv-field">
        <label class="tv-field-label">mode</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="sep-mode-separate" onclick="TVSEPARATE.setMode('separate')">separate</button>
          <button class="tv-chip" id="sep-mode-unite" onclick="TVSEPARATE.setMode('unite')">unite</button>
        </div>
      </div>

      <div id="separate-fields">
        <div class="tv-field">
          <label class="tv-field-label">column to split</label>
          <select class="tv-select" id="separate-source" onchange="TVSEPARATE.updatePreview()">
            <option value="">choose column...</option>${options}
          </select>
        </div>
        <div class="tv-field">
          <label class="tv-field-label">new columns (comma-separated)</label>
          <input class="tv-input" id="separate-into" placeholder="e.g. province, city, barangay" oninput="TVSEPARATE.updatePreview()">
        </div>
      </div>

      <div id="unite-fields" style="display:none">
        <div class="tv-field">
          <label class="tv-field-label">columns to combine</label>
          <div id="unite-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
          <select class="tv-select" id="unite-add" onchange="TVSEPARATE.addUniteCol(this.value);this.value=''">
            <option value="">add column...</option>${options}
          </select>
        </div>
        <div class="tv-field">
          <label class="tv-field-label">new column name</label>
          <input class="tv-input" id="unite-into" placeholder="e.g. full_name" oninput="TVSEPARATE.updatePreview()">
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">separator</label>
        <input class="tv-input" id="sep-delim" value="_" oninput="TVSEPARATE.updatePreview()">
      </div>
      <div class="tv-field" style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="sep-remove" checked onchange="TVSEPARATE.updatePreview()">
        <label for="sep-remove" style="font-size:12px;cursor:pointer">remove source column(s) after operation</label>
      </div>

      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="separate-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="separate-apply-btn">apply -></button>
    </div>`;

  document.getElementById('separate-apply-btn').addEventListener('click', TVSEPARATE.apply);
  TVSEPARATE.init();
};

const TVSEPARATE = (() => {
  let mode = 'separate';
  let uniteCols = [];

  function init() {
    mode = 'separate';
    uniteCols = [];
    syncMode();
    renderUniteChips();
    updatePreview();
  }

  function setMode(nextMode) {
    mode = nextMode;
    syncMode();
    updatePreview();
  }

  function syncMode() {
    document.getElementById('sep-mode-separate')?.classList.toggle('selected', mode === 'separate');
    document.getElementById('sep-mode-unite')?.classList.toggle('selected', mode === 'unite');
    const sepFields = document.getElementById('separate-fields');
    const uniteFields = document.getElementById('unite-fields');
    if (sepFields) sepFields.style.display = mode === 'separate' ? '' : 'none';
    if (uniteFields) uniteFields.style.display = mode === 'unite' ? '' : 'none';
  }

  function addUniteCol(col) {
    if (!col || uniteCols.includes(col)) return;
    uniteCols.push(col);
    renderUniteChips();
    updatePreview();
  }

  function removeUniteCol(col) {
    uniteCols = uniteCols.filter(x => x !== col);
    renderUniteChips();
    updatePreview();
  }

  function renderUniteChips() {
    const el = document.getElementById('unite-chips');
    if (!el) return;
    el.innerHTML = uniteCols.map(col => `
      <button class="tv-chip selected" onclick='TVSEPARATE.removeUniteCol(${JSON.stringify(col)})'>
        ${TV.escapeHtml(col)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function intoNames() {
    return (document.getElementById('separate-into')?.value || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
  }

  function updatePreview() {
    const prev = document.getElementById('separate-preview');
    if (!prev) return;
    const name = TV.rName(TV.state.name || 'DT');
    const sep = document.getElementById('sep-delim')?.value ?? '_';
    const remove = document.getElementById('sep-remove')?.checked ?? true;

    if (mode === 'separate') {
      const source = document.getElementById('separate-source')?.value || '';
      const into = intoNames();
      if (!source || !into.length) {
        prev.textContent = '# choose the source column and new output columns';
        return;
      }
      const lines = [
        `${name}[, c(${into.map(TV.rString).join(', ')}) := data.table::tstrsplit(as.character(${TV.rName(source)}), ${TV.rString(sep)}, fixed = TRUE, fill = NA_character_, keep = c(${into.map((_, i) => i + 1).join(', ')}))]`,
      ];
      if (remove) lines.push(`${name}[, ${TV.rName(source)} := NULL]`);
      prev.textContent = lines.join('\n');
      return;
    }

    const into = document.getElementById('unite-into')?.value?.trim() || '';
    if (!into || !uniteCols.length) {
      prev.textContent = '# choose the columns to combine and the output column name';
      return;
    }
    const lines = [
      `${name}[, ${TV.rName(into)} := do.call(paste, c(.SD, sep = ${TV.rString(sep)})), .SDcols = c(${uniteCols.map(TV.rString).join(', ')})]`,
    ];
    if (remove) lines.push(`${name}[, c(${uniteCols.map(TV.rString).join(', ')}) := NULL]`);
    prev.textContent = lines.join('\n');
  }

  async function apply() {
    const sep = document.getElementById('sep-delim')?.value ?? '_';
    const remove = document.getElementById('sep-remove')?.checked ?? true;
    try {
      let res;
      if (mode === 'separate') {
        const source = document.getElementById('separate-source')?.value || '';
        const into = intoNames();
        if (!source || !into.length) {
          await TV.showMessage('Choose the source column and at least one output column.', { title: 'Separate Incomplete' });
          return;
        }
        res = await TV.api('op_separate', { column: source, into, sep, remove });
      } else {
        const into = document.getElementById('unite-into')?.value?.trim() || '';
        if (!into || !uniteCols.length) {
          await TV.showMessage('Choose the columns to combine and the output column name.', { title: 'Unite Incomplete' });
          return;
        }
        res = await TV.api('op_unite', { columns: uniteCols, into, sep, remove });
      }
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError((mode === 'separate' ? 'Separate' : 'Unite') + ' error:\n' + e.message);
    }
  }

  return { init, setMode, addUniteCol, removeUniteCol, updatePreview, apply };
})();
