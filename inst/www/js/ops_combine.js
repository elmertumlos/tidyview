/* tidyview ops_combine.js */
'use strict';

TV.panels = TV.panels || {};

TV.panels.combine = function(pane) {
  if (!TV.state.dt) {
    pane.innerHTML = `
      <div class="tv-panel-header">
        <div class="tv-panel-icon">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="6" height="12" rx="1.5"/>
            <rect x="11" y="4" width="6" height="12" rx="1.5"/>
            <path d="M9 10h2" stroke-linecap="round"/>
          </svg>
        </div>
        <div><div class="tv-panel-title">combine</div><div class="tv-panel-sub">load data first</div></div>
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
          <rect x="3" y="4" width="6" height="12" rx="1.5"/>
          <rect x="11" y="4" width="6" height="12" rx="1.5"/>
          <path d="M9 10h2" stroke-linecap="round"/>
        </svg>
      </div>
      <div><div class="tv-panel-title">combine</div><div class="tv-panel-sub">bind_rows() or bind_cols()</div></div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>
    <div class="tv-panel-body">
      <div class="tv-field" style="margin-top:0">
        <label class="tv-field-label">combine method</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="combine-mode-rows" onclick="TVCOMBINE.setMode('rows')">bind_rows</button>
          <button class="tv-chip" id="combine-mode-cols" onclick="TVCOMBINE.setMode('cols')">bind_cols</button>
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">source</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="combine-source-session" onclick="TVCOMBINE.setSourceType('session')">open tab</button>
          <button class="tv-chip" id="combine-source-env" onclick="TVCOMBINE.setSourceType('env')">R environment</button>
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">dataset to combine with</label>
        <select class="tv-select" id="combine-source-select" onchange="TVCOMBINE.updatePreview()">
          <option value="">loading sources...</option>
        </select>
        <div id="combine-source-note" style="font-size:11px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.6"></div>
      </div>

      <div id="combine-rows-options">
        <div class="tv-field">
          <label class="tv-field-label">row binding options</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--md-on-surface)">
              <input type="checkbox" id="combine-use-names" checked onchange="TVCOMBINE.updatePreview()">
              use column names
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--md-on-surface)">
              <input type="checkbox" id="combine-fill" checked onchange="TVCOMBINE.updatePreview()">
              fill missing columns
            </label>
          </div>
        </div>
      </div>

      <div id="combine-cols-options" style="display:none">
        <div style="padding:10px 12px;background:var(--md-surface-variant);border-radius:var(--tv-radius-sm);font-size:11px;color:var(--md-on-surface-variant);line-height:1.6">
          bind_cols keeps row order. Both inputs must have the same number of rows. Duplicate column names are repaired automatically.
        </div>
      </div>

      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="combine-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap">
          <span style="color:var(--md-on-surface-variant);font-style:italic">choose a source above...</span>
        </div>
      </div>
      <div id="combine-impact" style="margin-top:8px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);font-size:11px;color:var(--md-on-surface-variant)">
        Choose a dataset above to preview the impact.
      </div>
    </div>
    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="combine-apply-btn" onclick="TVCOMBINE.apply()">apply combine -></button>
    </div>`;

  TVCOMBINE.init();
};

const TVCOMBINE = (() => {
  let mode = 'rows';
  let sourceType = 'session';
  let sources = { session: [], env: [] };
  let previewSeq = 0;

  function init() {
    mode = 'rows';
    sourceType = 'session';
    previewSeq = 0;
    refreshSources();
    TV.refreshEnvCache().then(() => refreshSources()).catch(() => refreshSources());
    syncModeUI();
  }

  function buildSessionSources() {
    return (TV.state.sessions || [])
      .filter(s => !s.active)
      .map(s => ({
        value: String(s.idx),
        name: s.name,
        label: `${s.name} (${s.nrow.toLocaleString()} x ${s.ncol})`,
        note: 'Uses another open tidyview tab as the second input.',
      }));
  }

  function buildEnvSources() {
    const objects = window.__ENV_OBJECTS__ || [];
    const out = [];
    objects.forEach(obj => {
      if (obj.type === 'list') {
        (obj.children || []).forEach(child => {
          out.push({
            value: JSON.stringify({ name: obj.name, element: child.name }),
            name: obj.name,
            element: child.name,
            label: `${obj.name}[[${child.name}]] (${child.nrow} x ${child.ncol})`,
            note: 'Loads a table-like item from your R environment.',
          });
        });
      } else {
        out.push({
          value: JSON.stringify({ name: obj.name, element: null }),
          name: obj.name,
          element: null,
          label: `${obj.name} (${obj.nrow} x ${obj.ncol})`,
          note: 'Loads a data object from your R environment.',
        });
      }
    });
    return out.filter(x => x.label.split(' (')[0] !== TV.state.name);
  }

  function refreshSources() {
    sources = {
      session: buildSessionSources(),
      env: buildEnvSources(),
    };
    renderSourceOptions();
    updatePreview();
  }

  function renderSourceOptions() {
    const select = document.getElementById('combine-source-select');
    const note = document.getElementById('combine-source-note');
    if (!select) return;
    const list = sources[sourceType] || [];
    if (!list.length) {
      select.innerHTML = `<option value="">no ${sourceType === 'session' ? 'other open tabs' : 'environment tables'} available</option>`;
      if (note) note.textContent = sourceType === 'session'
        ? 'Open another dataset tab first, or switch to R environment.'
        : 'No table-like objects were found in the R environment.';
      return;
    }
    select.innerHTML = list.map(entry =>
      `<option value="${TV.escapeAttr(entry.value)}">${TV.escapeHtml(entry.label)}</option>`
    ).join('');
    if (note) note.textContent = list[0].note || '';
  }

  function setMode(nextMode) {
    mode = nextMode;
    syncModeUI();
    updatePreview();
  }

  function setSourceType(nextType) {
    sourceType = nextType;
    document.getElementById('combine-source-session')?.classList.toggle('selected', sourceType === 'session');
    document.getElementById('combine-source-env')?.classList.toggle('selected', sourceType === 'env');
    renderSourceOptions();
    updatePreview();
  }

  function syncModeUI() {
    document.getElementById('combine-mode-rows')?.classList.toggle('selected', mode === 'rows');
    document.getElementById('combine-mode-cols')?.classList.toggle('selected', mode === 'cols');
    const rowsBox = document.getElementById('combine-rows-options');
    const colsBox = document.getElementById('combine-cols-options');
    if (rowsBox) rowsBox.style.display = mode === 'rows' ? '' : 'none';
    if (colsBox) colsBox.style.display = mode === 'cols' ? '' : 'none';
  }

  function currentSourceLabel() {
    const select = document.getElementById('combine-source-select');
    if (!select || !select.value) return '';
    return select.options[select.selectedIndex]?.text || '';
  }

  function currentCodeRef() {
    const select = document.getElementById('combine-source-select');
    if (!select || !select.value) return '';
    if (sourceType === 'session') {
      const entry = (sources.session || []).find(x => x.value === select.value);
      if (!entry) return '';
      return TV.rName(entry.name);
    }
    try {
      const parsed = JSON.parse(select.value);
      if (parsed.element) {
        return `data.table::as.data.table(${TV.rName(parsed.name)}[["${parsed.element}"]])`;
      }
      return `data.table::as.data.table(${TV.rName(parsed.name)})`;
    } catch (e) {
      return '';
    }
  }

  function updatePreview() {
    const prev = document.getElementById('combine-preview');
    const note = document.getElementById('combine-source-note');
    const select = document.getElementById('combine-source-select');
    const impact = document.getElementById('combine-impact');
    if (!prev) return;
    const list = sources[sourceType] || [];
    if (!select || !select.value || !list.length) {
      prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">choose a source above...</span>`;
      if (impact) impact.textContent = 'Choose a dataset above to preview the impact.';
      return;
    }
    const label = currentSourceLabel();
    const codeRef = currentCodeRef();
    if (note) {
      const entry = list[select.selectedIndex] || list[0];
      note.textContent = entry?.note || '';
    }
    if (mode === 'rows') {
      const useNames = document.getElementById('combine-use-names')?.checked !== false;
      const fill = document.getElementById('combine-fill')?.checked !== false;
      prev.textContent = `${TV.rName(TV.state.name || 'DT')} <- data.table::rbindlist(list(${TV.rName(TV.state.name || 'DT')}, ${codeRef}), use.names = ${String(useNames).toUpperCase()}, fill = ${String(fill).toUpperCase()})`;
    } else {
      prev.textContent = [
        `..tv_bound <- data.table::as.data.table(cbind(${TV.rName(TV.state.name || 'DT')}, ${codeRef}))`,
        'data.table::setnames(..tv_bound, make.unique(names(..tv_bound)))',
        `${TV.rName(TV.state.name || 'DT')} <- ..tv_bound`
      ].join('\n');
    }
    if (!impact) return;
    const payload = buildPayload();
    if (!payload) {
      impact.textContent = 'Choose a dataset above to preview the impact.';
      return;
    }
    const seq = ++previewSeq;
    impact.textContent = 'Previewing impact...';
    TV.api('preview_op', { op: 'combine', params: payload })
      .then(res => {
        if (seq !== previewSeq) return;
        impact.textContent = TV.formatImpactSummary(res, mode === 'rows' ? 'combine_rows' : 'combine_cols');
      })
      .catch(e => {
        if (seq !== previewSeq) return;
        impact.textContent = e.message;
      });
  }

  function buildPayload() {
    const select = document.getElementById('combine-source-select');
    if (!select || !select.value) return null;
    const payload = { mode };
    if (mode === 'rows') {
      payload.use_names = document.getElementById('combine-use-names')?.checked !== false;
      payload.fill = document.getElementById('combine-fill')?.checked !== false;
    }
    if (sourceType === 'session') {
      payload.source_type = 'session';
      payload.session_idx = parseInt(select.value, 10);
    } else {
      payload.source_type = 'env';
      const parsed = JSON.parse(select.value);
      payload.name = parsed.name;
      payload.element = parsed.element || null;
    }
    return payload;
  }

  async function apply() {
    const select = document.getElementById('combine-source-select');
    if (!select || !select.value) {
      await TV.showMessage('Choose a dataset to combine with.', { title: 'Combine Incomplete' });
      return;
    }
    const payload = buildPayload();
    if (!payload) {
      await TV.showMessage('Choose a dataset to combine with.', { title: 'Combine Incomplete' });
      return;
    }

    const btn = document.getElementById('combine-apply-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'combining...';
    }
    try {
      const res = await TV.api('op_combine', payload);
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol || TV.state.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Combine error: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'apply combine ->';
      }
    }
  }

  return { init, setMode, setSourceType, updatePreview, apply };
})();
