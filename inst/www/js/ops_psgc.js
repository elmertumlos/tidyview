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
        <div class="tv-panel-sub">join PSGC area names from bundled lookup</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>
    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Join official PSGC area names from tidyview's bundled PSGC reference using either an existing
        <code>area_code</code> column or the component PSGC codes needed for the level you want to convert.
      </div>
      <div class="tv-field">
        <label class="tv-field-label">join mode</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Use an existing <code>area_code</code> when you already have the full PSGC code, or build one from separate code parts.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="psgc-mode-area" onclick="TVPSGC.setMode('area_code')">existing area_code</button>
          <button class="tv-chip" id="psgc-mode-build" onclick="TVPSGC.setMode('build')">build area_code</button>
        </div>
      </div>
      <div class="tv-field" id="psgc-area-field">
        <label class="tv-field-label">area_code column</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Choose a column that already stores a PSGC code. Full 10-digit codes work best, and tidyview can derive higher levels from them automatically.
        </div>
        <select class="tv-select" id="psgc-area-code" onchange="TVPSGC.updatePreview()">
          <option value="">choose column...</option>${colOpts}
        </select>
        <div id="psgc-area-hint" style="display:none;font-size:11px;color:var(--md-primary);margin-top:8px;line-height:1.5"></div>
      </div>
      <div id="psgc-build-fields" style="display:none">
        <div id="psgc-build-help" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Choose the component columns needed to build the PSGC code for the selected level.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="tv-field" id="psgc-region-field">
            <label class="tv-field-label">region code</label>
            <select class="tv-select" id="psgc-region" onchange="TVPSGC.updatePreview()">
              <option value="">choose column...</option>${colOpts}
            </select>
          </div>
          <div class="tv-field" id="psgc-province-field">
            <label class="tv-field-label">province code</label>
            <select class="tv-select" id="psgc-province" onchange="TVPSGC.updatePreview()">
              <option value="">choose column...</option>${colOpts}
            </select>
          </div>
          <div class="tv-field" id="psgc-city-field">
            <label class="tv-field-label">city/municipality code</label>
            <select class="tv-select" id="psgc-city" onchange="TVPSGC.updatePreview()">
              <option value="">choose column...</option>${colOpts}
            </select>
          </div>
          <div class="tv-field" id="psgc-barangay-field">
            <label class="tv-field-label">barangay code</label>
            <select class="tv-select" id="psgc-barangay" onchange="TVPSGC.updatePreview()">
              <option value="">choose column...</option>${colOpts}
            </select>
          </div>
        </div>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">PSGC level</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Match the lookup level to the granularity of your codes, such as region, province, municipality, or barangay.
        </div>
        <select class="tv-select" id="psgc-level" onchange="TVPSGC.updatePreview()">
          <option value="barangays" selected>barangays</option>
          <option value="municipalities">municipalities</option>
          <option value="provinces">provinces</option>
          <option value="regions">regions</option>
        </select>
      </div>
      <div class="tv-field">
        <label class="tv-field-label">name column</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Choose the output name for the joined PSGC area-name column.
        </div>
        <input class="tv-input" id="psgc-name-col" value="barangay_name" style="font-family:var(--tv-type-mono);padding:7px 10px;font-size:12px" oninput="TVPSGC.updateNamePreference();TVPSGC.updatePreview()">
      </div>
      <div class="tv-field">
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--md-on-surface)">
          <input type="checkbox" id="psgc-keep-helper-cols" onchange="TVPSGC.updatePreview()">
          <span>
            keep helper PSGC columns
            <span style="display:block;font-size:11px;color:var(--md-on-surface-variant);line-height:1.5;margin-top:2px">
              Keep normalized helper fields like <code>area_code</code> and <code>area_code_old</code>. Leave this off if you only want the readable name column added.
            </span>
          </span>
        </label>
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
  let lastSuggestedName = 'barangay_name';
  let nameTouched = false;

  function normalizeLevel(value) {
    const key = String(value || 'barangays').toLowerCase();
    if (key === 'region') return 'regions';
    if (key === 'province') return 'provinces';
    if (key === 'municipality') return 'municipalities';
    if (key === 'barangay') return 'barangays';
    return key;
  }

  function requiredFields(level) {
    const normalized = normalizeLevel(level);
    if (normalized === 'regions') return ['region'];
    if (normalized === 'provinces') return ['region', 'province'];
    if (normalized === 'municipalities') return ['region', 'province', 'city'];
    return ['region', 'province', 'city', 'barangay'];
  }

  function levelLabel(level) {
    const normalized = normalizeLevel(level);
    if (normalized === 'regions') return 'region';
    if (normalized === 'provinces') return 'province';
    if (normalized === 'municipalities') return 'municipality';
    return 'barangay';
  }

  function significantLength(level) {
    const normalized = normalizeLevel(level);
    if (normalized === 'regions') return 2;
    if (normalized === 'provinces') return 5;
    if (normalized === 'municipalities') return 7;
    return 10;
  }

  function suggestedName(level) {
    return `${levelLabel(level)}_name`;
  }

  function syncSuggestedName(force = false) {
    const input = document.getElementById('psgc-name-col');
    if (!input) return;
    const level = document.getElementById('psgc-level')?.value || 'barangays';
    const next = suggestedName(level);
    const current = String(input.value || '').trim();
    if (force || !nameTouched || !current || current === lastSuggestedName) {
      input.value = next;
      nameTouched = false;
    }
    lastSuggestedName = next;
  }

  function updateNamePreference() {
    const input = document.getElementById('psgc-name-col');
    if (!input) return;
    nameTouched = String(input.value || '').trim() !== lastSuggestedName;
  }

  function updateBuildFieldVisibility() {
    const level = document.getElementById('psgc-level')?.value || 'barangays';
    const needed = new Set(requiredFields(level));
    const fieldMap = {
      region: document.getElementById('psgc-region-field'),
      province: document.getElementById('psgc-province-field'),
      city: document.getElementById('psgc-city-field'),
      barangay: document.getElementById('psgc-barangay-field'),
    };
    Object.keys(fieldMap).forEach(key => {
      const el = fieldMap[key];
      if (el) el.style.display = needed.has(key) ? '' : 'none';
    });
    syncSuggestedName();
    const help = document.getElementById('psgc-build-help');
    if (help) {
      const labelMap = {
        region: 'region code',
        province: 'province code',
        city: 'city/municipality code',
        barangay: 'barangay code',
      };
      const labels = requiredFields(level).map(key => labelMap[key]);
      help.textContent = `Choose the component columns needed for ${levelLabel(level)} lookup: ${labels.join(', ')}.`;
    }
  }

  function buildColumnsForLevel() {
    const level = document.getElementById('psgc-level')?.value || 'barangays';
    const values = {
      region: document.getElementById('psgc-region')?.value || '',
      province: document.getElementById('psgc-province')?.value || '',
      city: document.getElementById('psgc-city')?.value || '',
      barangay: document.getElementById('psgc-barangay')?.value || '',
    };
    return requiredFields(level).map(key => values[key]).filter(Boolean);
  }

  function componentShortcut(areaCode, level) {
    const normalized = normalizeLevel(level);
    const regionCol = inferred.region_code || '';
    const provinceCol = inferred.province_code || '';
    const cityCol = inferred.city_mun_code || '';
    const barangayCol = inferred.barangay_code || '';

    if (normalized === 'provinces' && areaCode === provinceCol && regionCol && provinceCol) {
      return {
        level: normalized,
        buildCols: [regionCol, provinceCol],
        fields: { region_col: regionCol, province_col: provinceCol },
        message: `Detected component codes. tidyview will build the full province PSGC code from ${regionCol} + ${provinceCol}.`,
      };
    }
    if (normalized === 'municipalities' && areaCode === cityCol && regionCol && provinceCol && cityCol) {
      return {
        level: normalized,
        buildCols: [regionCol, provinceCol, cityCol],
        fields: { region_col: regionCol, province_col: provinceCol, city_mun_col: cityCol },
        message: `Detected component codes. tidyview will build the full municipality PSGC code from ${regionCol} + ${provinceCol} + ${cityCol}.`,
      };
    }
    if (normalized === 'barangays' && areaCode === barangayCol && regionCol && provinceCol && cityCol && barangayCol) {
      return {
        level: normalized,
        buildCols: [regionCol, provinceCol, cityCol, barangayCol],
        fields: {
          region_col: regionCol,
          province_col: provinceCol,
          city_mun_col: cityCol,
          barangay_col: barangayCol,
        },
        message: `Detected component codes. tidyview will build the full barangay PSGC code from ${regionCol} + ${provinceCol} + ${cityCol} + ${barangayCol}.`,
      };
    }
    return null;
  }

  function setAreaHint(message = '') {
    const hint = document.getElementById('psgc-area-hint');
    if (!hint) return;
    hint.textContent = message;
    hint.style.display = message ? '' : 'none';
  }

  function addBuildPreview(lines, source, buildCols, nameCol) {
    const keepHelpers = !!document.getElementById('psgc-keep-helper-cols')?.checked;
    lines.push(`${source}[, ..tv_psgc_join_code := gsub(" ", "0", sprintf("%-10s", paste0(${buildCols.map(col => `as.character(${TV.rName(col)})`).join(', ')})), fixed = TRUE)]`);
    lines.push(`${source} <- merge(${source}, ..tv_psgc, by.x = "..tv_psgc_join_code", by.y = "area_code", all.x = TRUE, sort = FALSE)`);
    if (nameCol && nameCol !== 'area_name') lines.push(`data.table::setnames(${source}, "area_name", ${TV.rString(nameCol)})`);
    if (keepHelpers) {
      lines.push(`data.table::setnames(${source}, "..tv_psgc_join_code", "area_code")`);
    } else {
      lines.push(`${source}[, area_code_old := NULL]`);
      lines.push(`${source}[, ..tv_psgc_join_code := NULL]`);
    }
  }

  function init(cols) {
    mode = 'area_code';
    inferred = {};
    lastSuggestedName = 'barangay_name';
    nameTouched = false;
    cols.forEach(c => { inferred[c.name] = c.name; });
    setDefault('psgc-area-code', 'area_code');
    setDefault('psgc-region', 'region_code');
    setDefault('psgc-province', 'province_code');
    setDefault('psgc-city', 'city_mun_code');
    setDefault('psgc-barangay', 'barangay_code');
    syncSuggestedName(true);
    updateBuildFieldVisibility();
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
    updateBuildFieldVisibility();
    updatePreview();
  }

  function updatePreview() {
    const prev = document.getElementById('psgc-preview');
    if (!prev) return;
    updateBuildFieldVisibility();
    const source = TV.rName(TV.state.name || 'DT');
    const level = normalizeLevel(document.getElementById('psgc-level')?.value || 'barangays');
    const lines = [`..tv_psgc <- tidyview::tv_get_psgc(level = ${TV.rString(level)})`];

    if (mode === 'area_code') {
      const areaCode = document.getElementById('psgc-area-code')?.value;
      const nameCol = String(document.getElementById('psgc-name-col')?.value || '').trim();
      const keepHelpers = !!document.getElementById('psgc-keep-helper-cols')?.checked;
      if (!areaCode) {
        setAreaHint('');
        prev.textContent = '# choose an area_code column';
        return;
      }
      const shortcut = componentShortcut(areaCode, level);
      if (shortcut) {
        setAreaHint(shortcut.message);
        lines.push(`# ${shortcut.message}`);
        addBuildPreview(lines, source, shortcut.buildCols, nameCol);
      } else if (significantLength(level) < 10) {
        setAreaHint('');
        lines.push(`${source}[, ..tv_psgc_join_code := gsub(" ", "0", sprintf("%-10s", substr(as.character(${TV.rName(areaCode)}), 1, ${significantLength(level)})), fixed = TRUE)]`);
        lines.push(`${source} <- merge(${source}, ..tv_psgc, by.x = "..tv_psgc_join_code", by.y = "area_code", all.x = TRUE, sort = FALSE)`);
        if (nameCol && nameCol !== 'area_name') lines.push(`data.table::setnames(${source}, "area_name", ${TV.rString(nameCol)})`);
        if (keepHelpers) {
          lines.push(`data.table::setnames(${source}, "..tv_psgc_join_code", "area_code")`);
        } else {
          lines.push(`${source}[, area_code_old := NULL]`);
          lines.push(`${source}[, ..tv_psgc_join_code := NULL]`);
        }
      } else {
        setAreaHint('');
        lines.push(`${source} <- merge(${source}, ..tv_psgc, by.x = ${TV.rString(areaCode)}, by.y = "area_code", all.x = TRUE, sort = FALSE)`);
        if (nameCol && nameCol !== 'area_name') lines.push(`data.table::setnames(${source}, "area_name", ${TV.rString(nameCol)})`);
        if (!keepHelpers) lines.push(`${source}[, area_code_old := NULL]`);
      }
    } else {
      setAreaHint('');
      const buildCols = buildColumnsForLevel();
      const nameCol = String(document.getElementById('psgc-name-col')?.value || '').trim();
      if (buildCols.length !== requiredFields(level).length) {
        prev.textContent = '# choose the component PSGC code columns needed for this level';
        return;
      }
      addBuildPreview(lines, source, buildCols, nameCol);
    }

    prev.textContent = lines.join('\n');
  }

  async function apply() {
    const payload = {
      level: normalizeLevel(document.getElementById('psgc-level')?.value || 'barangays'),
      minimal: true,
      harmonize: true,
      name_col: String(document.getElementById('psgc-name-col')?.value || '').trim(),
      keep_helper_cols: !!document.getElementById('psgc-keep-helper-cols')?.checked,
    };

    if (mode === 'area_code') {
      payload.area_code = document.getElementById('psgc-area-code')?.value || '';
      if (!payload.area_code) {
        await TV.showMessage('Choose an area_code column first.', { title: 'Area Code Required' });
        return;
      }
      const shortcut = componentShortcut(payload.area_code, payload.level);
      if (shortcut) {
        payload.area_code = '';
        Object.assign(payload, shortcut.fields);
      }
    } else {
      payload.region_col = document.getElementById('psgc-region')?.value || '';
      payload.province_col = document.getElementById('psgc-province')?.value || '';
      payload.city_mun_col = document.getElementById('psgc-city')?.value || '';
      payload.barangay_col = document.getElementById('psgc-barangay')?.value || '';
      const needed = requiredFields(payload.level);
      const valueMap = {
        region: payload.region_col,
        province: payload.province_col,
        city: payload.city_mun_col,
        barangay: payload.barangay_col,
      };
      const labelMap = {
        region: 'region code',
        province: 'province code',
        city: 'city/municipality code',
        barangay: 'barangay code',
      };
      const missing = needed.filter(key => !valueMap[key]);
      if (missing.length) {
        await TV.showMessage(`Choose the required component code columns for ${levelLabel(payload.level)} lookup: ${missing.map(key => labelMap[key]).join(', ')}.`, { title: 'Area Columns Required' });
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

  return { init, setMode, updateNamePreference, updatePreview, apply };
})();
