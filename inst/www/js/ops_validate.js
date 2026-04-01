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

  function typeOptions(selected) {
    const items = [
      ['not_missing', 'not missing'],
      ['unique', 'unique'],
      ['allowed', 'allowed values'],
      ['regex', 'regex'],
      ['range', 'range'],
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
            <input class="tv-input" value="${TV.escapeAttr(rule.min || '')}" placeholder="e.g. 0 or 2024-01-01" oninput='TVVALIDATE.updateRule(${rule.id}, "min", this.value)'>
          </div>
          <div class="tv-field">
            <label class="tv-field-label">maximum (optional)</label>
            <input class="tv-input" value="${TV.escapeAttr(rule.max || '')}" placeholder="e.g. 120 or 2024-12-31" oninput='TVVALIDATE.updateRule(${rule.id}, "max", this.value)'>
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
      ['rows with issues', overview.rows_with_issues || 0],
      ['rows without issues', overview.rows_without_issues || 0],
    ];
    wrap.innerHTML = cards.map(([label, value]) => `
      <div class="tv-audit-card">
        <div class="tv-audit-card-label">${TV.escapeHtml(label)}</div>
        <div class="tv-audit-card-value">${Number(value || 0).toLocaleString()}</div>
      </div>`).join('');
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
      const preview = document.getElementById('validate-preview');
      if (preview) preview.textContent = res.code || '# validate unavailable';
      setStatus(`${Number(res.overview.failing_rules || 0).toLocaleString()} failing rule(s); ${Number(res.overview.rows_with_issues || 0).toLocaleString()} rows with issues.`);
    } catch (e) {
      result = null;
      renderOverview();
      renderResults();
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
  }

  function addRule() {
    rules.push(emptyRule());
    renderRules();
  }

  function removeRule(id) {
    rules = rules.filter(rule => rule.id !== id);
    renderRules();
    if (!rules.length) {
      result = null;
      renderOverview();
      renderResults();
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
    else if (!rule.col) rule.col = defaultColumn();
    renderRules();
  }

  return { init, addRule, removeRule, updateRule, updateType, load };
})();
