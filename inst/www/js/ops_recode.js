/* tidyview ops_recode.js - recode/relabel column values */
'use strict';

TV.panels = TV.panels || {};

TV.panels.recode = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const colOpts = cols.map(c =>
    `<option value="${c.name}">${c.name} (${c.type})</option>`
  ).join('');
  const caseHtml = TV.caseWhenBuilderHtml('recode-rules', {
    note: 'Create rule-based recodes with a case_when-style builder. tidyview will generate the equivalent data.table::fcase(...) expression.',
    defaultLabel: 'otherwise expression',
    defaultPlaceholder: 'leave blank to keep the current value when overwriting',
  });

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M5 7h6M5 10h4M5 13h5" stroke-linecap="round"/>
          <path d="M13 9l2 2-2 2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M15 11h-3" stroke-linecap="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">recode</div>
        <div class="tv-panel-sub">relabel values and convert to factor</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div class="tv-field">
        <label class="tv-field-label">column to recode</label>
        <select class="tv-select" id="recode-col" onchange="TVRECODE.loadValues()">${colOpts}</select>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">save result to</label>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="tv-chip selected" id="recode-same-btn" onclick="TVRECODE.setTarget('same')">same column (overwrite)</button>
          <button class="tv-chip" id="recode-new-btn" onclick="TVRECODE.setTarget('new')">new column</button>
        </div>
        <input class="tv-input" id="recode-new-col" placeholder="new column name"
          style="display:none;margin-top:6px" oninput="TVRECODE.updatePreview()">
      </div>

      <div class="tv-field">
        <label class="tv-field-label">recode mode</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="tv-chip selected" id="recode-map-btn" onclick="TVRECODE.setMode('map')">value mappings</button>
          <button class="tv-chip" id="recode-rule-btn" onclick="TVRECODE.setMode('rule')">conditional rules</button>
        </div>
      </div>

      <div class="tv-field" id="recode-mapping-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label class="tv-field-label" style="margin:0">value mappings</label>
          <div style="display:flex;gap:8px;align-items:center">
            <span id="recode-loading" style="font-size:10px;color:var(--md-on-surface-variant)"></span>
            <button id="recode-mode-btn" onclick="TVRECODE.toggleMode()"
              style="font-size:10px;padding:3px 8px;border-radius:12px;border:1px solid var(--md-outline-variant);background:transparent;cursor:pointer;color:var(--md-primary)">
              bulk paste
            </button>
          </div>
        </div>

        <div id="recode-table-mode">
          <div style="display:grid;grid-template-columns:1fr 16px 1fr;gap:4px;margin-bottom:4px;padding:0 2px">
            <span style="font-size:10px;font-weight:500;color:var(--md-on-surface-variant);text-transform:uppercase;letter-spacing:.06em">original value</span>
            <span></span>
            <span style="font-size:10px;font-weight:500;color:var(--md-on-surface-variant);text-transform:uppercase;letter-spacing:.06em">new label</span>
          </div>
          <div id="recode-rows" style="max-height:200px;overflow-y:auto"></div>
          <button class="tv-add-btn" style="margin-top:6px" onclick="TVRECODE.addRow('','')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
            </svg>
            add row
          </button>
        </div>

        <div id="recode-bulk-mode" style="display:none">
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:6px;line-height:1.5">
            One mapping per line. Paste directly from Excel (two columns) or type:<br>
            <code style="font-size:10px">original value = new label</code>
          </div>
          <textarea id="recode-bulk-text"
            style="width:100%;min-height:160px;padding:8px 10px;font:var(--tv-type-mono);font-size:11px;line-height:1.6;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant);color:var(--md-on-surface);resize:vertical;outline:none"
            placeholder="1&#9;Male&#10;2&#9;Female&#10;3&#9;Other&#10;&#10;or:&#10;&#10;1 = Male&#10;2 = Female&#10;3 = Other"
            oninput="TVRECODE.updatePreview()"></textarea>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:4px">
            Supports tab-separated (copy from Excel) or <code>value = label</code> format.
          </div>
        </div>
      </div>

      <div class="tv-field" id="recode-rule-section" style="display:none">
        ${caseHtml}
      </div>

      <div class="tv-field">
        <label class="tv-field-label">output type</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button class="tv-chip selected" id="recode-chr-btn" onclick="TVRECODE.setFactor(false)">character</button>
          <button class="tv-chip" id="recode-fct-btn" onclick="TVRECODE.setFactor(true)">factor (ordered)</button>
        </div>
      </div>

      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="recode-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);word-break:break-all">
          <span style="color:var(--md-on-surface-variant);font-style:italic">select a column...</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="recode-apply-btn" onclick="TVRECODE.apply()">apply recode -></button>
    </div>`;

  TVRECODE.init();
};

const TVRECODE = (() => {
  let rows = [];
  let asFactor = false;
  let target = 'same';
  let bulkMode = false;
  let mode = 'map';

  function init() {
    rows = [];
    asFactor = false;
    target = 'same';
    bulkMode = false;
    mode = 'map';
    TV.initCaseWhenBuilder('recode-rules', {
      defaultResolver: defaultRuleExpr,
    });
    const sel = document.getElementById('recode-col');
    if (sel && sel.value) loadValues();
    syncMode();
  }

  function defaultRuleExpr() {
    const col = document.getElementById('recode-col')?.value || '';
    if (target === 'same' && col) return TV.rName(col);
    return 'NA_character_';
  }

  function setMode(nextMode) {
    mode = nextMode;
    syncMode();
    updatePreview();
  }

  function syncMode() {
    document.getElementById('recode-map-btn')?.classList.toggle('selected', mode === 'map');
    document.getElementById('recode-rule-btn')?.classList.toggle('selected', mode === 'rule');
    const mapSection = document.getElementById('recode-mapping-section');
    const ruleSection = document.getElementById('recode-rule-section');
    if (mapSection) mapSection.style.display = mode === 'map' ? '' : 'none';
    if (ruleSection) ruleSection.style.display = mode === 'rule' ? '' : 'none';
    if (mode === 'rule') TV.syncCaseWhenBuilder('recode-rules');
  }

  function setFactor(val) {
    asFactor = val;
    document.getElementById('recode-chr-btn')?.classList.toggle('selected', !val);
    document.getElementById('recode-fct-btn')?.classList.toggle('selected', val);
    if (mode === 'rule') TV.syncCaseWhenBuilder('recode-rules');
    updatePreview();
  }

  function setTarget(nextTarget) {
    target = nextTarget;
    document.getElementById('recode-same-btn')?.classList.toggle('selected', nextTarget === 'same');
    document.getElementById('recode-new-btn')?.classList.toggle('selected', nextTarget === 'new');
    const inp = document.getElementById('recode-new-col');
    if (inp) inp.style.display = nextTarget === 'new' ? '' : 'none';
    if (mode === 'rule') TV.syncCaseWhenBuilder('recode-rules');
    updatePreview();
  }

  function toggleMode() {
    if (!bulkMode) {
      const mapping = getTableMapping();
      const text = mapping.map(m => `${m.from}\t${m.to}`).join('\n');
      document.getElementById('recode-bulk-text').value = text;
    } else {
      const mapping = parseBulk();
      rows = [];
      document.getElementById('recode-rows').innerHTML = '';
      mapping.forEach(m => addRow(m.from, m.to));
    }
    bulkMode = !bulkMode;
    document.getElementById('recode-table-mode').style.display = bulkMode ? 'none' : '';
    document.getElementById('recode-bulk-mode').style.display = bulkMode ? '' : 'none';
    document.getElementById('recode-mode-btn').textContent = bulkMode ? 'table view' : 'bulk paste';
    updatePreview();
  }

  function parseBulk() {
    const raw = document.getElementById('recode-bulk-text')?.value || '';
    return raw.split('\n')
      .map(line => line.trimEnd())
      .filter(line => line.length > 0)
      .map(line => {
        const tabIdx = line.indexOf('\t');
        if (tabIdx !== -1) return { from: line.slice(0, tabIdx).trim(), to: line.slice(tabIdx + 1).trim() };
        const eqIdx = line.indexOf('=');
        if (eqIdx !== -1) return { from: line.slice(0, eqIdx).trim(), to: line.slice(eqIdx + 1).trim() };
        return { from: line.trim(), to: line.trim() };
      })
      .filter(m => m.from !== '');
  }

  async function loadValues() {
    const col = document.getElementById('recode-col')?.value;
    if (!col) return;
    const lbl = document.getElementById('recode-loading');
    if (lbl) lbl.textContent = 'loading...';
    try {
      const res = await TV.api('col_values', { col });
      const sugg = res.suggestions || res.values;
      rows = [];
      document.getElementById('recode-rows').innerHTML = '';
      res.values.forEach((v, i) => addRow(v, sugg[i] ?? v));
      if (bulkMode) {
        document.getElementById('recode-bulk-text').value =
          res.values.map((v, i) => `${v}\t${sugg[i] ?? v}`).join('\n');
      }
      if (lbl) lbl.textContent = `${res.values.length} unique value${res.values.length === 1 ? '' : 's'}`;
    } catch (e) {
      if (lbl) lbl.textContent = 'error';
    }
    if (mode === 'rule') TV.syncCaseWhenBuilder('recode-rules');
    updatePreview();
  }

  function addRow(fromVal, toVal) {
    const id = 'rr' + Date.now() + Math.random().toString(36).slice(2, 5);
    rows.push(id);
    const container = document.getElementById('recode-rows');
    if (!container) return;
    const div = document.createElement('div');
    div.id = 'recode-row-' + id;
    div.style.cssText = 'display:grid;grid-template-columns:1fr 16px 1fr 28px;gap:6px;align-items:center;margin-bottom:6px';
    div.innerHTML = `
      <input class="tv-input" id="rr-from-${id}" value="${escapeHtmlAttr(fromVal)}"
        placeholder="original" style="padding:6px 8px;font:var(--tv-type-mono);font-size:11px"
        oninput="TVRECODE.updatePreview()">
      <span style="text-align:center;color:var(--md-on-surface-variant);font-size:11px">-></span>
      <input class="tv-input" id="rr-to-${id}" value="${escapeHtmlAttr(toVal)}"
        placeholder="new label" style="padding:6px 8px;font-size:12px"
        oninput="TVRECODE.updatePreview()">
      <button onclick="TVRECODE.removeRow('${id}')"
        style="width:24px;height:24px;border-radius:50%;border:none;background:transparent;color:var(--md-on-surface-variant);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center">x</button>`;
    container.appendChild(div);
  }

  function removeRow(id) {
    rows = rows.filter(r => r !== id);
    document.getElementById('recode-row-' + id)?.remove();
    updatePreview();
  }

  function escapeHtmlAttr(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function quoteRString(value) {
    return JSON.stringify(String(value ?? ''));
  }

  function getTableMapping() {
    return rows
      .filter(id => document.getElementById('recode-row-' + id))
      .map(id => ({
        from: document.getElementById('rr-from-' + id)?.value ?? '',
        to: document.getElementById('rr-to-' + id)?.value ?? '',
      }))
      .filter(m => m.from !== '');
  }

  function getMapping() {
    return bulkMode ? parseBulk() : getTableMapping();
  }

  function updatePreview() {
    const prev = document.getElementById('recode-preview');
    if (!prev) return;
    const col = document.getElementById('recode-col')?.value;
    const newColVal = document.getElementById('recode-new-col')?.value?.trim() || '';
    const tgt = (target === 'new' && newColVal) ? newColVal : col;
    if (!col || !tgt) {
      prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">configure above...</span>`;
      return;
    }
    let code;
    if (mode === 'rule') {
      const exprBase = TV.getCaseWhenExpr('recode-rules');
      if (!exprBase) {
        prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">add at least one rule above...</span>`;
        return;
      }
      const expr = asFactor ? `factor(${exprBase})` : exprBase;
      code = `${TV.rName(TV.state.name || 'DT')}[, ${TV.rName(tgt)} := ${expr}]`;
    } else {
      const mapping = getMapping();
      if (!mapping.length) {
        prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">configure above...</span>`;
        return;
      }
      const labels = mapping.map(m => quoteRString(m.to)).join(', ');
      const keys = mapping.map(m => quoteRString(m.from)).join(', ');
      const lookup = `stats::setNames(c(${labels}), c(${keys}))[as.character(${TV.rName(col)})]`;
      if (asFactor) {
        const lvls = mapping.map(m => quoteRString(m.to)).join(', ');
        code = `${TV.rName(TV.state.name || 'DT')}[, ${TV.rName(tgt)} := factor(${lookup}, levels = c(${lvls}))]`;
      } else {
        code = `${TV.rName(TV.state.name || 'DT')}[, ${TV.rName(tgt)} := ${lookup}]`;
      }
    }
    prev.textContent = code;
  }

  async function apply() {
    const col = document.getElementById('recode-col')?.value;
    const newColVal = document.getElementById('recode-new-col')?.value?.trim() || '';
    if (target === 'new' && !newColVal) {
      await TV.showMessage('Enter a name for the new column.');
      return;
    }

    const btn = document.getElementById('recode-apply-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'recoding...';
    }
    try {
      let res;
      if (mode === 'rule') {
        const exprBase = TV.getCaseWhenExpr('recode-rules');
        if (!col || !exprBase) {
          await TV.showMessage('Select a column and add at least one rule.', { title: 'Recode Incomplete' });
          return;
        }
        const tgt = target === 'new' ? newColVal : col;
        const expr = asFactor ? `factor(${exprBase})` : exprBase;
        res = await TV.api('op_mutate', {
          col_name: tgt,
          expr,
        });
      } else {
        const mapping = getMapping();
        if (!col || !mapping.length) {
          await TV.showMessage('Select a column and add at least one mapping.');
          return;
        }
        res = await TV.api('op_recode', {
          col,
          mapping,
          as_factor: asFactor,
          new_col: target === 'new' ? newColVal : '',
        });
      }
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Recode error: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'apply recode ->';
      }
    }
  }

  return { init, setMode, setFactor, setTarget, toggleMode, loadValues, addRow, removeRow, updatePreview, apply };
})();
