/* tidyview ops_validate.js - validation rules panel */
'use strict';

TV.panels = TV.panels || {};

TV.panels.validate = function(pane) {
  if (!TV.state.dt || !TV.state.dt.length) {
    pane.innerHTML = `
      <div class="tv-panel-header">
        <div class="tv-panel-icon">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M10 3l5 2v4c0 3.3-2 5.8-5 7-3-1.2-5-3.7-5-7V5l5-2z" stroke-linejoin="round"/>
            <path d="M7 10h6M10 7v6" stroke-linecap="round"/>
          </svg>
        </div>
        <div><div class="tv-panel-title">validate</div><div class="tv-panel-sub">load data first</div></div>
        <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
      </div>
      <div class="tv-panel-body">
        <div style="font-size:13px;color:var(--md-on-surface-variant)">No data loaded.</div>
      </div>`;
    return;
  }

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10 3l5 2v4c0 3.3-2 5.8-5 7-3-1.2-5-3.7-5-7V5l5-2z" stroke-linejoin="round"/>
          <path d="M7 10h6M10 7v6" stroke-linecap="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">validate</div>
        <div class="tv-panel-sub">required fields, unique keys, allowed values, regex, ranges, and custom checks</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Build validation rules for the active dataset and see how many rows fail each check. Use this after loading or cleaning data, before reporting or export.
      </div>

      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);margin-bottom:12px;background:var(--md-surface-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:8px;font-weight:500">quick templates</div>
        <div style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6;margin-bottom:10px">
          Start with a common validation pattern, then adjust the column or settings below if needed.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="tv-chip" type="button" onclick="TVVALIDATE.addRecipe('required_field')">required field</button>
          <button class="tv-chip" type="button" onclick="TVVALIDATE.addRecipe('unique_id')">unique ID</button>
          <button class="tv-chip" type="button" onclick="TVVALIDATE.addRecipe('allowed_values')">allowed values</button>
          <button class="tv-chip" type="button" onclick="TVVALIDATE.addRecipe('numeric_range')">numeric range</button>
          <button class="tv-chip" type="button" onclick="TVVALIDATE.addRecipe('date_required')">date required</button>
          <button class="tv-chip" type="button" onclick="TVVALIDATE.addRecipe('date_range')">date range</button>
          <button class="tv-chip" type="button" onclick="TVVALIDATE.addRecipe('date_not_future')">date not in future</button>
        </div>
      </div>

      <div class="tv-field" style="margin-top:0">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="tv-btn-outlined" type="button" style="padding:8px 14px" onclick="TVVALIDATE.addRule()">add rule</button>
          <button class="tv-btn-filled" type="button" style="padding:8px 14px;width:auto" onclick="TVVALIDATE.load()">refresh validation</button>
        </div>
      </div>

      <div id="validate-rules-builder"></div>

      <div id="validate-status" style="font-size:11px;color:var(--md-on-surface-variant);margin:12px 0 10px">Add one or more validation rules.</div>

      <div id="validate-overview" class="tv-audit-grid"></div>

      <div class="tv-compare-section">
        <div class="tv-compare-title">validation results</div>
        <div id="validate-results" class="tv-compare-list"></div>
      </div>

      <div class="tv-compare-section">
        <div class="tv-compare-title">columns with most issues</div>
        <div id="validate-columns" class="tv-compare-list"></div>
      </div>

      <div style="margin-top:14px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="validate-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"># add validation rules to build generated R</div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">close</button>
      <button class="tv-btn-filled" type="button" onclick="TVVALIDATE.load()">run validation</button>
    </div>`;

  TVVALIDATE.init();
};


const TVVALIDATE = (() => {
  let counter = 0;
  let rules = [];
  let result = null;

  function cols() {
    return window.__TV_COLS__ || [];
  }

  function defaultColumn() {
    return cols()[0]?.name || '';
  }

  function defaultNumericColumn() {
    return cols().find(col => ['int', 'dbl'].includes(col.type))?.name || defaultColumn();
  }

  function defaultTextColumn() {
    return cols().find(col => ['chr', 'fct', 'lgl'].includes(col.type))?.name || defaultColumn();
  }

  function defaultDateColumn() {
    return cols().find(col => ['Date', 'IDate', 'POSIXct'].includes(col.type))?.name || defaultColumn();
  }

  function columnType(name) {
    return cols().find(col => col.name === name)?.type || '';
  }

  function isDateType(type) {
    return ['Date', 'IDate', 'POSIXct'].includes(type);
  }

  function nextId() {
    counter += 1;
    return counter;
  }

  function emptyRule() {
    return {
      id: nextId(),
      type: 'not_missing',
      col: defaultColumn(),
      label: '',
      values: '',
      pattern: '',
      ignore_case: false,
      min: '',
      max: '',
      expr: '',
    };
  }

  function ruleTypeHelp(type) {
    const help = {
      not_missing: 'Fails rows where the chosen column is blank or missing.',
      unique: 'Fails repeated values in the chosen column.',
      allowed: 'Fails values that are not included in your approved list.',
      regex: 'Fails values that do not match the text pattern you provide.',
      range: 'Fails numeric values outside the minimum and maximum you set.',
      not_future: 'Fails dates or timestamps that occur after today.',
      expr: 'Fails rows where your custom expression returns FALSE.',
    };
    return help[type] || 'Fails rows that do not meet this rule.';
  }

  function ruleSummary(rule) {
    const colLabel = rule.col ? `<code>${TV.escapeHtml(rule.col)}</code>` : 'the selected column';
    const summaries = {
      not_missing: `Checks that ${colLabel} is filled in on every row.`,
      unique: `Checks that ${colLabel} does not repeat.`,
      allowed: `Checks that ${colLabel} only uses the allowed values you list.`,
      regex: `Checks that ${colLabel} matches the text pattern you provide.`,
      range: `Checks that ${colLabel} stays within the minimum and maximum you set.`,
      not_future: `Checks that ${colLabel} is today or earlier.`,
      expr: 'Checks your custom row-by-row expression.',
    };
    return summaries[rule.type] || 'Checks whether each row passes this rule.';
  }

  function recipeRule(recipeType) {
    if (recipeType === 'required_field') {
      const col = defaultColumn();
      return {
        id: nextId(),
        type: 'not_missing',
        col,
        label: col ? `${col} is required` : 'required field',
        values: '',
        pattern: '',
        ignore_case: false,
        min: '',
        max: '',
        expr: '',
      };
    }
    if (recipeType === 'unique_id') {
      const col = defaultColumn();
      return {
        id: nextId(),
        type: 'unique',
        col,
        label: col ? `${col} must be unique` : 'unique ID',
        values: '',
        pattern: '',
        ignore_case: false,
        min: '',
        max: '',
        expr: '',
      };
    }
    if (recipeType === 'allowed_values') {
      const col = defaultTextColumn();
      return {
        id: nextId(),
        type: 'allowed',
        col,
        label: col ? `${col} must use approved values` : 'allowed values',
        values: '',
        pattern: '',
        ignore_case: false,
        min: '',
        max: '',
        expr: '',
      };
    }
    if (recipeType === 'numeric_range') {
      const col = defaultNumericColumn();
      return {
        id: nextId(),
        type: 'range',
        col,
        label: col ? `${col} must stay in range` : 'numeric range',
        values: '',
        pattern: '',
        ignore_case: false,
        min: '',
        max: '',
        expr: '',
      };
    }
    if (recipeType === 'date_required') {
      const col = defaultDateColumn();
      return {
        id: nextId(),
        type: 'not_missing',
        col,
        label: col ? `${col} is required` : 'date required',
        values: '',
        pattern: '',
        ignore_case: false,
        min: '',
        max: '',
        expr: '',
      };
    }
    if (recipeType === 'date_range') {
      const col = defaultDateColumn();
      return {
        id: nextId(),
        type: 'range',
        col,
        label: col ? `${col} must stay in date range` : 'date range',
        values: '',
        pattern: '',
        ignore_case: false,
        min: '',
        max: '',
        expr: '',
      };
    }
    if (recipeType === 'date_not_future') {
      const col = defaultDateColumn();
      return {
        id: nextId(),
        type: 'not_future',
        col,
        label: col ? `${col} cannot be in the future` : 'date not in future',
        values: '',
        pattern: '',
        ignore_case: false,
        min: '',
        max: '',
        expr: '',
      };
    }
    return emptyRule();
  }

  function typeOptions(selected) {
    const items = [
      ['not_missing', 'not missing'],
      ['unique', 'unique'],
      ['allowed', 'allowed values'],
      ['regex', 'regex'],
      ['range', 'range'],
      ['not_future', 'not in future'],
      ['expr', 'custom expression'],
    ];
    return items.map(([value, label]) =>
      `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
    ).join('');
  }

  function columnOptions(selected) {
    return cols().map(col =>
      `<option value="${TV.escapeAttr(col.name)}"${col.name === selected ? ' selected' : ''}>${TV.escapeHtml(col.name)} (${TV.escapeHtml(col.type)})</option>`
    ).join('');
  }

  function extraFields(rule) {
    const dateLike = isDateType(columnType(rule.col));
    if (rule.type === 'allowed') {
      return `
        <div class="tv-field">
          <label class="tv-field-label">allowed values</label>
          <textarea class="tv-input" style="min-height:70px;resize:vertical" placeholder="one value per line or comma-separated" oninput='TVVALIDATE.updateRule(${rule.id}, "values", this.value)'>${TV.escapeHtml(rule.values || '')}</textarea>
        </div>`;
    }
    if (rule.type === 'regex') {
      return `
        <div class="tv-field">
          <label class="tv-field-label">pattern</label>
          <input class="tv-input" value="${TV.escapeAttr(rule.pattern || '')}" placeholder="e.g. ^[A-Z]{2}-[0-9]{3}$" oninput='TVVALIDATE.updateRule(${rule.id}, "pattern", this.value)'>
        </div>
        <div class="tv-field" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="validate-ic-${rule.id}" ${rule.ignore_case ? 'checked' : ''} onchange='TVVALIDATE.updateRule(${rule.id}, "ignore_case", this.checked)'>
          <label for="validate-ic-${rule.id}" style="font-size:12px;cursor:pointer">ignore case</label>
        </div>`;
    }
    if (rule.type === 'range') {
      return `
        <div class="tv-plot-grid">
          <div class="tv-field">
            <label class="tv-field-label">minimum (optional)</label>
            <input class="tv-input" value="${TV.escapeAttr(rule.min || '')}" placeholder="${dateLike ? 'e.g. 2024-01-01' : 'e.g. 0 or 2024-01-01'}" oninput='TVVALIDATE.updateRule(${rule.id}, "min", this.value)'>
          </div>
          <div class="tv-field">
            <label class="tv-field-label">maximum (optional)</label>
            <input class="tv-input" value="${TV.escapeAttr(rule.max || '')}" placeholder="${dateLike ? 'e.g. 2024-12-31' : 'e.g. 120 or 2024-12-31'}" oninput='TVVALIDATE.updateRule(${rule.id}, "max", this.value)'>
          </div>
        </div>`;
    }
    if (rule.type === 'expr') {
      return `
        <div class="tv-field">
          <label class="tv-field-label">custom expression</label>
          <textarea class="tv-input" style="min-height:80px;resize:vertical" placeholder="Expression should return TRUE for valid rows, e.g. age >= 0 & age <= 120" oninput='TVVALIDATE.updateRule(${rule.id}, "expr", this.value)'>${TV.escapeHtml(rule.expr || '')}</textarea>
        </div>`;
    }
    return '';
  }

  function needsColumn(rule) {
    return rule.type !== 'expr';
  }

  function renderRules() {
    const wrap = document.getElementById('validate-rules-builder');
    if (!wrap) return;
    if (!rules.length) {
      wrap.innerHTML = '<div class="tv-audit-empty">No validation rules yet. Add a rule to begin.</div>';
      return;
    }
    wrap.innerHTML = rules.map(rule => `
      <div class="tv-validate-rule">
        <div class="tv-validate-rule-head">
          <div class="tv-validate-rule-title">rule ${rule.id}</div>
          <button class="tv-remove-btn" type="button" onclick="TVVALIDATE.removeRule(${rule.id})" title="remove rule">×</button>
        </div>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:10px;line-height:1.6">
          ${ruleSummary(rule)}
        </div>
        <div class="tv-field">
          <label class="tv-field-label">label (optional)</label>
          <input class="tv-input" value="${TV.escapeAttr(rule.label || '')}" placeholder="e.g. record_id is required" oninput='TVVALIDATE.updateRule(${rule.id}, "label", this.value)'>
        </div>
        <div class="tv-plot-grid">
          <div class="tv-field">
            <label class="tv-field-label">rule type</label>
            <select class="tv-select" onchange='TVVALIDATE.updateType(${rule.id}, this.value)'>
              ${typeOptions(rule.type)}
            </select>
            <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:4px;line-height:1.5">
              ${ruleTypeHelp(rule.type)}
            </div>
          </div>
          ${needsColumn(rule) ? `
          <div class="tv-field">
            <label class="tv-field-label">column</label>
            <select class="tv-select" onchange='TVVALIDATE.updateRule(${rule.id}, "col", this.value)'>
              ${columnOptions(rule.col)}
            </select>
          </div>` : '<div></div>'}
        </div>
        ${extraFields(rule)}
      </div>
    `).join('');
  }

  function setStatus(message) {
    const el = document.getElementById('validate-status');
    if (el) el.textContent = message;
  }

  function renderOverview() {
    const wrap = document.getElementById('validate-overview');
    if (!wrap) return;
    const overview = result?.overview || {};
    const cards = [
      ['rows', overview.nrow || 0],
      ['rules', overview.rule_count || 0],
      ['passing rules', overview.passing_rules || 0],
      ['failing rules', overview.failing_rules || 0],
      ['rows passed', overview.rows_without_issues || 0],
      ['rows failed', overview.rows_with_issues || 0],
    ];
    if (overview.error_rules) cards.push(['error rules', overview.error_rules || 0]);
    wrap.innerHTML = cards.map(([label, value]) => `
      <div class="tv-audit-card">
        <div class="tv-audit-card-label">${TV.escapeHtml(label)}</div>
        <div class="tv-audit-card-value">${Number(value || 0).toLocaleString()}</div>
      </div>`).join('');
  }

  function renderIssueColumns() {
    const wrap = document.getElementById('validate-columns');
    if (!wrap) return;
    const items = result?.overview?.columns_with_issues || [];
    if (!items.length) {
      wrap.innerHTML = '<div class="tv-audit-empty">No column-level issues to show yet.</div>';
      return;
    }
    wrap.innerHTML = items.map(item => `
      <div class="tv-compare-item">
        <div class="tv-compare-head">
          <div class="tv-compare-label">${TV.escapeHtml(item.column || '')}</div>
          <div class="tv-compare-meta">${Number(item.failing_rows || 0).toLocaleString()} failing row(s)</div>
        </div>
      </div>
    `).join('');
  }

  function renderResults() {
    const wrap = document.getElementById('validate-results');
    if (!wrap) return;
    const items = result?.rules || [];
    if (!items.length) {
      wrap.innerHTML = '<div class="tv-audit-empty">Run validation to see rule results.</div>';
      return;
    }
    wrap.innerHTML = items.map(item => {
      const sample = Array.isArray(item.sample) && item.sample.length
        ? `<div class="tv-validate-sample">sample: ${TV.escapeHtml(item.sample.join(', '))}</div>`
        : '';
      return `
        <div class="tv-validate-result">
          <div class="tv-validate-result-head">
            <div>
              <div class="tv-validate-result-title">${TV.escapeHtml(item.label)}</div>
              <div class="tv-validate-result-sub">${TV.escapeHtml(item.detail || '')}</div>
            </div>
            <span class="tv-validate-status ${item.status === 'pass' ? 'pass' : 'fail'}">${TV.escapeHtml(item.status)}</span>
          </div>
          <div class="tv-audit-col-stats">
            <span>failing rows: ${Number(item.failing_n || 0).toLocaleString()}</span>
            <span>passing rows: ${Number(item.passing_n || 0).toLocaleString()}</span>
            <span>${TV.escapeHtml(item.type || '')}${item.column ? ` · ${TV.escapeHtml(item.column)}` : ''}</span>
          </div>
          ${sample}
        </div>`;
    }).join('');
  }

  function payloadRules() {
    return rules.map(rule => {
      const out = {
        type: rule.type,
        label: rule.label || '',
      };
      if (needsColumn(rule)) out.col = rule.col || '';
      if (rule.type === 'allowed') out.values = rule.values || '';
      if (rule.type === 'regex') {
        out.pattern = rule.pattern || '';
        out.ignore_case = !!rule.ignore_case;
      }
      if (rule.type === 'range') {
        out.min = rule.min || '';
        out.max = rule.max || '';
      }
      if (rule.type === 'expr') out.expr = rule.expr || '';
      return out;
    });
  }

  async function load() {
    if (!rules.length) {
      setStatus('Add at least one validation rule.');
      result = null;
      renderOverview();
      renderResults();
      renderIssueColumns();
      const preview = document.getElementById('validate-preview');
      if (preview) preview.textContent = '# add validation rules to build generated R';
      return;
    }
    setStatus('Running validation...');
    try {
      const res = await TV.api('validate_summary', { rules: payloadRules() });
      result = res;
      renderOverview();
      renderResults();
      renderIssueColumns();
      const preview = document.getElementById('validate-preview');
      if (preview) preview.textContent = res.code || '# validate unavailable';
      setStatus(
        `${Number(res.overview.rows_without_issues || 0).toLocaleString()} row(s) passed all checks; ` +
        `${Number(res.overview.rows_with_issues || 0).toLocaleString()} row(s) failed at least one rule; ` +
        `${Number(res.overview.failing_rules || 0).toLocaleString()} failing rule(s).`
      );
    } catch (e) {
      result = null;
      renderOverview();
      renderResults();
      renderIssueColumns();
      const preview = document.getElementById('validate-preview');
      if (preview) preview.textContent = '# validate unavailable';
      setStatus(e.message);
    }
  }

  function init() {
    counter = 0;
    result = null;
    rules = [emptyRule()];
    renderRules();
    renderOverview();
    renderResults();
    renderIssueColumns();
  }

  function addRule() {
    rules.push(emptyRule());
    renderRules();
  }

  function addRecipe(recipeType) {
    rules.push(recipeRule(recipeType));
    renderRules();
  }

  function removeRule(id) {
    rules = rules.filter(rule => rule.id !== id);
    renderRules();
    if (!rules.length) {
      result = null;
      renderOverview();
      renderResults();
      renderIssueColumns();
      setStatus('Add at least one validation rule.');
      const preview = document.getElementById('validate-preview');
      if (preview) preview.textContent = '# add validation rules to build generated R';
    }
  }

  function updateRule(id, field, value) {
    const rule = rules.find(item => item.id === id);
    if (!rule) return;
    rule[field] = value;
  }

  function updateType(id, nextType) {
    const rule = rules.find(item => item.id === id);
    if (!rule) return;
    rule.type = nextType;
    if (nextType === 'expr') rule.col = '';
    else if (nextType === 'not_future') rule.col = defaultDateColumn();
    else if (nextType === 'range' && !isDateType(columnType(rule.col))) rule.col = defaultNumericColumn();
    else if (nextType === 'allowed') rule.col = defaultTextColumn();
    else if (!rule.col) rule.col = defaultColumn();
    renderRules();
  }

  return { init, addRule, addRecipe, removeRule, updateRule, updateType, load };
})();
