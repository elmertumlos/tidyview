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
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Choose how many frequent values or examples to show in each column summary card.
        </div>
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

      <div class="tv-compare-section">
        <div class="tv-compare-title">attention first</div>
        <div id="audit-highlights" class="tv-compare-list"></div>
      </div>

      <div class="tv-field" style="margin-top:14px">
        <label class="tv-field-label">find a column in the audit</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Search the audit display by column name without changing the underlying data.
        </div>
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

  function listValues(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
  }

  function scalarValue(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    const vals = listValues(value).filter(v => v != null && v !== '');
    return vals.length ? String(vals[0]) : '';
  }

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
      ['columns with missing', formatNumber(overview.columns_with_missing)],
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

  function renderHighlights() {
    const wrap = document.getElementById('audit-highlights');
    if (!wrap) return;
    const highlights = result?.highlights || {};
    const topMissing = Array.isArray(highlights.top_missing_columns) ? highlights.top_missing_columns : [];
    const constants = Array.isArray(highlights.constant_columns) ? highlights.constant_columns : [];
    const allMissing = Array.isArray(highlights.all_missing_columns) ? highlights.all_missing_columns : [];
    const items = [];

    if (topMissing.length) {
      items.push(`
        <div class="tv-compare-item">
          <strong>columns with the most missing values</strong>
          <span>${topMissing.map(col =>
            `${TV.escapeHtml(col.name)} (${formatNumber(col.missing_n)}; ${TV.escapeHtml(String(col.missing_pct || 0))}%)`
          ).join(' | ')}</span>
        </div>`);
    }

    if (allMissing.length) {
      items.push(`
        <div class="tv-compare-item">
          <strong>completely empty columns</strong>
          <span>${allMissing.map(col => TV.escapeHtml(col.name)).join(' | ')}</span>
        </div>`);
    }

    const stableConstants = constants.filter(col => !allMissing.some(empty => empty.name === col.name));
    if (stableConstants.length) {
      items.push(`
        <div class="tv-compare-item">
          <strong>constant columns</strong>
          <span>${stableConstants.map(col => TV.escapeHtml(col.name)).join(' | ')}</span>
        </div>`);
    }

    if (!items.length) {
      wrap.innerHTML = '<div class="tv-audit-empty">No obvious audit risks were found. Search below if you want to inspect specific columns.</div>';
      return;
    }

    wrap.innerHTML = items.join('');
  }

  function renderColumns() {
    const wrap = document.getElementById('audit-columns');
    if (!wrap) return;
    const query = String(document.getElementById('audit-search')?.value || '').trim().toLowerCase();
    const columns = (result?.columns || []).slice().sort((a, b) => {
      const missDiff = Number(b?.missing_n || 0) - Number(a?.missing_n || 0);
      if (missDiff !== 0) return missDiff;
      const missPctDiff = Number(b?.missing_pct || 0) - Number(a?.missing_pct || 0);
      if (missPctDiff !== 0) return missPctDiff;
      const constDiff = Number(!!b?.constant) - Number(!!a?.constant);
      if (constDiff !== 0) return constDiff;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    }).filter(col =>
      !query || String(col.name || '').toLowerCase().includes(query)
    );

    if (!columns.length) {
      wrap.innerHTML = '<div class="tv-audit-empty">No audit columns match this search.</div>';
      return;
    }

    wrap.innerHTML = columns.map(col => {
      const sample = listValues(col.sample).filter(Boolean).join(', ');
      const tops = listValues(col.top_values).filter(Boolean).join('; ');
      const summary = col.summary || tops || sample || 'No non-missing values';
      const flags = [];
      if (Number(col.missing_n || 0) >= Number(result?.overview?.nrow || 0) && Number(result?.overview?.nrow || 0) > 0) {
        flags.push('all values missing');
      } else if (Number(col.missing_pct || 0) >= 50) {
        flags.push('high missing');
      } else if (Number(col.missing_n || 0) > 0) {
        flags.push('some missing');
      }
      if (col.constant) flags.push('constant');
      const labelText = scalarValue(col.label);
      const minText = scalarValue(col.min);
      const maxText = scalarValue(col.max);
      const label = labelText ? `<div class="tv-audit-col-label">${TV.escapeHtml(labelText)}</div>` : '';
      const minmax = (minText || maxText) ? `
        <div class="tv-audit-col-meta">min: ${TV.escapeHtml(minText || 'NA')} | max: ${TV.escapeHtml(maxText || 'NA')}</div>` : '';
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
          ${Number(col.missing_n || 0) > 0 ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
              <button class="tv-chip" type="button" onclick='TV.openPanelForColumns("fill_na", ${JSON.stringify([col.name])})'>replace missing values</button>
              <button class="tv-chip" type="button" onclick='TV.openPanelForColumns("drop_na", ${JSON.stringify([col.name])})'>drop rows missing here</button>
            </div>` : ''}
          ${flags.length ? `<div class="tv-audit-col-meta">${TV.escapeHtml(flags.join(' | '))}</div>` : ''}
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
      renderHighlights();
      renderColumns();
      setStatus(`Audited ${formatNumber(res.overview?.nrow)} rows across ${formatNumber(res.overview?.ncol)} columns.`);
    } catch (e) {
      result = null;
      setStatus(e.message);
      const wrap = document.getElementById('audit-overview');
      if (wrap) wrap.innerHTML = '';
      const hi = document.getElementById('audit-highlights');
      if (hi) hi.innerHTML = '';
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
