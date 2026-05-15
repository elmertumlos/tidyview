/* tidyview ops_reshape.js - pivot long / wide panel */
'use strict';

TV.panels.reshape = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const allOpts = cols.map(col =>
    `<option value="${TV.escapeAttr(col.name)}">${TV.escapeHtml(col.name)} (${TV.escapeHtml(col.type)})</option>`
  ).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 10h12M13 7l3 3-3 3M7 7L4 10l3 3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">pivot</div>
        <div class="tv-panel-sub">pivot_longer() and pivot_wider()</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Use <code>pivot_longer</code> to stack repeated columns into rows, or <code>pivot_wider</code> to spread key values back into columns.
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="tv-chip selected" id="dir-longer" onclick="TVRESHAPE.setDir('longer')">pivot_longer</button>
        <button class="tv-chip" id="dir-wider" onclick="TVRESHAPE.setDir('wider')">pivot_wider</button>
      </div>

      <div id="reshape-longer">
        <div class="tv-field">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <label class="tv-field-label" style="margin:0">id columns (keep as-is)</label>
            <button class="tv-btn-outlined" type="button" style="padding:6px 12px" onclick="TVRESHAPE.applySuggestedLonger()">reset to suggested split</button>
          </div>
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
            These columns stay attached to each row after the selected measure columns are stacked.
          </div>
          <div id="reshape-suggestion-note" style="font-size:11px;color:var(--md-primary);margin-bottom:8px;line-height:1.5"></div>
          <div id="id-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
          <select class="tv-select" id="id-add" onchange="TVRESHAPE.addId(this.value);this.value=''">
            <option value="">add id column...</option>${allOpts}
          </select>
        </div>

        <div class="tv-field">
          <label class="tv-field-label">measure columns (pivot these)</label>
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
            These are the repeated columns that will be turned into a variable column and a value column.
          </div>
          <div id="msr-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
          <select class="tv-select" id="msr-add" onchange="TVRESHAPE.addMsr(this.value);this.value=''">
            <option value="">add measure column...</option>${allOpts}
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="tv-field">
            <label class="tv-field-label">variable column name</label>
            <input class="tv-input" id="var-name" value="variable" style="font-family:var(--tv-type-mono);padding:7px 10px;font-size:12px" oninput="TVRESHAPE.updatePreview()">
          </div>
          <div class="tv-field">
            <label class="tv-field-label">value column name</label>
            <input class="tv-input" id="val-name" value="value" style="font-family:var(--tv-type-mono);padding:7px 10px;font-size:12px" oninput="TVRESHAPE.updatePreview()">
          </div>
        </div>
      </div>

      <div id="reshape-wider" style="display:none">
        <div class="tv-field">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <label class="tv-field-label" style="margin:0">row formula (lhs ~ rhs)</label>
            <button class="tv-btn-outlined" type="button" style="padding:6px 12px" onclick="TVRESHAPE.applySuggestedWider()">reset to suggested formula</button>
          </div>
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
            Put the row identifiers on the left and the column-creating values on the right, for example <code>region ~ variable</code>.
          </div>
          <div id="reshape-wider-note" style="font-size:11px;color:var(--md-primary);margin-bottom:8px;line-height:1.5"></div>
          <input class="tv-input" id="dcast-formula" placeholder="e.g. region ~ variable" style="font-family:var(--tv-type-mono);padding:7px 10px;font-size:12px" oninput="TVRESHAPE.updatePreview()">
        </div>
        <div class="tv-field">
          <label class="tv-field-label">value column</label>
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
            Choose the column whose values should be placed into the widened cells.
          </div>
          <select class="tv-select" id="dcast-val" onchange="TVRESHAPE.updatePreview()">
            <option value="">choose value column...</option>${allOpts}
          </select>
        </div>
      </div>

      <div style="margin-top:8px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">What This Will Do</div>
        <div id="reshape-source-summary" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:6px">Choose a pivot direction and the columns involved.</div>
        <div id="reshape-target-summary" style="font-size:12px;color:var(--md-on-surface);margin-bottom:6px">Result columns: preview the expected structure here.</div>
        <div id="reshape-impact" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px">Previewing impact...</div>
        <div id="reshape-warning" style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6;margin-bottom:8px">Choose the columns that define rows versus the columns that should be stacked or spread.</div>
        <div id="reshape-columns" style="font-size:11px;color:var(--md-on-surface);line-height:1.6;margin-bottom:10px">Resulting columns: preview unavailable until the setup is complete.</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">Generated R</div>
        <div id="reshape-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"><span style="color:var(--md-on-surface-variant);font-style:italic">configure above...</span></div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="reshape-apply-btn">apply -></button>
    </div>`;

  document.getElementById('reshape-apply-btn').addEventListener('click', TVRESHAPE.apply);
  TVRESHAPE.init();
};


const TVRESHAPE = (() => {
  let dir = 'longer';
  let idCols = [];
  let msrCols = [];
  let previewSeq = 0;

  function colsMeta() {
    return window.__TV_COLS__ || [];
  }

  function scalarCols() {
    return colsMeta().filter(col => String(col.type || '').toLowerCase() !== 'list');
  }

  function numericCols() {
    return scalarCols().filter(col => ['int', 'dbl'].includes(String(col.type || '').toLowerCase()));
  }

  function nameBasedMeasureGroups() {
    const groups = {};
    scalarCols().forEach(col => {
      const name = String(col.name || '');
      let prefix = null;
      const underscore = name.match(/^(.*)_(\d+|q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i);
      const trailingDigits = name.match(/^(.*?)(\d+)$/);
      if (underscore && underscore[1]) prefix = underscore[1];
      else if (trailingDigits && trailingDigits[1] && trailingDigits[1].length >= 2) prefix = trailingDigits[1];
      if (!prefix) return;
      groups[prefix] = groups[prefix] || [];
      groups[prefix].push(col.name);
    });
    return Object.values(groups)
      .filter(group => group.length >= 2)
      .sort((a, b) => b.length - a.length);
  }

  function englishList(items) {
    const vals = (items || []).filter(Boolean);
    if (!vals.length) return '';
    if (vals.length === 1) return vals[0];
    if (vals.length === 2) return `${vals[0]} and ${vals[1]}`;
    return `${vals.slice(0, -1).join(', ')}, and ${vals[vals.length - 1]}`;
  }

  function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function inferredLongerDefaults() {
    const scalars = scalarCols();
    const nums = numericCols();
    const nonNums = scalars.filter(col => !nums.some(num => num.name === col.name));
    const groupedMeasures = nameBasedMeasureGroups()[0] || [];
    if (groupedMeasures.length >= 2) {
      return {
        idCols: scalars.map(col => col.name).filter(name => !groupedMeasures.includes(name)),
        msrCols: groupedMeasures.slice(),
      };
    }
    if (nums.length >= 2 && nonNums.length >= 1) {
      return {
        idCols: nonNums.map(col => col.name),
        msrCols: nums.map(col => col.name),
      };
    }
    if (scalars.length <= 12 && nums.length >= 1 && nonNums.length >= 1) {
      return {
        idCols: nonNums.map(col => col.name),
        msrCols: nums.map(col => col.name),
      };
    }
    return { idCols: [], msrCols: [] };
  }

  function inferredWiderDefaults() {
    const names = scalarCols().map(col => col.name);
    if (names.includes('variable') && names.includes('value')) {
      const lhsCols = names.filter(name => !['variable', 'value'].includes(name));
      return {
        formula: `${lhsCols.length ? lhsCols.join(' + ') : '.'} ~ variable`,
        valueVar: 'value',
      };
    }
    const nums = numericCols().map(col => col.name);
    const nonNums = scalarCols().map(col => col.name).filter(name => !nums.includes(name));
    if (nums.length === 1 && nonNums.length >= 2) {
      const rhs = nonNums[nonNums.length - 1];
      const lhs = nonNums.slice(0, -1);
      return {
        formula: `${lhs.length ? lhs.join(' + ') : '.'} ~ ${rhs}`,
        valueVar: nums[0],
      };
    }
    return { formula: '', valueVar: nums[0] || '' };
  }

  function setSuggestionNote(message = '', tone = 'info') {
    const el = document.getElementById('reshape-suggestion-note');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? '' : 'none';
    el.style.color = tone === 'warn' ? 'var(--md-error)' : 'var(--md-primary)';
  }

  function setWiderNote(message = '', tone = 'info') {
    const el = document.getElementById('reshape-wider-note');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? '' : 'none';
    el.style.color = tone === 'warn' ? 'var(--md-error)' : 'var(--md-primary)';
  }

  function renderChips(elId, values, removeMethod) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = values.map(value => `
      <button class="tv-chip selected" onclick='TVRESHAPE.${removeMethod}(${JSON.stringify(value)})'>
        ${TV.escapeHtml(value)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function applySuggestedLonger() {
    const guess = inferredLongerDefaults();
    if (!guess.idCols.length && !guess.msrCols.length) {
      setSuggestionNote('No obvious pivot_longer split was detected yet. Choose the id and measure columns manually.', 'warn');
      updatePreview();
      return;
    }
    idCols = guess.idCols.slice();
    msrCols = guess.msrCols.slice();
    setSuggestionNote(`Suggested split applied: keep ${idCols.length ? englishList(idCols.map(name => `"${name}"`)) : 'no id columns'} and stack ${englishList(msrCols.map(name => `"${name}"`))}.`);
    renderChips('id-chips', idCols, 'removeId');
    renderChips('msr-chips', msrCols, 'removeMsr');
    updatePreview();
  }

  function applySuggestedWider() {
    const guess = inferredWiderDefaults();
    const formulaEl = document.getElementById('dcast-formula');
    const valueEl = document.getElementById('dcast-val');
    if (!guess.formula && !guess.valueVar) {
      setWiderNote('No obvious pivot_wider setup was detected yet. Choose the row formula and value column manually.', 'warn');
      updatePreview();
      return;
    }
    if (formulaEl && guess.formula) formulaEl.value = guess.formula;
    if (valueEl && guess.valueVar) valueEl.value = guess.valueVar;
    const pieces = [];
    if (guess.formula) pieces.push(`formula ${TV.rString(guess.formula)}`);
    if (guess.valueVar) pieces.push(`value column ${TV.rString(guess.valueVar)}`);
    setWiderNote(`Suggested wider setup applied: ${pieces.join(' with ')}.`);
    updatePreview();
  }

  function init() {
    dir = 'longer';
    idCols = [];
    msrCols = [];
    previewSeq = 0;
    renderChips('id-chips', idCols, 'removeId');
    renderChips('msr-chips', msrCols, 'removeMsr');
    applySuggestedLonger();
    applySuggestedWider();
    setDir('longer');
  }

  function setDir(nextDir) {
    dir = nextDir;
    document.getElementById('dir-longer')?.classList.toggle('selected', nextDir === 'longer');
    document.getElementById('dir-wider')?.classList.toggle('selected', nextDir === 'wider');
    document.getElementById('reshape-longer').style.display = nextDir === 'longer' ? 'block' : 'none';
    document.getElementById('reshape-wider').style.display = nextDir === 'wider' ? 'block' : 'none';
    if (nextDir === 'wider') {
      const formulaEl = document.getElementById('dcast-formula');
      if (formulaEl && !String(formulaEl.value || '').trim()) applySuggestedWider();
    }
    updatePreview();
  }

  function addId(col) {
    if (!col || idCols.includes(col)) return;
    idCols.push(col);
    msrCols = msrCols.filter(name => name !== col);
    renderChips('id-chips', idCols, 'removeId');
    renderChips('msr-chips', msrCols, 'removeMsr');
    updatePreview();
  }

  function addMsr(col) {
    if (!col || msrCols.includes(col)) return;
    msrCols.push(col);
    idCols = idCols.filter(name => name !== col);
    renderChips('id-chips', idCols, 'removeId');
    renderChips('msr-chips', msrCols, 'removeMsr');
    updatePreview();
  }

  function removeId(col) {
    idCols = idCols.filter(name => name !== col);
    renderChips('id-chips', idCols, 'removeId');
    updatePreview();
  }

  function removeMsr(col) {
    msrCols = msrCols.filter(name => name !== col);
    renderChips('msr-chips', msrCols, 'removeMsr');
    updatePreview();
  }

  function longerParams() {
    return {
      direction: 'longer',
      id_vars: idCols.slice(),
      measure_vars: msrCols.slice(),
      var_name: String(document.getElementById('var-name')?.value || '').trim() || 'variable',
      val_name: String(document.getElementById('val-name')?.value || '').trim() || 'value',
    };
  }

  function widerParams() {
    return {
      direction: 'wider',
      formula: String(document.getElementById('dcast-formula')?.value || '').trim(),
      value_var: String(document.getElementById('dcast-val')?.value || '').trim(),
    };
  }

  function buildCode() {
    if (dir === 'longer') {
      const params = longerParams();
      if (!params.measure_vars.length) return { ok: false, code: '# choose one or more measure columns', warning: 'Choose the repeated columns that should be stacked into rows.' };
      if (params.var_name === params.val_name) return { ok: false, code: '# variable and value column names must be different', warning: 'Use different names for the variable column and value column.' };
      const retainedNames = colsMeta().map(col => col.name).filter(name => !params.measure_vars.includes(name));
      const duplicateOutputs = [params.var_name, params.val_name].filter(name => retainedNames.includes(name));
      if (duplicateOutputs.length) {
        return {
          ok: false,
          code: '# choose output names that do not duplicate retained columns',
          warning: `Choose different output names. ${englishList(duplicateOutputs.map(name => `"${name}"`))} already exists in the retained columns.`,
        };
      }
      return {
        ok: true,
        code: [
          'DT <- data.table::melt(DT,',
          `  id.vars = c(${params.id_vars.map(TV.rString).join(', ')}),`,
          `  measure.vars = c(${params.measure_vars.map(TV.rString).join(', ')}),`,
          `  variable.name = ${TV.rString(params.var_name)},`,
          `  value.name = ${TV.rString(params.val_name)},`,
          '  variable.factor = FALSE)'
        ].join('\n'),
      };
    }

    const params = widerParams();
    if (!params.formula) return { ok: false, code: '# enter a row formula like region ~ variable', warning: 'Enter the row formula that says which fields identify rows and which field should create new columns.' };
    if (!params.value_var) return { ok: false, code: '# choose the value column to spread', warning: 'Choose the column whose values should fill the widened cells.' };
    const formulaPieces = params.formula.split('~').map(part => String(part || '').trim()).filter(Boolean);
    const formulaText = formulaPieces.join(' ');
    const escapedValueVar = escapeRegex(params.value_var);
    if (formulaText && new RegExp(`(^|[^A-Za-z0-9_.])${escapedValueVar}($|[^A-Za-z0-9_.])`).test(formulaText)) {
      return {
        ok: false,
        code: '# the value column should not also appear in the pivot formula',
        warning: `Remove "${params.value_var}" from the row formula. The value column is filled separately.`,
      };
    }
    return {
      ok: true,
      code: `DT <- data.table::dcast(DT, ${params.formula}, value.var = ${TV.rString(params.value_var)})`,
    };
  }

  function setSummaryText(source, target, impact, warning, columns) {
    const sourceEl = document.getElementById('reshape-source-summary');
    const targetEl = document.getElementById('reshape-target-summary');
    const impactEl = document.getElementById('reshape-impact');
    const warningEl = document.getElementById('reshape-warning');
    const columnsEl = document.getElementById('reshape-columns');
    if (sourceEl) sourceEl.textContent = source;
    if (targetEl) targetEl.textContent = target;
    if (impactEl) impactEl.textContent = impact;
    if (warningEl) warningEl.textContent = warning;
    if (columnsEl) columnsEl.textContent = columns;
  }

  function updateSummarySkeleton() {
    if (dir === 'longer') {
      const params = longerParams();
      const keepText = idCols.length ? englishList(idCols.map(name => `"${name}"`)) : 'no id columns';
      const measureText = msrCols.length ? englishList(msrCols.map(name => `"${name}"`)) : 'no measure columns yet';
      const targetText = `Result columns: keep ${idCols.length || 0} id column${idCols.length === 1 ? '' : 's'} and create ${TV.rString(params.var_name)} plus ${TV.rString(params.val_name)}.`;
      const warning = params.var_name === params.val_name
        ? 'The variable column name and value column name must be different.'
        : 'Rows will be repeated once for each selected measure column.';
      setSummaryText(
        `Source columns: keep ${keepText} and stack ${measureText}.`,
        targetText,
        'Previewing impact...',
        warning,
        'Resulting columns: preview unavailable until the setup is complete.'
      );
      return;
    }

    const params = widerParams();
    const targetText = params.value_var
      ? `Result columns: spread unique values from the right-hand side of ${params.formula || 'the formula'} and fill them from "${params.value_var}".`
      : 'Result columns: choose a value column to fill the widened cells.';
    setSummaryText(
      `Source layout: ${params.formula || 'enter a row formula like region ~ variable'}.`,
      targetText,
      'Previewing impact...',
      'Each unique right-hand-side value usually becomes a new column in the widened table.',
      'Resulting columns: preview unavailable until the setup is complete.'
    );
  }

  async function requestPreview(params) {
    const seq = ++previewSeq;
    try {
      const res = await TV.api('preview_op', { op: 'reshape', params });
      if (seq !== previewSeq) return;
      const impactText = TV.formatImpactSummary(res, 'reshape');
      const added = Array.isArray(res.added_columns) && res.added_columns.length
        ? ` Added columns include ${res.added_columns.slice(0, 4).map(name => `"${name}"`).join(', ')}.`
        : '';
      const removed = Array.isArray(res.removed_columns) && res.removed_columns.length
        ? ` Removed columns include ${res.removed_columns.slice(0, 4).map(name => `"${name}"`).join(', ')}.`
        : '';
      const resulting = Array.isArray(res.resulting_columns) && res.resulting_columns.length
        ? `Resulting columns: ${res.resulting_columns.map(name => `"${name}"`).join(', ')}.`
        : 'Resulting columns: preview unavailable.';
      const impactEl = document.getElementById('reshape-impact');
      const columnsEl = document.getElementById('reshape-columns');
      const warningEl = document.getElementById('reshape-warning');
      if (impactEl) impactEl.textContent = impactText;
      if (columnsEl) columnsEl.textContent = resulting;
      if (warningEl) warningEl.textContent = `${warningEl.textContent}${added}${removed}`.trim();
    } catch (e) {
      if (seq !== previewSeq) return;
      const impactEl = document.getElementById('reshape-impact');
      const warningEl = document.getElementById('reshape-warning');
      const columnsEl = document.getElementById('reshape-columns');
      if (impactEl) impactEl.textContent = 'Preview unavailable until the pivot setup is valid.';
      if (warningEl) warningEl.textContent = `Preview note: ${e.message}`;
      if (columnsEl) columnsEl.textContent = 'Resulting columns: preview unavailable.';
    }
  }

  function updatePreview() {
    const previewEl = document.getElementById('reshape-preview');
    if (!previewEl) return;
    const built = buildCode();
    previewEl.textContent = built.code;
    updateSummarySkeleton();
    if (!built.ok) {
      const impactEl = document.getElementById('reshape-impact');
      const warningEl = document.getElementById('reshape-warning');
      if (impactEl) impactEl.textContent = 'Preview unavailable until the pivot setup is complete.';
      if (warningEl) warningEl.textContent = built.warning || 'Complete the pivot setup to preview the result.';
      const columnsEl = document.getElementById('reshape-columns');
      if (columnsEl) columnsEl.textContent = 'Resulting columns: preview unavailable until the setup is complete.';
      return;
    }
    requestPreview(dir === 'longer' ? longerParams() : widerParams());
  }

  async function apply() {
    const btn = document.getElementById('reshape-apply-btn');
    const built = buildCode();
    if (!built.ok) {
      await TV.showMessage(built.warning || 'Complete the pivot setup first.', { title: 'Pivot Incomplete' });
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'applying...';
    }
    try {
      const params = dir === 'longer' ? longerParams() : widerParams();
      const res = await TV.api('op_reshape', params);
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol || TV.state.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Reshape error:\n' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'apply ->';
      }
    }
  }

  return {
    init,
    setDir,
    addId,
    addMsr,
    removeId,
    removeMsr,
    applySuggestedLonger,
    applySuggestedWider,
    updatePreview,
    apply,
  };
})();
