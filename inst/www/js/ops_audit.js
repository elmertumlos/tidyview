/* tidyview ops_audit.js - data audit panel */
'use strict';

TV.panels = TV.panels || {};

TV.panels.audit = function(pane) {
  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10 3l5 2v4c0 3.3-2 5.8-5 7-3-1.2-5-3.7-5-7V5l5-2z" stroke-linejoin="round"/>
          <path d="M7 9.8l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">audit</div>
        <div class="tv-panel-sub">missing values, duplicates, distinct counts, and column summaries</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Review the active dataset before filtering, recoding, joining, or export. The audit updates from the full table, not just the visible page.
      </div>

      <div class="tv-field">
        <label class="tv-field-label">top values to show per column</label>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="tv-select" id="audit-top-n" style="max-width:110px" onchange="TVAUDIT.load()">
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="10">10</option>
          </select>
          <button class="tv-btn-outlined" type="button" style="padding:8px 14px" onclick="TVAUDIT.load()">refresh</button>
        </div>
      </div>

      <div id="audit-status" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:10px">Loading audit...</div>

      <div id="audit-overview" class="tv-audit-grid"></div>

      <div class="tv-field" style="margin-top:14px">
        <label class="tv-field-label">find a column in the audit</label>
        <input class="tv-input" id="audit-search" placeholder="search column names..." oninput="TVAUDIT.renderColumns()">
      </div>

      <div id="audit-columns" class="tv-audit-columns"></div>

      <div style="margin-top:14px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="audit-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap">
          <span style="color:var(--md-on-surface-variant);font-style:italic">loading audit code...</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">close</button>
    </div>`;

  TVAUDIT.init();
};


const TVAUDIT = (() => {
  let result = null;

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function topN() {
    return parseInt(document.getElementById('audit-top-n')?.value || '3', 10);
  }

  function setStatus(message) {
    const el = document.getElementById('audit-status');
    if (el) el.textContent = message;
  }

  function renderOverview() {
    const wrap = document.getElementById('audit-overview');
    if (!wrap) return;
    const overview = result?.overview || {};
    const typeCounts = overview.type_counts || {};
    const typeHtml = Object.keys(typeCounts).length
      ? Object.entries(typeCounts).map(([name, count]) =>
          `<span class="tv-audit-chip">${TV.escapeHtml(name)}: ${formatNumber(count)}</span>`
        ).join('')
      : '<span style="color:var(--md-on-surface-variant)">No columns loaded.</span>';

    const cards = [
      ['rows', formatNumber(overview.nrow)],
      ['columns', formatNumber(overview.ncol)],
      ['rows with missing', formatNumber(overview.rows_with_missing)],
      ['duplicate rows', formatNumber(overview.duplicate_rows)],
      ['missing cells', `${formatNumber(overview.missing_cells)} (${overview.missing_pct || 0}%)`],
      ['constant columns', formatNumber(overview.constant_columns)],
    ];

    wrap.innerHTML = cards.map(([label, value]) => `
      <div class="tv-audit-card">
        <div class="tv-audit-card-label">${TV.escapeHtml(label)}</div>
        <div class="tv-audit-card-value">${TV.escapeHtml(value)}</div>
      </div>`).join('') + `
      <div class="tv-audit-card tv-audit-card-wide">
        <div class="tv-audit-card-label">column types</div>
        <div class="tv-audit-card-meta">${typeHtml}</div>
      </div>`;
  }

  function renderColumns() {
    const wrap = document.getElementById('audit-columns');
    if (!wrap) return;
    const query = String(document.getElementById('audit-search')?.value || '').trim().toLowerCase();
    const columns = (result?.columns || []).filter(col =>
      !query || String(col.name || '').toLowerCase().includes(query)
    );

    if (!columns.length) {
      wrap.innerHTML = '<div class="tv-audit-empty">No audit columns match this search.</div>';
      return;
    }

    wrap.innerHTML = columns.map(col => {
      const sample = Array.isArray(col.sample) ? col.sample.filter(Boolean).join(', ') : '';
      const tops = Array.isArray(col.top_values) ? col.top_values.join('; ') : '';
      const summary = col.summary || tops || sample || 'No non-missing values';
      const label = col.label ? `<div class="tv-audit-col-label">${TV.escapeHtml(col.label)}</div>` : '';
      const minmax = col.min || col.max ? `
        <div class="tv-audit-col-meta">min: ${TV.escapeHtml(col.min || 'NA')} | max: ${TV.escapeHtml(col.max || 'NA')}</div>` : '';
      return `
        <div class="tv-audit-col">
          <div class="tv-audit-col-head">
            <div>
              <div class="tv-audit-col-name">${TV.escapeHtml(col.name)}</div>
              ${label}
            </div>
            <span class="tv-type tv-type-${TV.escapeAttr(col.type)}">${TV.escapeHtml(col.type)}</span>
          </div>
          <div class="tv-audit-col-stats">
            <span>missing: ${formatNumber(col.missing_n)} (${col.missing_pct || 0}%)</span>
            <span>distinct: ${formatNumber(col.distinct_n)}</span>
            <span>${col.constant ? 'constant' : 'varied'}</span>
          </div>
          <div class="tv-audit-col-summary">${TV.escapeHtml(summary)}</div>
          ${sample ? `<div class="tv-audit-col-meta">sample: ${TV.escapeHtml(sample)}</div>` : ''}
          ${minmax}
        </div>`;
    }).join('');
  }

  async function load() {
    setStatus('Loading audit...');
    try {
      const res = await TV.api('audit_summary', { top_n: topN() });
      result = res;
      const preview = document.getElementById('audit-preview');
      if (preview) preview.textContent = res.code || 'audit_report <- tv_audit(DT)';
      renderOverview();
      renderColumns();
      setStatus(`Audited ${formatNumber(res.overview?.nrow)} rows across ${formatNumber(res.overview?.ncol)} columns.`);
    } catch (e) {
      result = null;
      setStatus(e.message);
      const wrap = document.getElementById('audit-overview');
      if (wrap) wrap.innerHTML = '';
      const cols = document.getElementById('audit-columns');
      if (cols) cols.innerHTML = '<div class="tv-audit-empty">Audit could not be loaded.</div>';
      const preview = document.getElementById('audit-preview');
      if (preview) preview.textContent = '# audit unavailable';
    }
  }

  function init() {
    result = null;
    load();
  }

  return { init, load, renderColumns };
})();
