/* tidyview ops_psgc.js - PSGC / area-name join panel */
'use strict';

TV.panels = TV.panels || {};

TV.panels.psgc = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const colOpts = cols.map(c =>
    `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${c.type})</option>`
  ).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6h12M4 10h12M4 14h12" stroke-linecap="round"/>
          <circle cx="6" cy="6" r="1.5"/>
          <circle cx="10" cy="10" r="1.5"/>
          <circle cx="14" cy="14" r="1.5"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">area names</div>
        <div class="tv-panel-sub">join PSGC area names with phscs</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>
    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Join official PSGC area names from <code>phscs</code> using either an existing
        <code>area_code</code> column or the component region/province/city/barangay codes.
      </div>
      <div class="tv-field">
        <label class="tv-field-label">join mode</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="psgc-mode-area" onclick="TVPSGC.setMode('area_code')">existing area_code</button>
          <button class="tv-chip" id="psgc-mode-build" onclick="TVPSGC.setMode('build')">build area_code</button>
        </div>
      </div>
      <div class="tv-field" id="psgc-area-field">
        <label class="tv-field-label">area_code column</label>
        <select class="tv-select" id="psgc-area-code" onchange="TVPSGC.updatePreview()">
          <option value="">choose column...</option>${colOpts}
        </select>
      </div>
      <div id="psgc-build-fields" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="tv-field">
            <label class="tv-field-label">region code</label>
            <select class="tv-select" id="psgc-region" onchange="TVPSGC.updatePreview()">
              <option value="">choose column...</option>${colOpts}
            </select>
          </div>
          <div class="tv-field">
            <label class="tv-field-label">province code</label>
            <select class="tv-select" id="psgc-province" onchange="TVPSGC.updatePreview()">
              <option value="">choose column...</option>${colOpts}
            </select>
          </div>
          <div class="tv-field">
            <label class="tv-field-label">city/municipality code</label>
            <select class="tv-select" id="psgc-city" onchange="TVPSGC.updatePreview()">
              <option value="">choose column...</option>${colOpts}
            </select>
          </div>
          <div class="tv-field">
            <label class="tv-field-label">barangay code</label>
            <select class="tv-select" id="psgc-barangay" onchange="TVPSGC.updatePreview()">
              <option value="">choose column...</option>${colOpts}
            </select>
          </div>
        </div>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">PSGC level</label>
        <select class="tv-select" id="psgc-level" onchange="TVPSGC.updatePreview()">
          <option value="barangays" selected>barangays</option>
          <option value="municipalities">municipalities</option>
          <option value="provinces">provinces</option>
          <option value="regions">regions</option>
        </select>
      </div>
      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="psgc-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="psgc-apply-btn">join area names ↗</button>
    </div>`;

  document.getElementById('psgc-apply-btn').addEventListener('click', TVPSGC.apply);
  TVPSGC.init(cols);
};


const TVPSGC = (() => {
  let mode = 'area_code';
  let inferred = {};

  function init(cols) {
    mode = 'area_code';
    inferred = {};
    cols.forEach(c => { inferred[c.name] = c.name; });
    setDefault('psgc-area-code', 'area_code');
    setDefault('psgc-region', 'region_code');
    setDefault('psgc-province', 'province_code');
    setDefault('psgc-city', 'city_mun_code');
    setDefault('psgc-barangay', 'barangay_code');
    updatePreview();
  }

  function setDefault(id, columnName) {
    const el = document.getElementById(id);
    if (el && inferred[columnName]) el.value = columnName;
  }

  function setMode(next) {
    mode = next;
    document.getElementById('psgc-mode-area')?.classList.toggle('selected', next === 'area_code');
    document.getElementById('psgc-mode-build')?.classList.toggle('selected', next === 'build');
    const areaField = document.getElementById('psgc-area-field');
    const buildFields = document.getElementById('psgc-build-fields');
    if (areaField) areaField.style.display = next === 'area_code' ? '' : 'none';
    if (buildFields) buildFields.style.display = next === 'build' ? '' : 'none';
    updatePreview();
  }

  function updatePreview() {
    const prev = document.getElementById('psgc-preview');
    if (!prev) return;
    const source = TV.rName(TV.state.name || 'DT');
    const level = document.getElementById('psgc-level')?.value || 'barangays';
    const lines = [`..tv_psgc <- phscs::get_psgc(level = ${TV.rString(level)})`];

    if (mode === 'area_code') {
      const areaCode = document.getElementById('psgc-area-code')?.value;
      if (!areaCode) {
        prev.textContent = '# choose an area_code column';
        return;
      }
      lines.push(`${source} <- merge(${source}, ..tv_psgc, by.x = ${TV.rString(areaCode)}, by.y = "area_code", all.x = TRUE, sort = FALSE)`);
    } else {
      const region = document.getElementById('psgc-region')?.value;
      const province = document.getElementById('psgc-province')?.value;
      const city = document.getElementById('psgc-city')?.value;
      const barangay = document.getElementById('psgc-barangay')?.value;
      if (!region || !province || !city || !barangay) {
        prev.textContent = '# choose the component area-code columns';
        return;
      }
      lines.push(`${source}[, area_code := paste0(as.character(${TV.rName(region)}), as.character(${TV.rName(province)}), as.character(${TV.rName(city)}), as.character(${TV.rName(barangay)}))]`);
      lines.push(`${source} <- merge(${source}, ..tv_psgc, by.x = "area_code", by.y = "area_code", all.x = TRUE, sort = FALSE)`);
    }

    prev.textContent = lines.join('\n');
  }

  async function apply() {
    const payload = {
      level: document.getElementById('psgc-level')?.value || 'barangays',
      minimal: true,
      harmonize: true,
    };

    if (mode === 'area_code') {
      payload.area_code = document.getElementById('psgc-area-code')?.value || '';
      if (!payload.area_code) {
        await TV.showMessage('Choose an area_code column first.', { title: 'Area Code Required' });
        return;
      }
    } else {
      payload.region_col = document.getElementById('psgc-region')?.value || '';
      payload.province_col = document.getElementById('psgc-province')?.value || '';
      payload.city_mun_col = document.getElementById('psgc-city')?.value || '';
      payload.barangay_col = document.getElementById('psgc-barangay')?.value || '';
      if (!payload.region_col || !payload.province_col || !payload.city_mun_col || !payload.barangay_col) {
        await TV.showMessage('Choose all four component area-code columns first.', { title: 'Area Columns Required' });
        return;
      }
    }

    try {
      const res = await TV.api('op_join_psgc', payload);
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Area-name join error:\n' + e.message);
    }
  }

  return { init, setMode, updatePreview, apply };
})();
