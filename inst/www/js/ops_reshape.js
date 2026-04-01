/* tidyview ops_reshape.js — pivot long / wide panel */
'use strict';

TV.panels.reshape = function(pane) {
  const cols    = window.__TV_COLS__ || [];
  const allOpts = cols.map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`).join('');
  const numOpts = cols.filter(c => ['int','dbl'].includes(c.type))
    .map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)}</option>`).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 10h12M13 7l3 3-3 3M7 7L4 10l3 3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">pivot</div>
        <div class="tv-panel-sub">pivot_longer() · pivot_wider()</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">✕</button>
    </div>

    <div class="tv-panel-body">
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="tv-chip selected" id="dir-longer" onclick="TVRESHAPE.setDir('longer')">pivot_longer</button>
        <button class="tv-chip" id="dir-wider" onclick="TVRESHAPE.setDir('wider')">pivot_wider</button>
      </div>

      <div id="reshape-longer">
        <div class="tv-field">
          <label class="tv-field-label">id columns (keep as-is)</label>
          <div id="id-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
          <select class="tv-select" id="id-add" onchange="TVRESHAPE.addId(this.value);this.value=''">
            <option value="">add id column…</option>${allOpts}
          </select>
        </div>
        <div class="tv-field">
          <label class="tv-field-label">measure columns (pivot these)</label>
          <div id="msr-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px"></div>
          <select class="tv-select" id="msr-add" onchange="TVRESHAPE.addMsr(this.value);this.value=''">
            <option value="">add measure column…</option>${allOpts}
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
          <label class="tv-field-label">row formula  (lhs ~ rhs)</label>
          <input class="tv-input" id="dcast-formula" placeholder="e.g. region ~ variable" style="font-family:var(--tv-type-mono);padding:7px 10px;font-size:12px" oninput="TVRESHAPE.updatePreview()">
        </div>
        <div class="tv-field">
          <label class="tv-field-label">value column</label>
          <select class="tv-select" id="dcast-val" onchange="TVRESHAPE.updatePreview()">${numOpts || allOpts}</select>
        </div>
      </div>

      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);margin-top:8px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="reshape-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface)">
          <span style="color:var(--md-on-surface-variant);font-style:italic">configure above…</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="reshape-apply-btn">apply ↗</button>
    </div>`;

  document.getElementById('reshape-apply-btn').addEventListener('click', TVRESHAPE.apply);
  TVRESHAPE.init();
};


const TVRESHAPE = (() => {
  let dir = 'longer', idCols = [], msrCols = [];

  function init() { dir = 'longer'; idCols = []; msrCols = []; }

  function setDir(d) {
    dir = d;
    document.getElementById('dir-longer')?.classList.toggle('selected', d === 'longer');
    document.getElementById('dir-wider')?.classList.toggle('selected',  d === 'wider');
    document.getElementById('reshape-longer').style.display = d === 'longer' ? 'block' : 'none';
    document.getElementById('reshape-wider').style.display  = d === 'wider'  ? 'block' : 'none';
    updatePreview();
  }

  function addId(col)  { if (col && !idCols.includes(col))  { idCols.push(col);  renderChips('id-chips',  idCols,  removeId);  updatePreview(); } }
  function addMsr(col) { if (col && !msrCols.includes(col)) { msrCols.push(col); renderChips('msr-chips', msrCols, removeMsr); updatePreview(); } }
  function removeId(col)  { idCols  = idCols.filter(c => c !== col);  renderChips('id-chips',  idCols,  removeId);  updatePreview(); }
  function removeMsr(col) { msrCols = msrCols.filter(c => c !== col); renderChips('msr-chips', msrCols, removeMsr); updatePreview(); }

  function renderChips(elId, arr, removeFn) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = arr.map(c => `
      <button class="tv-chip selected" onclick='TVRESHAPE.${removeFn === removeId ? "removeId" : "removeMsr"}(${JSON.stringify(c)})'>
        ${TV.escapeHtml(c)} <span style="margin-left:3px;opacity:.6">x</span>
      </button>`).join('');
  }

  function updatePreview() {
    const prev = document.getElementById('reshape-preview');
    if (!prev) return;
    let code;
    if (dir === 'longer') {
      if (!msrCols.length) { prev.innerHTML = `<span style="font-style:italic;color:var(--md-on-surface-variant)">add measure columns…</span>`; return; }
      const ids  = idCols.map(c => `"${c}"`).join(', ');
      const msrs = msrCols.map(c => `"${c}"`).join(', ');
      const vn   = document.getElementById('var-name')?.value || 'variable';
      const vl   = document.getElementById('val-name')?.value || 'value';
      code = `DT <- melt(DT,\n  id.vars = c(${ids}),\n  measure.vars = c(${msrs}),\n  variable.name = "${vn}",\n  value.name = "${vl}")`;
    } else {
      const formula = document.getElementById('dcast-formula')?.value || '. ~ variable';
      const valCol  = document.getElementById('dcast-val')?.value || 'value';
      code = `DT <- dcast(DT, ${formula}, value.var = "${valCol}")`;
    }
    prev.textContent = code;
  }

  async function apply() {
    const btn = document.getElementById('reshape-apply-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'applying…'; }
    try {
      let params;
      if (dir === 'longer') {
        params = { direction: 'longer', id_vars: idCols, measure_vars: msrCols,
          var_name: document.getElementById('var-name')?.value || 'variable',
          val_name: document.getElementById('val-name')?.value || 'value' };
      } else {
        params = { direction: 'wider',
          formula:   document.getElementById('dcast-formula')?.value,
          value_var: document.getElementById('dcast-val')?.value };
      }
      const res = await TV.api('op_reshape', params);
      TV.pushCode(res.code);
      TV.state.dt = res.columns; TV.state.nrow = res.nrow;
      TV.updateDimLabel(); TV.renderTable(); TV.closePanel();
    } catch(e) { await TV.showError('Reshape error:\n' + e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'apply ↗'; } }
  }

  return { init, setDir, addId, addMsr, removeId, removeMsr, updatePreview, apply };
})();
