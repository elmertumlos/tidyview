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
        <div class="tv-panel-sub">change labels, group values, or create categories</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Choose a column, decide which values should change, and tidyview will build the R code for you.
      </div>

      <div class="tv-field">
        <label class="tv-field-label">source column</label>
        <select class="tv-select" id="recode-col" onchange="TVRECODE.loadValues()">${colOpts}</select>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">where to save the result</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="tv-chip selected" id="recode-same-btn" onclick="TVRECODE.setTarget('same')">replace this column</button>
          <button class="tv-chip" id="recode-new-btn" onclick="TVRECODE.setTarget('new')">create a new column</button>
        </div>
        <input class="tv-input" id="recode-new-col" placeholder="e.g. gender_group or status_label"
          style="display:none;margin-top:6px" oninput="TVRECODE.updatePreview()">
      </div>

      <div class="tv-field">
        <label class="tv-field-label">how to choose the new values</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="tv-chip selected" id="recode-map-btn" onclick="TVRECODE.setMode('map')">match exact values</button>
          <button class="tv-chip" id="recode-rule-btn" onclick="TVRECODE.setMode('rule')">use if/then rules</button>
        </div>
      </div>

      <div class="tv-field" id="recode-mapping-section">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:6px;font-weight:500">quick cleanup recipes</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <button type="button" class="tv-chip" onclick="TVRECODE.applyRecipe('yesno')">yes / no cleanup</button>
          <button type="button" class="tv-chip" onclick="TVRECODE.applyRecipe('missing_text')">missing text -&gt; Missing</button>
          <button type="button" class="tv-chip" onclick="TVRECODE.applyRecipe('title')">Title Case labels</button>
          <button type="button" class="tv-chip" onclick="TVRECODE.applyRecipe('upper')">UPPER CASE labels</button>
          <button type="button" class="tv-chip" onclick="TVRECODE.applyRecipe('lower')">lower case labels</button>
          <button type="button" class="tv-chip" onclick="TVRECODE.applyRecipe('collapse_spaces')">collapse spaces</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <label class="tv-field-label" style="margin:0">change these values</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span id="recode-loading" style="font-size:10px;color:var(--md-on-surface-variant)"></span>
            <button id="recode-mode-btn" onclick="TVRECODE.toggleMode()"
              style="font-size:10px;padding:3px 8px;border-radius:12px;border:1px solid var(--md-outline-variant);background:transparent;cursor:pointer;color:var(--md-primary)">
              paste many
            </button>
          </div>
        </div>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Keep the left side as the current value and type what it should become on the right.
        </div>

        <div id="recode-table-mode">
          <div style="display:grid;grid-template-columns:1fr 16px 1fr;gap:4px;margin-bottom:4px;padding:0 2px">
            <span style="font-size:10px;font-weight:500;color:var(--md-on-surface-variant);text-transform:uppercase;letter-spacing:.06em">current value</span>
            <span></span>
            <span style="font-size:10px;font-weight:500;color:var(--md-on-surface-variant);text-transform:uppercase;letter-spacing:.06em">change to</span>
          </div>
          <div id="recode-rows" style="max-height:200px;overflow-y:auto"></div>
          <button class="tv-add-btn" style="margin-top:6px" onclick="TVRECODE.addRow('','')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
            </svg>
            add value change
          </button>
        </div>

        <div id="recode-bulk-mode" style="display:none">
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:6px;line-height:1.5">
            Add one value change per line. You can paste two columns from Excel or type:<br>
            <code style="font-size:10px">current value = change to</code>
          </div>
          <textarea id="recode-bulk-text"
            style="width:100%;min-height:160px;padding:8px 10px;font:var(--tv-type-mono);font-size:11px;line-height:1.6;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant);color:var(--md-on-surface);resize:vertical;outline:none"
            placeholder="1&#9;Male&#10;2&#9;Female&#10;3&#9;Other&#10;&#10;or:&#10;&#10;1 = Male&#10;2 = Female&#10;3 = Other"
            oninput="TVRECODE.updatePreview()"></textarea>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:4px">
            Supports pasted Excel columns or <code>value = label</code> lines.
          </div>
        </div>
      </div>

      <div class="tv-field" id="recode-rule-section" style="display:none">
        ${caseHtml}
      </div>

      <div class="tv-field">
        <label class="tv-field-label">how to store the result</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button class="tv-chip selected" id="recode-chr-btn" onclick="TVRECODE.setFactor(false)">text labels</button>
          <button class="tv-chip" id="recode-fct-btn" onclick="TVRECODE.setFactor(true)">categories (keep order)</button>
        </div>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.5">
          Use text labels for regular values, or categories when the order should matter in tables or charts.
        </div>
      </div>

      <div style="margin-top:8px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">What This Will Do</div>
        <div id="recode-source-summary" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:6px">Source column: choose a column above.</div>
        <div id="recode-target-summary" style="font-size:12px;color:var(--md-on-surface);margin-bottom:6px">Result column: choose where to save the result.</div>
        <div id="recode-friendly-summary" style="font-size:11px;color:var(--md-on-surface);line-height:1.6;margin-bottom:8px">Choose the values you want to change and tidyview will explain the result here.</div>
        <div id="recode-warning" style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6;margin-bottom:10px">Values you do not list will stay unchanged unless your rules say otherwise.</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">Generated R</div>
        <div id="recode-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);word-break:break-all">
          <span style="color:var(--md-on-surface-variant);font-style:italic">select a column...</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="recode-apply-btn" onclick="TVRECODE.apply()">apply changes -></button>
    </div>`;

  TVRECODE.init();
};

const TVRECODE = (() => {
  let rows = [];
  let asFactor = false;
  let target = 'same';
  let bulkMode = false;
  let mode = 'map';
  let availableValues = [];
  const MISSING_TEXT_VALUES = new Set(['na', 'n/a', 'n.a.', 'null', 'none', 'unknown', 'missing']);
  const YES_VALUES = new Set(['y', 'yes', 'true', '1', 't']);
  const NO_VALUES = new Set(['n', 'no', 'false', '0', 'f']);

  function init() {
    rows = [];
    asFactor = false;
    target = 'same';
    bulkMode = false;
    mode = 'map';
    availableValues = [];
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

  function normalizedValue(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function titleCaseValue(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/\b([a-z])/g, function(match) { return match.toUpperCase(); });
  }

  function collapseSpacesValue(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalizeAvailableStrings() {
    return (availableValues || [])
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value));
  }

  function setRowsFromMapping(mapping) {
    rows = [];
    const container = document.getElementById('recode-rows');
    if (container) container.innerHTML = '';
    (mapping || []).forEach(m => addRow(m.from, m.to));
    const bulkText = document.getElementById('recode-bulk-text');
    if (bulkText) {
      bulkText.value = (mapping || []).map(m => `${m.from}\t${m.to}`).join('\n');
    }
  }

  function groupMappings(mapping) {
    const grouped = new Map();
    (mapping || []).forEach(m => {
      const targetValue = String(m.to ?? '');
      if (!grouped.has(targetValue)) grouped.set(targetValue, []);
      grouped.get(targetValue).push(String(m.from ?? ''));
    });
    return grouped;
  }

  function groupedTargetSummaries(mapping, limit = 2) {
    return Array.from(groupMappings(mapping).entries())
      .filter(([, sources]) => sources.length > 1)
      .slice(0, limit)
      .map(([targetValue, sources]) => {
        const shown = sources.slice(0, 3).map(v => `"${v}"`).join(', ');
        const more = sources.length > 3 ? ` and ${sources.length - 3} more` : '';
        return `"${targetValue}" will combine ${shown}${more}.`;
      });
  }

  function buildRecipeMapping(recipe) {
    const values = normalizeAvailableStrings();
    if (!values.length) return [];
    if (recipe === 'yesno') {
      return values.flatMap(value => {
        const norm = normalizedValue(value);
        if (YES_VALUES.has(norm) && value !== 'Yes') return [{ from: value, to: 'Yes' }];
        if (NO_VALUES.has(norm) && value !== 'No') return [{ from: value, to: 'No' }];
        return [];
      });
    }
    if (recipe === 'missing_text') {
      return values.flatMap(value => {
        const norm = normalizedValue(value);
        if ((norm === '' || MISSING_TEXT_VALUES.has(norm)) && value !== 'Missing') {
          return [{ from: value, to: 'Missing' }];
        }
        return [];
      });
    }
    if (recipe === 'title') {
      return values.flatMap(value => {
        const next = titleCaseValue(value);
        return next !== value ? [{ from: value, to: next }] : [];
      });
    }
    if (recipe === 'upper') {
      return values.flatMap(value => {
        const next = String(value).toUpperCase();
        return next !== value ? [{ from: value, to: next }] : [];
      });
    }
    if (recipe === 'lower') {
      return values.flatMap(value => {
        const next = String(value).toLowerCase();
        return next !== value ? [{ from: value, to: next }] : [];
      });
    }
    if (recipe === 'collapse_spaces') {
      return values.flatMap(value => {
        const next = collapseSpacesValue(value);
        return next !== value ? [{ from: value, to: next }] : [];
      });
    }
    return [];
  }

  function applyRecipe(recipe) {
    setMode('map');
    const mapping = buildRecipeMapping(recipe);
    if (!mapping.length) {
      TV.showToast('No values need that cleanup right now.');
      updatePreview();
      return;
    }
    setRowsFromMapping(mapping);
    updatePreview();
  }

  async function loadValues() {
    const col = document.getElementById('recode-col')?.value;
    if (!col) return;
    const lbl = document.getElementById('recode-loading');
    if (lbl) lbl.textContent = 'loading...';
    try {
      const res = await TV.api('col_values', { col });
      const sugg = res.suggestions || res.values;
      availableValues = res.values || [];
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
    div.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:8px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface)';
    div.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);font-weight:500">value change</div>
        <button onclick="TVRECODE.removeRow('${id}')"
          style="width:24px;height:24px;border-radius:50%;border:none;background:transparent;color:var(--md-on-surface-variant);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">x</button>
      </div>
      <div>
        <label class="tv-field-label" style="margin-bottom:4px">current value</label>
        <input class="tv-input" id="rr-from-${id}" value="${escapeHtmlAttr(fromVal)}"
          placeholder="original" style="padding:6px 8px;font:var(--tv-type-mono);font-size:11px"
          oninput="TVRECODE.updatePreview()">
      </div>
      <div>
        <label class="tv-field-label" style="margin-bottom:4px">change to</label>
        <input class="tv-input" id="rr-to-${id}" value="${escapeHtmlAttr(toVal)}"
          placeholder="new label" style="padding:6px 8px;font-size:12px"
          oninput="TVRECODE.updatePreview()">
      </div>`;
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

  function uniqueTargetCount(mapping) {
    return new Set((mapping || []).map(m => String(m.to ?? ''))).size;
  }

  function factorLevelsForMapping(mapping) {
    const mappedTargets = (mapping || []).map(m => String(m.to ?? ''));
    const mappedSources = new Set((mapping || []).map(m => String(m.from ?? '')));
    const preservedValues = (availableValues || []).filter(v => !mappedSources.has(String(v)));
    return Array.from(new Set([...mappedTargets, ...preservedValues]));
  }

  function outputTypeLabel() {
    return asFactor ? 'ordered categories' : 'text labels';
  }

  function formatCountLabel(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function updatePreview() {
    const prev = document.getElementById('recode-preview');
    const sourceSummary = document.getElementById('recode-source-summary');
    const targetSummary = document.getElementById('recode-target-summary');
    const friendlySummary = document.getElementById('recode-friendly-summary');
    const warning = document.getElementById('recode-warning');
    if (!prev) return;
    const col = document.getElementById('recode-col')?.value;
    const newColVal = document.getElementById('recode-new-col')?.value?.trim() || '';
    const tgt = (target === 'new' && newColVal) ? newColVal : col;
    if (!col || !tgt) {
      prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">configure above...</span>`;
      if (sourceSummary) sourceSummary.textContent = 'Source column: choose a column above.';
      if (targetSummary) targetSummary.textContent = 'Result column: choose where to save the result.';
      if (friendlySummary) friendlySummary.textContent = 'Choose the values you want to change and tidyview will explain the result here.';
      if (warning) warning.textContent = 'Values you do not list will stay unchanged unless your rules say otherwise.';
      return;
    }
    if (sourceSummary) sourceSummary.textContent = `Source column: "${col}".`;
    let code;
    let warningParts = [];
    if (mode === 'rule') {
      const exprBase = TV.getCaseWhenExpr('recode-rules');
      if (!exprBase) {
        prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">add at least one rule above...</span>`;
        if (targetSummary) targetSummary.textContent = target === 'same'
          ? `Result column: replace values in "${col}".`
          : `Result column: create "${tgt}".`;
        if (friendlySummary) friendlySummary.textContent = target === 'same'
          ? `Add one or more if/then rules to decide which values in "${col}" should be replaced.`
          : `Add one or more if/then rules to build "${tgt}" from "${col}".`;
        if (warning) warning.textContent = target === 'same'
          ? 'Rules that match will replace values in this column. Rows that match no rule keep the original value by default.'
          : 'Rows that match no rule become missing unless you set an otherwise expression.';
        return;
      }
      const expr = asFactor ? `factor(${exprBase})` : exprBase;
      code = `${TV.rName(TV.state.name || 'DT')}[, ${TV.rName(tgt)} := ${expr}]`;
      warningParts.push(target === 'same'
        ? `This will replace values in "${col}" wherever a rule matches.`
        : `This will create "${tgt}" from "${col}".`);
      warningParts.push(target === 'same'
        ? 'Rows that match no rule keep their original value by default.'
        : 'Rows that match no rule become missing unless you set an otherwise expression.');
      if (friendlySummary) friendlySummary.textContent = target === 'same'
        ? `This will check your if/then rules and replace matching values in "${col}". The result will be saved as ${outputTypeLabel()}.`
        : `This will build "${tgt}" by checking your if/then rules against "${col}". The result will be saved as ${outputTypeLabel()}.`;
    } else {
      const mapping = getMapping();
      if (!mapping.length) {
        prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">configure above...</span>`;
        if (targetSummary) targetSummary.textContent = target === 'same'
          ? `Result column: replace values in "${col}".`
          : `Result column: create "${tgt}" from "${col}".`;
        if (friendlySummary) friendlySummary.textContent = 'Add one or more exact value matches so tidyview can show the result.';
        if (warning) warning.textContent = 'Values you do not list will stay unchanged.';
        return;
      }
      const condArgs = mapping
        .map(m => `as.character(${TV.rName(col)}) == ${quoteRString(m.from)}, ${quoteRString(m.to)}`)
        .join(', ');
      const lookup = `data.table::fcase(${condArgs}, default = as.character(${TV.rName(col)}))`;
      if (asFactor) {
        const lvls = factorLevelsForMapping(mapping).map(quoteRString).join(', ');
        code = `${TV.rName(TV.state.name || 'DT')}[, ${TV.rName(tgt)} := factor(${lookup}, levels = c(${lvls}))]`;
      } else {
        code = `${TV.rName(TV.state.name || 'DT')}[, ${TV.rName(tgt)} := ${lookup}]`;
      }
      warningParts.push(target === 'same'
        ? `This will replace values in "${col}".`
        : `This will create "${tgt}" from "${col}".`);
      const unchangedCount = Math.max(0, (availableValues || []).length - new Set(mapping.map(m => String(m.from ?? ''))).size);
      warningParts.push('Any value you do not list will stay exactly as it is.');
      const groupedSummaries = groupedTargetSummaries(mapping);
      if (uniqueTargetCount(mapping) < mapping.length) {
        warningParts.push('Some original values will be grouped into the same new label.');
        warningParts = warningParts.concat(groupedSummaries);
      }
      if (friendlySummary) {
        const mappedCount = mapping.length;
        const actionText = target === 'same'
          ? `This will replace ${formatCountLabel(mappedCount, 'listed value', 'listed values')} in "${col}".`
          : `This will create "${tgt}" from "${col}" and change ${formatCountLabel(mappedCount, 'listed value', 'listed values')}.`;
        const keepText = unchangedCount > 0
          ? ` ${formatCountLabel(unchangedCount, 'other value', 'other values')} will stay unchanged.`
          : ' Every available value is covered by your list.';
        const groupText = uniqueTargetCount(mapping) < mapping.length
          ? ` Some values will be grouped into the same result label.${groupedSummaries.length ? ` ${groupedSummaries.join(' ')}` : ''}`
          : '';
        const storageText = ` The result will be saved as ${outputTypeLabel()}.`;
        friendlySummary.textContent = `${actionText}${keepText}${groupText}${storageText}`;
      }
    }
    prev.textContent = code;
    if (targetSummary) {
      targetSummary.textContent = target === 'same'
        ? `Result column: replace values in "${col}".`
        : `Result column: create "${tgt}" from "${col}".`;
    }
    if (warning) {
      if (asFactor) warningParts.push('The result will be stored as ordered categories.');
      warning.textContent = warningParts.join(' ');
    }
  }

  async function apply() {
    const col = document.getElementById('recode-col')?.value;
    const newColVal = document.getElementById('recode-new-col')?.value?.trim() || '';
    if (target === 'new' && !newColVal) {
      await TV.showMessage('Enter a name for the new column.');
      return;
    }
    if (target === 'same') {
      const ok = await TV.confirmMessage(
        `This will replace values in "${col}". Values you do not list will stay as they are. Continue?`,
        { title: 'Replace Values In Column', confirmLabel: 'apply' }
      );
      if (!ok) return;
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
        btn.textContent = 'apply changes ->';
      }
    }
  }

  return { init, setMode, setFactor, setTarget, toggleMode, loadValues, addRow, removeRow, updatePreview, apply, applyRecipe };
})();
