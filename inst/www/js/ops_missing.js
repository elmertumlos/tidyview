/* tidyview ops_missing.js - missing-data dashboard */
'use strict';

TV.panels = TV.panels || {};

TV.panels.missing = function(pane) {
  if (!TV.state.dt || !TV.state.dt.length) {
    pane.innerHTML = `
      <div class="tv-panel-header">
        <div class="tv-panel-icon">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M10 3c2.8 3 4.8 5.6 4.8 8.3A4.8 4.8 0 1110 6.5a4.8 4.8 0 01-4.8 4.8C5.2 8.6 7.2 6 10 3z" stroke-linejoin="round"/>
          </svg>
        </div>
        <div><div class="tv-panel-title">missing</div><div class="tv-panel-sub">load data first</div></div>
        <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
      </div>
      <div class="tv-panel-body">
        <div style="font-size:13px;color:var(--md-on-surface-variant)">No data loaded.</div>
      </div>`;
    return;
  }

  const cols = window.__TV_COLS__ || [];
  const options = cols.map(col =>
    `<option value="${TV.escapeAttr(col.name)}">${TV.escapeHtml(col.name)} (${TV.escapeHtml(col.type)})</option>`
  ).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10 3c2.8 3 4.8 5.6 4.8 8.3A4.8 4.8 0 1110 6.5a4.8 4.8 0 01-4.8 4.8C5.2 8.6 7.2 6 10 3z" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">missing</div>
        <div class="tv-panel-sub">missing-data dashboard and grouped summaries</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Review where missing values appear, which columns are most affected, and how missingness changes across groups. Use the quick actions to move straight into cleanup.
      </div>

      <div class="tv-field" style="margin-top:0">
        <label class="tv-field-label">group summary (optional)</label>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="tv-select" id="missing-group-by" onchange="TVMISSING.load()">
            <option value="">no group summary</option>${options}
          </select>
          <button class="tv-btn-outlined" type="button" style="padding:8px 14px" onclick="TVMISSING.load()">refresh</button>
        </div>
      </div>

      <div class="tv-field">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="tv-chip" type="button" onclick="TV.openPanel('drop_na')">open drop_na</button>
          <button class="tv-chip" type="button" onclick="TV.openPanel('fill_na')">open replace_na</button>
          <button class="tv-chip" type="button" onclick="TVMISSING.copyFilterCode()">copy rows-with-missing code</button>
        </div>
      </div>

      <div id="missing-status" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:10px">Loading missing-data summary...</div>

      <div id="missing-overview" class="tv-audit-grid"></div>

      <div class="tv-compare-section">
        <div class="tv-compare-title">columns with missing values</div>
        <div id="missing-columns" class="tv-audit-columns"></div>
      </div>

      <div class="tv-compare-section">
        <div class="tv-compare-title">group summary</div>
        <div id="missing-groups" class="tv-compare-list"></div>
      </div>

      <div style="margin-top:14px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="missing-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap">
          <span style="color:var(--md-on-surface-variant);font-style:italic">loading missing-data code...</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">close</button>
    </div>`;

  TVMISSING.init();
};


const TVMISSING = (() => {
  let result = null;

  function groupBy() {
    return String(document.getElementById('missing-group-by')?.value || '').trim();
  }

  function setStatus(message) {
    const el = document.getElementById('missing-status');
    if (el) el.textContent = message;
  }

  function renderOverview() {
    const wrap = document.getElementById('missing-overview');
    if (!wrap) return;
    const overview = result?.overview || {};
    const cards = [
      ['rows', overview.nrow || 0],
      ['columns', overview.ncol || 0],
      ['rows with missing', overview.rows_with_missing || 0],
      ['rows without missing', overview.rows_without_missing || 0],
      ['columns with missing', overview.columns_with_missing || 0],
      ['missing cells', `${Number(overview.missing_cells || 0).toLocaleString()} (${overview.missing_pct || 0}%)`],
    ];
    wrap.innerHTML = cards.map(([label, value]) => `
      <div class="tv-audit-card">
        <div class="tv-audit-card-label">${TV.escapeHtml(label)}</div>
        <div class="tv-audit-card-value">${TV.escapeHtml(String(value))}</div>
      </div>`).join('');
  }

  function renderColumns() {
    const wrap = document.getElementById('missing-columns');
    if (!wrap) return;
    const columns = (result?.columns || []).filter(col => Number(col.missing_n || 0) > 0);
    if (!columns.length) {
      wrap.innerHTML = '<div class="tv-audit-empty">No missing values were found in this dataset.</div>';
      return;
    }
    wrap.innerHTML = columns.map(col => `
      <div class="tv-audit-col">
        <div class="tv-audit-col-head">
          <div>
            <div class="tv-audit-col-name">${TV.escapeHtml(col.name)}</div>
            ${col.label ? `<div class="tv-audit-col-label">${TV.escapeHtml(col.label)}</div>` : ''}
          </div>
          <span class="tv-type tv-type-${TV.escapeAttr(col.type)}">${TV.escapeHtml(col.type)}</span>
        </div>
        <div class="tv-audit-col-stats">
          <span>missing: ${Number(col.missing_n || 0).toLocaleString()} (${col.missing_pct || 0}%)</span>
          <span>distinct: ${Number(col.distinct_n || 0).toLocaleString()}</span>
        </div>
        <div class="tv-audit-col-summary">${TV.escapeHtml(col.summary || '')}</div>
        ${col.sample ? `<div class="tv-audit-col-meta">sample: ${TV.escapeHtml(col.sample.join(', '))}</div>` : ''}
      </div>
    `).join('');
  }

  function renderGroups() {
    const wrap = document.getElementById('missing-groups');
    if (!wrap) return;
    const groups = result?.group_summary || [];
    if (!groups.length) {
      wrap.innerHTML = '<div class="tv-audit-empty">Choose a group column above to compare missingness across groups.</div>';
      return;
    }
    wrap.innerHTML = groups.map(item => `
      <div class="tv-compare-item">
        <strong>${TV.escapeHtml(item.group || '(missing group)')}</strong>
        <span>rows: ${Number(item.rows || 0).toLocaleString()} | rows with missing: ${Number(item.rows_with_missing || 0).toLocaleString()} (${item.missing_row_pct || 0}%) | missing cells: ${Number(item.missing_cells || 0).toLocaleString()}</span>
      </div>
    `).join('');
  }

  async function load() {
    setStatus('Loading missing-data summary...');
    try {
      const res = await TV.api('missing_summary', { group_by: groupBy() || null });
      result = res;
      renderOverview();
      renderColumns();
      renderGroups();
      const preview = document.getElementById('missing-preview');
      if (preview) preview.textContent = res.code || 'missing_report <- tv_missing_summary(DT)';
      setStatus(`${Number(res.overview.rows_with_missing || 0).toLocaleString()} rows contain missing values across ${Number(res.overview.columns_with_missing || 0).toLocaleString()} column(s).`);
    } catch (e) {
      result = null;
      setStatus(e.message);
      const preview = document.getElementById('missing-preview');
      if (preview) preview.textContent = '# missing-data summary unavailable';
      renderOverview();
      renderColumns();
      renderGroups();
    }
  }

  function copyFilterCode() {
    const name = TV.rName(TV.state.name || 'DT');
    const code = `${name} <- ${name}[!stats::complete.cases(${name})]`;
    TV.copyToClipboard(code, 'rows-with-missing filter code');
  }

  function init() {
    result = null;
    load();
  }

  return { init, load, copyFilterCode };
})();
