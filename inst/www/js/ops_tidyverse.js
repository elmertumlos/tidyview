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
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Choose the columns you want to reposition without changing their values.
        </div>
        <div id="relocate-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
        <select class="tv-select" id="relocate-add" onchange="TVRELOCATE.addCol(this.value);this.value=''">
          <option value="">add column...</option>${options}
        </select>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">position</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Move the selected columns to the front, or place them before or after one anchor column.
        </div>
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
        <div><div class="tv-panel-title">drop_na</div><div class="tv-panel-sub">remove rows that contain missing values</div></div>
        <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
      </div>
      <div class="tv-panel-body">
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
          Leave the selection empty to check every column in the table, or choose specific columns if only some fields should be required.
        </div>
        <div class="tv-field">
          <label class="tv-field-label">which columns should be checked?</label>
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
            Leave this empty to require complete rows, or choose only the columns that must be filled in.
          </div>
          <div id="dropna-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
          <select class="tv-select" id="dropna-add" onchange="TVDROPNA.addCol(this.value);this.value=''">
            <option value="">add column...</option>${options}
          </select>
        </div>
        <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant)">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">What This Will Do</div>
          <div id="dropna-target-summary" style="font-size:12px;color:var(--md-on-surface);margin-bottom:6px">Result: rows with missing values in the checked columns will be removed.</div>
          <div id="dropna-friendly-summary" style="font-size:11px;color:var(--md-on-surface);line-height:1.6;margin-bottom:10px">Choose whether to check the whole table or only specific columns.</div>
          <div id="dropna-impact" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px">
            Previewing impact...
          </div>
          <div id="dropna-warning" style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6;margin-bottom:10px">
            Rows with missing values in the checked columns will be removed from the current table.
          </div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">Generated R</div>
          <div id="dropna-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
        </div>
      </div>
      <div class="tv-panel-footer">
        <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
        <button class="tv-btn-filled" id="dropna-apply-btn">apply changes -></button>
      </div>`;

  document.getElementById('dropna-apply-btn').addEventListener('click', TVDROPNA.apply);
  TVDROPNA.init();
};

  const TVDROPNA = (() => {
    let cols = [];
    let previewSeq = 0;
    let latestPreview = null;

    function activeColumnMeta() {
      return Array.isArray(window.__TV_COLS__) ? window.__TV_COLS__ : [];
    }

    function checkColumns() {
      return cols.length ? cols.slice() : activeColumnMeta().map(col => col.name);
    }

    function needsListSafeDropNa() {
      const wanted = new Set(checkColumns());
      return activeColumnMeta().some(col => wanted.has(col.name) && col.type === 'list');
    }

    function buildDropNaPreviewCode(name) {
      if (!needsListSafeDropNa()) {
        return cols.length
          ? `${name} <- ${name}[stats::complete.cases(${name}[, .(${cols.map(TV.rName).join(', ')})])]`
          : `${name} <- ${name}[stats::complete.cases(${name})]`;
      }
      const checkCols = checkColumns();
      return [
        `..tv_missing_cell <- function(cell) {`,
        `  if (is.null(cell) || length(cell) == 0L) return(TRUE)`,
        `  if (is.list(cell)) {`,
        `    if (!length(cell)) return(TRUE)`,
        `    return(all(vapply(cell, ..tv_missing_cell, logical(1))))`,
        `  }`,
        `  all(is.na(cell))`,
        `}`,
        `..tv_cols <- c(${checkCols.map(TV.rString).join(', ')})`,
        `..tv_keep <- vapply(seq_len(nrow(${name})), function(i) {`,
        `  all(vapply(..tv_cols, function(col) !..tv_missing_cell(${name}[[col]][[i]]), logical(1)))`,
        `}, logical(1))`,
        `${name} <- ${name}[..tv_keep]`,
        `rm(..tv_cols, ..tv_keep, ..tv_missing_cell)`,
      ].join('\n');
    }

    function init() {
      const context = TV.consumePanelContext ? TV.consumePanelContext() : null;
      cols = Array.isArray(context?.columns) ? context.columns.slice() : [];
      previewSeq = 0;
      latestPreview = null;
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
      const warning = document.getElementById('dropna-warning');
      const targetSummary = document.getElementById('dropna-target-summary');
      const friendlySummary = document.getElementById('dropna-friendly-summary');
      if (!prev) return;
      const name = TV.rName(TV.state.name || 'DT');
      prev.textContent = buildDropNaPreviewCode(name);
      if (targetSummary) {
        targetSummary.textContent = cols.length
          ? `Result: remove rows with missing values in ${cols.join(', ')}.`
          : 'Result: remove rows with missing values anywhere in the table.';
      }
      if (friendlySummary) {
        friendlySummary.textContent = cols.length
          ? `Only ${cols.join(', ')} will be checked. Rows stay if those selected columns are filled in, even when other columns still contain missing values.`
          : 'Every column in the table will be checked. A row stays only if the whole row is complete.';
      }
      if (warning) {
        warning.textContent = cols.length
          ? `Only the selected columns are checked for missing values: ${cols.join(', ')}.`
          : 'Every column in the table will be checked for missing values.';
    }
    if (!impact) return;
    const seq = ++previewSeq;
    impact.textContent = 'Previewing impact...';
    TV.api('preview_op', { op: 'drop_na', params: { columns: cols } })
      .then(res => {
        if (seq !== previewSeq) return;
        latestPreview = res;
        impact.textContent = TV.formatImpactSummary(res, 'drop_na');
          if (warning) {
            const beforeRows = Number(res?.before_nrow || 0);
            const afterRows = Number(res?.after_nrow || 0);
            const removedRows = Math.max(0, beforeRows - afterRows);
            const scopeText = cols.length
            ? `Only the selected columns are checked: ${cols.join(', ')}.`
            : 'Every column in the table is checked.';
          warning.textContent = removedRows > 0
            ? `${scopeText} ${removedRows.toLocaleString()} row${removedRows === 1 ? '' : 's'} would be removed.`
            : `${scopeText} No rows would be removed.`;
        }
      })
      .catch(e => {
        if (seq !== previewSeq) return;
        latestPreview = null;
        impact.textContent = e.message;
      });
  }

  async function apply() {
    const preview = latestPreview;
    const beforeRows = Number(preview?.before_nrow || 0);
    const afterRows = Number(preview?.after_nrow || 0);
    const removedRows = Math.max(0, beforeRows - afterRows);
    if (removedRows > 0) {
      const ok = await TV.confirmMessage(
        `This will remove ${removedRows.toLocaleString()} row${removedRows === 1 ? '' : 's'} from the current table. Continue?`,
        { title: 'Review Drop NA Impact', confirmLabel: 'apply' }
      );
      if (!ok) return;
    }
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
      <div><div class="tv-panel-title">separate / unite</div><div class="tv-panel-sub">split one column into parts or combine several columns into one</div></div>
        <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
      </div>
      <div class="tv-panel-body">
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
          Use separate to break one column into smaller pieces, or unite to join several columns into one result column.
        </div>
        <div class="tv-field">
          <label class="tv-field-label">what do you want to do?</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="tv-chip selected" id="sep-mode-separate" onclick="TVSEPARATE.setMode('separate')">split one column</button>
            <button class="tv-chip" id="sep-mode-unite" onclick="TVSEPARATE.setMode('unite')">combine columns</button>
          </div>
        </div>

        <div id="separate-fields">
          <div class="tv-field">
            <label class="tv-field-label">source column to split</label>
            <select class="tv-select" id="separate-source" onchange="TVSEPARATE.updatePreview()">
              <option value="">choose column...</option>${options}
            </select>
          </div>
          <div class="tv-field">
            <label class="tv-field-label">new columns to create</label>
            <input class="tv-input" id="separate-into" placeholder="e.g. province, city, barangay" oninput="TVSEPARATE.updatePreview()">
            <div style="font-size:11px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.5">
              Type the new column names separated by commas, in the order the pieces should appear.
            </div>
          </div>
        </div>

        <div id="unite-fields" style="display:none">
          <div class="tv-field">
            <label class="tv-field-label">source columns to combine</label>
            <div id="unite-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
            <select class="tv-select" id="unite-add" onchange="TVSEPARATE.addUniteCol(this.value);this.value=''">
              <option value="">add column...</option>${options}
            </select>
          </div>
          <div class="tv-field">
            <label class="tv-field-label">result column name</label>
            <input class="tv-input" id="unite-into" placeholder="e.g. full_name" oninput="TVSEPARATE.updatePreview()">
          </div>
        </div>

        <div class="tv-field">
          <label class="tv-field-label">separator text</label>
          <input class="tv-input" id="sep-delim" value="_" oninput="TVSEPARATE.updatePreview()">
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.5">
            This is the character or text tidyview uses to split values apart or join them together.
          </div>
        </div>
        <div class="tv-field" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="sep-remove" checked onchange="TVSEPARATE.updatePreview()">
          <label for="sep-remove" style="font-size:12px;cursor:pointer">remove the original source column(s) after this step</label>
        </div>

        <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant)">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">What This Will Do</div>
          <div id="separate-target-summary" style="font-size:12px;color:var(--md-on-surface);margin-bottom:6px">Choose a mode and the columns you want to use.</div>
          <div id="separate-friendly-summary" style="font-size:11px;color:var(--md-on-surface);line-height:1.6;margin-bottom:10px">tidyview will describe the split or combine step here before you apply it.</div>
          <div id="separate-impact" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px">
            Previewing impact...
          </div>
          <div id="separate-warning" style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6;margin-bottom:10px">
            Review how many columns will be added or removed before applying this step.
          </div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">Generated R</div>
          <div id="separate-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
        </div>
      </div>
      <div class="tv-panel-footer">
        <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
        <button class="tv-btn-filled" id="separate-apply-btn">apply changes -></button>
      </div>`;

  document.getElementById('separate-apply-btn').addEventListener('click', TVSEPARATE.apply);
  TVSEPARATE.init();
};

  const TVSEPARATE = (() => {
    let mode = 'separate';
    let uniteCols = [];
    let previewSeq = 0;
    let latestPreview = null;

    function splitIntoNames() {
      return document.getElementById('separate-into')?.value
        .split(',')
        .map(x => x.trim())
        .filter(Boolean) || [];
    }

    function separateParams() {
      const sep = document.getElementById('sep-delim')?.value ?? '_';
      const remove = document.getElementById('sep-remove')?.checked ?? true;
      if (mode === 'separate') {
        return {
          op: 'separate',
          params: {
            column: document.getElementById('separate-source')?.value || '',
            into: splitIntoNames(),
            sep,
            remove,
          },
        };
      }
      return {
        op: 'unite',
        params: {
          columns: uniteCols.slice(),
          into: document.getElementById('unite-into')?.value?.trim() || '',
          sep,
          remove,
        },
      };
    }

    function init() {
      mode = 'separate';
      uniteCols = [];
      previewSeq = 0;
      latestPreview = null;
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
      const targetSummary = document.getElementById('separate-target-summary');
      const friendlySummary = document.getElementById('separate-friendly-summary');
      const impact = document.getElementById('separate-impact');
      const warning = document.getElementById('separate-warning');
      if (!prev) return;
      const name = TV.rName(TV.state.name || 'DT');
      const sep = document.getElementById('sep-delim')?.value ?? '_';
      const remove = document.getElementById('sep-remove')?.checked ?? true;

      if (mode === 'separate') {
        const source = document.getElementById('separate-source')?.value || '';
        const into = splitIntoNames();
        if (!source || !into.length) {
          if (targetSummary) targetSummary.textContent = 'Choose a source column and one or more new columns to create.';
          if (friendlySummary) friendlySummary.textContent = 'Use this when one column contains several pieces of information, such as "City, Province" or "First Last".';
          if (impact) impact.textContent = 'Preview will appear after you choose the source column and output columns.';
          if (warning) warning.textContent = 'Review how many columns will be added or removed before applying this step.';
          prev.textContent = '# choose the source column and new output columns';
          return;
        }
        const lines = [
          `${name}[, c(${into.map(TV.rString).join(', ')}) := data.table::tstrsplit(as.character(${TV.rName(source)}), ${TV.rString(sep)}, fixed = TRUE, fill = NA_character_, keep = c(${into.map((_, i) => i + 1).join(', ')}))]`,
        ];
        if (remove) lines.push(`${name}[, ${TV.rName(source)} := NULL]`);
        if (targetSummary) {
          targetSummary.textContent = `Result: split "${source}" into ${into.join(', ')}.`;
        }
        if (friendlySummary) {
          friendlySummary.textContent = remove
            ? `This will split "${source}" wherever "${sep}" appears, create ${into.join(', ')}, and remove the original source column.`
            : `This will split "${source}" wherever "${sep}" appears and create ${into.join(', ')} while keeping the original source column.`;
        }
        prev.textContent = lines.join('\n');
      } else {
        const into = document.getElementById('unite-into')?.value?.trim() || '';
        if (!into || !uniteCols.length) {
          if (targetSummary) targetSummary.textContent = 'Choose one or more source columns and a result column name.';
          if (friendlySummary) friendlySummary.textContent = 'Use this when the pieces you want are spread across several columns and should become one combined value.';
          if (impact) impact.textContent = 'Preview will appear after you choose the source columns and result column.';
          if (warning) warning.textContent = 'Review how many columns will be added or removed before applying this step.';
          prev.textContent = '# choose the columns to combine and the output column name';
          return;
        }
        const lines = [
          `${name}[, ${TV.rName(into)} := do.call(paste, c(.SD, sep = ${TV.rString(sep)})), .SDcols = c(${uniteCols.map(TV.rString).join(', ')})]`,
        ];
        if (remove) lines.push(`${name}[, c(${uniteCols.map(TV.rString).join(', ')}) := NULL]`);
        if (targetSummary) {
          targetSummary.textContent = `Result: combine ${uniteCols.join(', ')} into "${into}".`;
        }
        if (friendlySummary) {
          friendlySummary.textContent = remove
            ? `This will join ${uniteCols.join(', ')} using "${sep}", save the result in "${into}", and remove the original source columns.`
            : `This will join ${uniteCols.join(', ')} using "${sep}" and save the result in "${into}" while keeping the original source columns.`;
        }
        prev.textContent = lines.join('\n');
      }

      if (!impact) return;
      const payload = separateParams();
      const isReady = mode === 'separate'
        ? Boolean(payload.params.column && payload.params.into.length)
        : Boolean(payload.params.into && payload.params.columns.length);
      if (!isReady) return;

      const seq = ++previewSeq;
      impact.textContent = 'Previewing impact...';
      TV.api('preview_op', payload)
        .then(res => {
          if (seq !== previewSeq) return;
          latestPreview = res;
          const addedCols = Math.max(0, Number(res?.after_ncol || 0) - Number(res?.before_ncol || 0));
          const removedCols = Math.max(0, Number(res?.before_ncol || 0) - Number(res?.after_ncol || 0));
          impact.textContent = TV.formatImpactSummary(res);
          if (warning) {
            if (mode === 'separate') {
              warning.textContent = remove
                ? `This will add ${addedCols.toLocaleString()} new column${addedCols === 1 ? '' : 's'} and remove the original source column. Row count will stay the same.`
                : `This will add ${addedCols.toLocaleString()} new column${addedCols === 1 ? '' : 's'} while keeping the original source column. Row count will stay the same.`;
            } else {
              warning.textContent = remove
                ? `This will create "${payload.params.into}" and remove ${payload.params.columns.length.toLocaleString()} source column${payload.params.columns.length === 1 ? '' : 's'}. Net column change: ${removedCols.toLocaleString()} fewer column${removedCols === 1 ? '' : 's'}.`
                : `This will create "${payload.params.into}" while keeping the original source columns. Row count will stay the same.`;
            }
          }
        })
        .catch(e => {
          if (seq !== previewSeq) return;
          latestPreview = null;
          impact.textContent = e.message;
        });
    }

  async function apply() {
      const sep = document.getElementById('sep-delim')?.value ?? '_';
      const remove = document.getElementById('sep-remove')?.checked ?? true;
      const preview = latestPreview;
    try {
      let res;
      if (mode === 'separate') {
        const source = document.getElementById('separate-source')?.value || '';
        const into = intoNames();
        if (!source || !into.length) {
          await TV.showMessage('Choose the source column and at least one output column.', { title: 'Separate Incomplete' });
          return;
        }
        const addedCols = Math.max(0, Number(preview?.after_ncol || 0) - Number(preview?.before_ncol || 0));
        if (addedCols > 0 || remove) {
          const ok = await TV.confirmMessage(
            remove
              ? `This will create ${addedCols.toLocaleString()} new column${addedCols === 1 ? '' : 's'} and remove "${source}". Continue?`
              : `This will create ${addedCols.toLocaleString()} new column${addedCols === 1 ? '' : 's'} from "${source}". Continue?`,
            { title: 'Review Separate Impact', confirmLabel: 'apply' }
          );
          if (!ok) return;
        }
        res = await TV.api('op_separate', { column: source, into, sep, remove });
      } else {
        const into = document.getElementById('unite-into')?.value?.trim() || '';
        if (!into || !uniteCols.length) {
          await TV.showMessage('Choose the columns to combine and the output column name.', { title: 'Unite Incomplete' });
          return;
        }
        const removeCount = remove ? uniteCols.length : 0;
        const ok = await TV.confirmMessage(
          remove
            ? `This will create "${into}" and remove ${removeCount.toLocaleString()} source column${removeCount === 1 ? '' : 's'}. Continue?`
            : `This will create "${into}" from ${uniteCols.length.toLocaleString()} source column${uniteCols.length === 1 ? '' : 's'}. Continue?`,
          { title: 'Review Unite Impact', confirmLabel: 'apply' }
        );
        if (!ok) return;
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
