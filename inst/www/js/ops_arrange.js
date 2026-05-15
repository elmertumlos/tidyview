/* tidyview ops_arrange.js - arrange panel */
'use strict';

TV.panels = TV.panels || {};

TV.panels.arrange = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const colOpts = cols.map(c =>
    `<option value="${c.name}">${c.name} (${c.type})</option>`
  ).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="4" y1="6" x2="16" y2="6" stroke-linecap="round"/>
          <line x1="4" y1="10" x2="12" y2="10" stroke-linecap="round"/>
          <line x1="4" y1="14" x2="9" y2="14" stroke-linecap="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">arrange</div>
        <div class="tv-panel-sub">arrange(.data, col)</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Add arrange keys in priority order. First key takes precedence; subsequent keys break ties.
      </div>

      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:10px;line-height:1.5">
        Use the first key for your main sort, then add more keys only when rows still tie.
      </div>

      <div id="sort-rows" style="margin-bottom:8px"></div>

      <button class="tv-add-btn" id="add-sort-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
        </svg>
        add arrange key
      </button>

      <div style="margin-top:14px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="arrange-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface)">
          <span style="color:var(--md-on-surface-variant);font-style:italic">add an arrange key above...</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="arrange-apply-btn">apply arrange -></button>
    </div>`;

  document.getElementById('add-sort-btn').addEventListener('click', TVARRANGE.addRow);
  document.getElementById('arrange-apply-btn').addEventListener('click', TVARRANGE.apply);
  TVARRANGE.init(cols, colOpts);
  TVARRANGE.addRow();
};


const TVARRANGE = (() => {
  let cols = [], colOpts = '', rows = [];

  function init(_cols, _colOpts) { cols = _cols; colOpts = _colOpts; rows = []; }

  function addRow() {
    const id  = 'sr' + Date.now();
    rows.push(id);
    const container = document.getElementById('sort-rows');
    if (!container) return;

    const div = document.createElement('div');
    div.id = 'sort-row-' + id;
    div.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface)';
    div.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);font-weight:500;margin-bottom:4px">arrange key</div>
          <div style="font-size:12px;color:var(--md-on-surface)">Priority <span id="sort-num-${id}">${rows.length}</span></div>
        </div>
        <button onclick="TVARRANGE.removeRow('${id}')" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:var(--md-on-surface-variant);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0">x</button>
      </div>
      <div>
        <label class="tv-field-label" style="margin-bottom:4px">column</label>
        <select class="tv-select" id="sort-col-${id}" style="padding:7px 10px;font-size:12px" onchange="TVARRANGE.updatePreview()">${colOpts}</select>
      </div>
      <div>
        <label class="tv-field-label" style="margin-bottom:4px">direction</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="tv-chip selected" id="asc-${id}" onclick="TVARRANGE.setDir('${id}','asc')">asc</button>
          <button class="tv-chip" id="desc-${id}" onclick="TVARRANGE.setDir('${id}','desc')">desc</button>
        </div>
      </div>`;
    container.appendChild(div);
    div.querySelector(`#sort-num-${id}`).textContent = rows.length;
    updatePreview();
  }

  function setDir(id, dir) {
    document.getElementById('asc-'  + id)?.classList.toggle('selected', dir === 'asc');
    document.getElementById('desc-' + id)?.classList.toggle('selected', dir === 'desc');
    updatePreview();
  }

  function removeRow(id) {
    rows = rows.filter(r => r !== id);
    document.getElementById('sort-row-' + id)?.remove();
    rows.forEach((rid, i) => {
      const numEl = document.getElementById('sort-num-' + rid);
      if (numEl) numEl.textContent = i + 1;
    });
    updatePreview();
  }

  function buildSorts() {
    return rows
      .filter(id => document.getElementById('sort-row-' + id))
      .map(id => {
        const col  = document.getElementById('sort-col-' + id)?.value;
        const desc = document.getElementById('desc-' + id)?.classList.contains('selected');
        return { col, desc };
      })
      .filter(s => s.col);
  }

  function updatePreview() {
    const sorts = buildSorts();
    const prev  = document.getElementById('arrange-preview');
    if (!prev) return;
    if (!sorts.length) {
      prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">add a sort key above...</span>`;
      return;
    }
    const exprs = sorts.map(s => s.desc ? `-${s.col}` : s.col).join(', ');
    prev.textContent = `DT <- DT[order(${exprs})]`;
  }

  async function apply() {
    const sorts = buildSorts();
    if (!sorts.length) { await TV.showMessage('Add at least one arrange key.'); return; }
    const btn = document.getElementById('arrange-apply-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'applying...'; }
    try {
      const res = await TV.api('op_arrange', { sorts });
      TV.pushCode(res.code);
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Arrange error:\n' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'apply arrange ->'; }
    }
  }

  return { init, addRow, removeRow, setDir, updatePreview, apply };
})();
