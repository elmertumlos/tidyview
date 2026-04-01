/* tidyview ops_rename_dedupe_export.js */
'use strict';

TV.panels = TV.panels || {};

/* rename / retype */

TV.panels.rename = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const rows = cols.map((c, idx) => `
    <tr id="ren-row-${idx}">
      <td style="padding:6px 10px;font:var(--tv-type-mono);font-size:12px">${TV.escapeHtml(c.name)}</td>
      <td style="padding:6px 8px"><span class="tv-type tv-type-${c.type}">${c.type}</span></td>
      <td style="padding:6px 8px">
        <input class="tv-input" id="ren-new-${idx}" value="${TV.escapeAttr(c.name)}"
          style="padding:5px 9px;font-size:12px;font-family:var(--tv-type-mono)"
          oninput="TVRENAME.updatePreview()">
      </td>
      <td style="padding:6px 8px">
        <select class="tv-select" id="retype-${idx}" style="padding:5px 8px;font-size:11px" onchange="TVRENAME.updatePreview()">
          ${['(keep)', 'int', 'dbl', 'chr', 'lgl', 'IDate', 'factor'].map(t =>
            `<option value="${t}" ${t === '(keep)' ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('');
  const colOpts = cols.map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)}</option>`).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6h12M4 10h8M4 14h5"/><path d="M14 12l2 2-2 2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">rename</div><div class="tv-panel-sub">rename_with + manual rename + optional type coercion</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>
    <div class="tv-panel-body">
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);margin-bottom:12px;background:var(--md-surface-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:8px;font-weight:500">rename_with</div>
        <div style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6;margin-bottom:10px">
          Bulk-rename the editable <code>new name</code> column, then fine-tune manually before applying.
        </div>
        <div class="tv-field" style="margin-top:0">
          <label class="tv-field-label">apply to</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="tv-chip selected" id="rename-scope-all" onclick="TVRENAME.setScope('all')">all columns</button>
            <button class="tv-chip" id="rename-scope-selected" onclick="TVRENAME.setScope('selected')">selected columns</button>
          </div>
        </div>
        <div class="tv-field" id="rename-scope-section" style="display:none">
          <div id="rename-scope-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
          <select class="tv-select" id="rename-scope-add" onchange="TVRENAME.addScopeCol(this.value);this.value=''">
            <option value="">add column...</option>${colOpts}
          </select>
        </div>
        <div class="tv-field">
          <label class="tv-field-label">transform</label>
          <select class="tv-select" id="rename-transform" onchange="TVRENAME.syncTransformUI();TVRENAME.updatePreview()">
            <option value="lower">lowercase</option>
            <option value="upper">UPPERCASE</option>
            <option value="trim">trim whitespace</option>
            <option value="snake">snake_case</option>
            <option value="prefix">add prefix</option>
            <option value="suffix">add suffix</option>
            <option value="replace">find and replace</option>
            <option value="replace_regex">regex find and replace</option>
          </select>
        </div>
        <div id="rename-prefix-field" class="tv-field" style="display:none">
          <label class="tv-field-label">prefix</label>
          <input class="tv-input" id="rename-prefix" placeholder="e.g. survey_" oninput="TVRENAME.updatePreview()">
        </div>
        <div id="rename-suffix-field" class="tv-field" style="display:none">
          <label class="tv-field-label">suffix</label>
          <input class="tv-input" id="rename-suffix" placeholder="e.g. _label" oninput="TVRENAME.updatePreview()">
        </div>
        <div id="rename-replace-fields" style="display:none">
          <div class="tv-field">
            <label class="tv-field-label" id="rename-pattern-label">find text</label>
            <input class="tv-input" id="rename-pattern" placeholder="e.g. ." oninput="TVRENAME.updatePreview()">
          </div>
          <div class="tv-field">
            <label class="tv-field-label">replace with</label>
            <input class="tv-input" id="rename-replacement" placeholder="e.g. _" oninput="TVRENAME.updatePreview()">
          </div>
          <div id="rename-regex-note" style="display:none;font-size:11px;color:var(--md-on-surface-variant);line-height:1.6">
            Use a JavaScript-style regular expression pattern, for example <code>\\.+</code> or <code>(^x_|_old$)</code>.
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-btn-outlined" type="button" onclick="TVRENAME.applyTransform()">apply to new names</button>
          <button class="tv-btn-outlined" type="button" onclick="TVRENAME.resetNames()">reset new names</button>
        </div>
      </div>

      <div style="overflow-x:auto;margin-bottom:12px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--md-surface-variant)">
            <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--md-on-surface-variant);font-weight:500">current name</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--md-on-surface-variant);font-weight:500">type</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--md-on-surface-variant);font-weight:500">new name</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--md-on-surface-variant);font-weight:500">retype to</th>
          </tr></thead>
          <tbody style="border:1px solid var(--md-outline-variant)">${rows}</tbody>
        </table>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="rename-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="rename-apply-btn">apply -></button>
    </div>`;

  document.getElementById('rename-apply-btn').addEventListener('click', TVRENAME.apply);
  TVRENAME.init(cols);
  TVRENAME.updatePreview();
};

const TVRENAME = (() => {
  let cols = [];
  let scope = 'all';
  let selectedCols = [];
  const TYPE_FN = {
    int: 'as.integer',
    dbl: 'as.numeric',
    chr: 'as.character',
    lgl: 'as.logical',
    IDate: 'data.table::as.IDate',
    factor: 'as.factor'
  };

  function init(_cols) {
    cols = _cols;
    scope = 'all';
    selectedCols = [];
    syncTransformUI();
    renderScopeChips();
  }

  function setScope(nextScope) {
    scope = nextScope;
    document.getElementById('rename-scope-all')?.classList.toggle('selected', scope === 'all');
    document.getElementById('rename-scope-selected')?.classList.toggle('selected', scope === 'selected');
    const scopeSection = document.getElementById('rename-scope-section');
    if (scopeSection) scopeSection.style.display = scope === 'selected' ? '' : 'none';
    updatePreview();
  }

  function addScopeCol(col) {
    if (!col || selectedCols.includes(col)) return;
    selectedCols.push(col);
    renderScopeChips();
    updatePreview();
  }

  function removeScopeCol(col) {
    selectedCols = selectedCols.filter(x => x !== col);
    renderScopeChips();
    updatePreview();
  }

  function renderScopeChips() {
    const el = document.getElementById('rename-scope-chips');
    if (!el) return;
    el.innerHTML = selectedCols.map(c => `
      <button class="tv-chip selected" onclick='TVRENAME.removeScopeCol(${JSON.stringify(c)})'>
        ${TV.escapeHtml(c)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function getTransform() {
    return document.getElementById('rename-transform')?.value || 'lower';
  }

  function getTargetCols() {
    return scope === 'selected' ? selectedCols.slice() : cols.map(c => c.name);
  }

  function syncTransformUI() {
    const transform = getTransform();
    const prefixField = document.getElementById('rename-prefix-field');
    const suffixField = document.getElementById('rename-suffix-field');
    const replaceFields = document.getElementById('rename-replace-fields');
    const regexNote = document.getElementById('rename-regex-note');
    const patternLabel = document.getElementById('rename-pattern-label');
    if (prefixField) prefixField.style.display = transform === 'prefix' ? '' : 'none';
    if (suffixField) suffixField.style.display = transform === 'suffix' ? '' : 'none';
    if (replaceFields) replaceFields.style.display = ['replace', 'replace_regex'].includes(transform) ? '' : 'none';
    if (regexNote) regexNote.style.display = transform === 'replace_regex' ? '' : 'none';
    if (patternLabel) patternLabel.textContent = transform === 'replace_regex' ? 'regex pattern' : 'find text';
  }

  function transformName(name) {
    const transform = getTransform();
    const prefix = document.getElementById('rename-prefix')?.value || '';
    const suffix = document.getElementById('rename-suffix')?.value || '';
    const pattern = document.getElementById('rename-pattern')?.value || '';
    const replacement = document.getElementById('rename-replacement')?.value || '';
    if (transform === 'lower') return String(name).toLowerCase();
    if (transform === 'upper') return String(name).toUpperCase();
    if (transform === 'trim') return String(name).trim();
    if (transform === 'snake') {
      return String(name)
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    }
    if (transform === 'prefix') return prefix + String(name);
    if (transform === 'suffix') return String(name) + suffix;
    if (transform === 'replace') return pattern ? String(name).split(pattern).join(replacement) : String(name);
    if (transform === 'replace_regex') {
      if (!pattern) return String(name);
      return String(name).replace(new RegExp(pattern, 'g'), replacement);
    }
    return String(name);
  }

  async function applyTransform() {
    const targets = getTargetCols();
    if (!targets.length) {
      await TV.showMessage('Choose at least one column for rename_with.', { title: 'No Columns Selected' });
      return;
    }
    const targetSet = new Set(targets);
    try {
      cols.forEach((c, idx) => {
        if (!targetSet.has(c.name)) return;
        const input = document.getElementById('ren-new-' + idx);
        if (!input) return;
        const baseName = input.value || c.name;
        input.value = transformName(baseName);
      });
    } catch (e) {
      await TV.showError('Invalid regular expression. Check the pattern and try again.');
      return;
    }
    updatePreview();
  }

  function resetNames() {
    cols.forEach((c, idx) => {
      const input = document.getElementById('ren-new-' + idx);
      if (input) input.value = c.name;
    });
    updatePreview();
  }

  function updatePreview() {
    const lines = [];
    const renames = cols
      .map((c, idx) => ({ old: c.name, new: document.getElementById('ren-new-' + idx)?.value || c.name }))
      .filter(r => r.old !== r.new);
    const targets = getTargetCols();
    if (targets.length) {
      lines.push(`# rename_with(${getTransform()}, ${scope === 'all' ? 'all columns' : targets.join(', ')})`);
    }
    if (renames.length) {
      const o = renames.map(r => TV.rString(r.old)).join(', ');
      const n = renames.map(r => TV.rString(r.new)).join(', ');
      lines.push(`data.table::setnames(${TV.rName(TV.state.name || 'DT')}, c(${o}), c(${n}))`);
    }
    cols.forEach((c, idx) => {
      const retype = document.getElementById('retype-' + idx)?.value;
      if (retype && retype !== '(keep)') {
        const newName = document.getElementById('ren-new-' + idx)?.value || c.name;
        lines.push(`${TV.rName(TV.state.name || 'DT')}[, ${TV.rName(newName)} := ${TYPE_FN[retype]}(${TV.rName(newName)})]`);
      }
    });
    const prev = document.getElementById('rename-preview');
    if (prev) prev.textContent = lines.length ? lines.join('\n') : '# no changes';
  }

  async function apply() {
    const old_names = [];
    const new_names = [];
    const types = {};
    cols.forEach((c, idx) => {
      const n = document.getElementById('ren-new-' + idx)?.value || c.name;
      if (n !== c.name) {
        old_names.push(c.name);
        new_names.push(n);
      }
      const targetType = document.getElementById('retype-' + idx)?.value;
      if (targetType && targetType !== '(keep)') {
        types[n] = targetType;
      }
    });
    if (!old_names.length && !Object.keys(types).length) {
      TV.closePanel();
      return;
    }
    try {
      const res = await TV.api('op_rename', { old: old_names, new: new_names, types });
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.ncol = res.ncol || TV.state.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Rename error: ' + e.message);
    }
  }

  return { init, setScope, addScopeCol, removeScopeCol, syncTransformUI, applyTransform, resetNames, updatePreview, apply };
})();

/* distinct */

TV.panels.dedupe = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const colOpts = cols.map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="11" height="14" rx="2"/>
          <rect x="6" y="6" width="11" height="14" rx="2" fill="var(--md-surface)"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">distinct</div><div class="tv-panel-sub">distinct(.data, ...)</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>
    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Keep distinct rows. Optionally restrict uniqueness to a subset of columns.
      </div>
      <div class="tv-field">
        <label class="tv-field-label">define uniqueness by (leave empty = all columns)</label>
        <div id="dedupe-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
        <select class="tv-select" id="dedupe-add" onchange="TVDEDUPE.addCol(this.value);this.value=''">
          <option value="">add column...</option>${colOpts}
        </select>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="dedupe-preview" style="font:var(--tv-type-mono);font-size:11px;color:var(--md-on-surface)">DT &lt;- unique(DT)</div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="dedupe-apply-btn">apply -></button>
    </div>`;

  document.getElementById('dedupe-apply-btn').addEventListener('click', TVDEDUPE.apply);
  TVDEDUPE.init();
};

const TVDEDUPE = (() => {
  let byCols = [];

  function init() {
    byCols = [];
  }

  function addCol(col) {
    if (!col || byCols.includes(col)) return;
    byCols.push(col);
    renderChips();
    updatePreview();
  }

  function removeCol(col) {
    byCols = byCols.filter(c => c !== col);
    renderChips();
    updatePreview();
  }

  function renderChips() {
    const el = document.getElementById('dedupe-chips');
    if (!el) return;
    el.innerHTML = byCols.map(c => `
      <button class="tv-chip selected" onclick='TVDEDUPE.removeCol(${JSON.stringify(c)})'>
        ${TV.escapeHtml(c)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function updatePreview() {
    const prev = document.getElementById('dedupe-preview');
    if (!prev) return;
    const name = TV.rName(TV.state.name || 'DT');
    prev.textContent = byCols.length
      ? `${name} <- unique(${name}, by = c(${byCols.map(c => TV.rString(c)).join(', ')}))`
      : `${name} <- unique(${name})`;
  }

  async function apply() {
    try {
      const res = await TV.api('op_dedupe', { by_cols: byCols });
      TV.pushCode(res.code);
      TV.state.nrow = res.nrow;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Dedupe error: ' + e.message);
    }
  }

  return { init, addCol, removeCol, updatePreview, apply };
})();

/* export */

TV.panels.export = function(pane) {
  const curName = TV.state.name || 'DT';

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10 4v9M7 10l3 3 3-3" stroke-linecap="round"/>
          <path d="M4 15h12" stroke-linecap="round"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">save / export</div><div class="tv-panel-sub">environment or file</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>
    <div class="tv-panel-body">
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:10px">save to R environment</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input class="tv-input" id="env-save-name" value="${curName}_out"
          style="font-family:var(--tv-type-mono);padding:7px 10px;font-size:12px;flex:1"
          oninput="TVEXPORT.updateEnvPreview()">
        <button class="tv-btn-filled" id="env-save-btn" style="white-space:nowrap">assign -></button>
      </div>
      <div style="padding:8px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);margin-bottom:18px">
        <div id="env-save-preview" style="font:var(--tv-type-mono);font-size:11px;color:var(--md-on-surface)"></div>
      </div>

      <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:10px">export to file</div>
      <div class="tv-field">
        <label class="tv-field-label">format</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="exp-csv" onclick="TVEXPORT.setFmt('csv')">CSV</button>
          <button class="tv-chip" id="exp-xlsx" onclick="TVEXPORT.setFmt('xlsx')">Excel (.xlsx)</button>
          <button class="tv-chip" id="exp-rds" onclick="TVEXPORT.setFmt('rds')">RDS</button>
          <button class="tv-chip" id="exp-sav" onclick="TVEXPORT.setFmt('sav')">SPSS (.sav)</button>
          <button class="tv-chip" id="exp-dta" onclick="TVEXPORT.setFmt('dta')">Stata (.dta)</button>
        </div>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">filename</label>
        <input class="tv-input" id="exp-filename" value="${curName}.csv"
          style="font-family:var(--tv-type-mono);padding:7px 10px;font-size:12px"
          oninput="TVEXPORT.updateFilePreview()">
      </div>
      <div style="padding:8px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);margin-bottom:10px">
        <div id="export-preview" style="font:var(--tv-type-mono);font-size:11px;color:var(--md-on-surface)"></div>
      </div>
      <div style="padding:8px 12px;background:var(--md-surface-variant);border-radius:var(--tv-radius-sm);font-size:11px;color:var(--md-on-surface-variant)">
        File saved to working directory (<code style="font-size:10px">getwd()</code>).
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="export-apply-btn">export -></button>
    </div>`;

  document.getElementById('env-save-btn').addEventListener('click', TVEXPORT.saveToEnv);
  document.getElementById('export-apply-btn').addEventListener('click', TVEXPORT.applyFile);
  TVEXPORT.init(curName);
};

const TVEXPORT = (() => {
  let fmt = 'csv';
  let baseName = 'DT';

  function init(name) {
    fmt = 'csv';
    baseName = name;
    updateEnvPreview();
    updateFilePreview();
  }

  function updateEnvPreview() {
    const nm = document.getElementById('env-save-name')?.value || baseName + '_out';
    const prev = document.getElementById('env-save-preview');
    if (prev) prev.textContent = `${nm} <- data.table::copy(${baseName})`;
  }

  function setFmt(f) {
    fmt = f;
    ['csv', 'xlsx', 'rds', 'sav', 'dta'].forEach(x =>
      document.getElementById('exp-' + x)?.classList.toggle('selected', x === f));
    const fn = document.getElementById('exp-filename');
    if (fn) fn.value = fn.value.replace(/\.\w+$/, '.' + f);
    updateFilePreview();
  }

  function updateFilePreview() {
    const fn = document.getElementById('exp-filename')?.value || baseName + '.' + fmt;
    const prev = document.getElementById('export-preview');
    if (!prev) return;
    const code = {
      csv: `data.table::fwrite(${baseName}, "${fn}")`,
      xlsx: `writexl::write_xlsx(as.data.frame(${baseName}), "${fn}")`,
      rds: `saveRDS(${baseName}, "${fn}")`,
      sav: `haven::write_sav(as.data.frame(${baseName}), "${fn}")`,
      dta: `haven::write_dta(as.data.frame(${baseName}), "${fn}")`,
    };
    prev.textContent = code[fmt] || '';
  }

  async function saveToEnv() {
    const nm = document.getElementById('env-save-name')?.value?.trim();
    if (!nm) return;
    try {
      const res = await TV.api('save_to_env', { name: nm });
      TV.pushCode(res.code);
      await TV.refreshEnvCache().catch(() => {});
      await TV.showMessage(`Saved as '${res.name}' in your R environment.`, { title: 'Saved' });
    } catch (e) {
      await TV.showError('Error: ' + e.message);
    }
  }

  async function applyFile() {
    const path = document.getElementById('exp-filename')?.value || baseName + '.' + fmt;
    try {
      const res = await TV.api('export', { format: fmt, path });
      TV.pushCode(res.code);
      await TV.showMessage(`Exported to: ${res.path}`, { title: 'Export Complete' });
      TV.closePanel();
    } catch (e) {
      await TV.showError('Export error: ' + e.message);
    }
  }

  return { init, setFmt, updateEnvPreview, updateFilePreview, saveToEnv, applyFile };
})();
