/* tidyview ops_rename_dedupe_export.js */
'use strict';

TV.panels = TV.panels || {};

/* rename / retype */

TV.panels.rename = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const rows = cols.map((c, idx) => `
    <div id="ren-row-${idx}" style="border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);padding:10px 12px;background:var(--md-surface);display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="min-width:0">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);font-weight:500;margin-bottom:4px">current name</div>
          <div style="font:var(--tv-type-mono);font-size:12px;word-break:break-word">${TV.escapeHtml(c.name)}</div>
        </div>
        <span class="tv-type tv-type-${c.type}" style="flex-shrink:0">${c.type}</span>
      </div>
      <div class="tv-field" style="margin-top:0">
        <label class="tv-field-label">new name</label>
        <input class="tv-input" id="ren-new-${idx}" value="${TV.escapeAttr(c.name)}"
          style="padding:5px 9px;font-size:12px;font-family:var(--tv-type-mono)"
          oninput="TVRENAME.updatePreview()">
      </div>
      <div class="tv-field" style="margin-top:0">
        <label class="tv-field-label">retype to</label>
        <select class="tv-select" id="retype-${idx}" style="padding:5px 8px;font-size:11px" onchange="TVRENAME.updatePreview()">
          ${['(keep)', 'int', 'dbl', 'chr', 'lgl', 'IDate', 'factor'].map(t =>
            `<option value="${t}" ${t === '(keep)' ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>`).join('');
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
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Rename columns in bulk, then fine-tune individual names and optional type changes before applying.
      </div>
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
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
            Apply a bulk naming pattern first, then edit any exceptions directly in the table below.
          </div>
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

      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.6">
        Edit the <code>new name</code> field directly below each column, then optionally change its output type.
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
        ${rows}
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
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Leave this empty to keep only fully distinct rows, or choose columns to keep one row per unique combination.
        </div>
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
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
        Save the current table under a new object name without writing a file to disk.
      </div>
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
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Choose the format based on where the data will be used next, such as spreadsheets, R, or other stats software.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="exp-csv" onclick="TVEXPORT.setFmt('csv')">CSV</button>
          <button class="tv-chip" id="exp-xlsx" onclick="TVEXPORT.setFmt('xlsx')">Excel (.xlsx)</button>
          <button class="tv-chip" id="exp-rds" onclick="TVEXPORT.setFmt('rds')">RDS</button>
          <button class="tv-chip" id="exp-sav" onclick="TVEXPORT.setFmt('sav')">SPSS (.sav)</button>
          <button class="tv-chip" id="exp-dta" onclick="TVEXPORT.setFmt('dta')">Stata (.dta)</button>
        </div>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">folder</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Choose where the file should be written. Use the folder picker or enter a path manually.
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <input class="tv-input" id="exp-folder" placeholder="current working directory"
            style="font-family:var(--tv-type-mono);padding:7px 10px;font-size:12px;flex:1;min-width:220px"
            oninput="TVEXPORT.updateFilePreview()">
          <button class="tv-btn-outlined" type="button" onclick="TVEXPORT.chooseFolder()">choose folder...</button>
          <button class="tv-btn-outlined" type="button" onclick="TVEXPORT.useWorkingDir()">use current folder</button>
        </div>
        <div style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.5">
          <span style="font-weight:500">Note:</span> This opens a native folder dialog, which may appear in RStudio or behind Chrome.
        </div>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">filename</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          This is the file name only. The selected folder above controls where it will be saved.
        </div>
        <input class="tv-input" id="exp-filename" value="${curName}.csv"
          style="font-family:var(--tv-type-mono);padding:7px 10px;font-size:12px"
          oninput="TVEXPORT.updateFilePreview()">
      </div>
      <div style="padding:8px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);margin-bottom:10px">
        <div id="export-preview" style="font:var(--tv-type-mono);font-size:11px;color:var(--md-on-surface)"></div>
      </div>
      <div id="export-file-info" style="padding:8px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);margin-bottom:10px;font-size:11px;line-height:1.6;color:var(--md-on-surface)"></div>
      <div style="padding:8px 12px;background:var(--md-surface-variant);border-radius:var(--tv-radius-sm);font-size:11px;color:var(--md-on-surface-variant)">
        If you leave the folder blank, tidyview uses the current working directory (<code style="font-size:10px">getwd()</code>). Choose a folder above when you want the file saved somewhere else.
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
  let previewSeq = 0;
  let latestPreview = null;
  let workingDir = '';

  function scalarValue(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      const first = value.find(v => v != null && v !== '');
      return first == null ? '' : String(first);
    }
    if (typeof value === 'object') {
      const vals = Object.values(value).filter(v => v != null && v !== '');
      return vals.length ? String(vals[0]) : '';
    }
    return '';
  }

  function init(name) {
    fmt = 'csv';
    baseName = name;
    previewSeq = 0;
    latestPreview = null;
    workingDir = '';
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

  function sanitizeFilename(value) {
    const raw = String(value || '').trim();
    if (!raw) return `${baseName}.${fmt}`;
    return raw.replace(/^.*[\\/]/, '') || `${baseName}.${fmt}`;
  }

  function buildExportPath() {
    const folder = String(document.getElementById('exp-folder')?.value || '').trim();
    const filename = sanitizeFilename(document.getElementById('exp-filename')?.value);
    if (!folder) return filename;
    return folder.replace(/[\\/]+$/, '') + '/' + filename;
  }

  async function updateFilePreview() {
    const fileInput = document.getElementById('exp-filename');
    const path = buildExportPath();
    const prev = document.getElementById('export-preview');
    const info = document.getElementById('export-file-info');
    if (fileInput) {
      const cleaned = sanitizeFilename(fileInput.value);
      if (fileInput.value !== cleaned) fileInput.value = cleaned;
    }
    if (prev) prev.textContent = 'Preparing export preview...';
    if (info) info.innerHTML = '<span style="color:var(--md-on-surface-variant)">Checking destination, overwrite risk, and package support...</span>';
    const seq = ++previewSeq;
    try {
      const res = await TV.api('export_preview', { format: fmt, path });
      if (seq !== previewSeq) return;
      latestPreview = res;
       workingDir = scalarValue(res.working_dir) || workingDir;
      if (prev) prev.textContent = res.code || '';
      if (info) {
        const pkgName = scalarValue(res.package_needed);
        const folderInput = String(document.getElementById('exp-folder')?.value || '').trim();
        const lines = [];
        lines.push(`<div><strong>Resolved path:</strong> <code style="font-size:10px">${TV.escapeHtml(res.path || path)}</code></div>`);
        lines.push(`<div><strong>Folder:</strong> ${TV.escapeHtml(folderInput || scalarValue(res.dir) || workingDir || '(current working directory)')}</div>`);
        if (!res.dir_exists) {
          lines.push('<div style="color:var(--md-error)">The destination folder does not exist yet.</div>');
        } else if (res.exists) {
          lines.push('<div style="color:var(--md-error)">A file already exists at this path. Exporting will overwrite it if you continue.</div>');
        } else {
          lines.push('<div>This path is available and will create a new file.</div>');
        }
        if (pkgName) {
          lines.push(res.package_ok
            ? `<div>${TV.escapeHtml(pkgName)} is available for this format.</div>`
            : `<div style="color:var(--md-error)">This format needs the <code style="font-size:10px">${TV.escapeHtml(pkgName)}</code> package, which is not available in this R session.</div>`);
        }
        info.innerHTML = lines.join('');
      }
    } catch (e) {
      if (seq !== previewSeq) return;
      latestPreview = null;
      if (prev) prev.textContent = '# export preview unavailable';
      if (info) info.innerHTML = `<span style="color:var(--md-error)">${TV.escapeHtml(e.message)}</span>`;
    }
  }

  async function chooseFolder() {
    const startDir = String(document.getElementById('exp-folder')?.value || workingDir || '').trim();
    const info = document.getElementById('export-file-info');
    if (info) {
      info.innerHTML = '<span style="color:var(--md-on-surface-variant)">Waiting for the folder chooser. The dialog may appear in RStudio or behind Chrome, so check other windows before typing the path manually.</span>';
    }
    try {
      const res = await TV.api('choose_export_folder', { start_dir: startDir || null });
      if (!res.cancelled && res.path) {
        const input = document.getElementById('exp-folder');
        if (input) input.value = res.path || '';
        updateFilePreview();
      } else {
        if (info) {
          info.innerHTML = '<span style="color:var(--md-on-surface-variant)">No folder was selected. The dialog may have opened outside Chrome or RStudio focus. You can try again, type the path manually, or use the current folder.</span>';
        }
        if (typeof TV.showToast === 'function') {
          TV.showToast('No folder selected. Check RStudio or other windows for the dialog next time.');
        }
      }
    } catch (e) {
      await TV.showError('Folder selection error: ' + e.message);
    }
  }

  function useWorkingDir() {
    const input = document.getElementById('exp-folder');
    if (input) input.value = workingDir || '';
    updateFilePreview();
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
    const path = buildExportPath();
    try {
      const preview = latestPreview || await TV.api('export_preview', { format: fmt, path });
      if (preview.exists) {
        const ok = await TV.confirmMessage(
          `A file already exists at:\n${preview.path}\n\nOverwrite it?`,
          { title: 'Overwrite Existing File?', confirmLabel: 'overwrite' }
        );
        if (!ok) return;
      }
      const res = await TV.api('export', { format: fmt, path, overwrite: !!preview.exists });
      TV.pushCode(res.code);
      await TV.showMessage(`Exported to: ${res.path}`, { title: 'Export Complete' });
      TV.closePanel();
    } catch (e) {
      await TV.showError('Export error: ' + e.message);
    }
  }

  return { init, setFmt, updateEnvPreview, updateFilePreview, chooseFolder, useWorkingDir, saveToEnv, applyFile };
})();
