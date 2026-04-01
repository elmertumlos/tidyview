/* tidyview ops_factors.js - factor and category tools */
'use strict';

TV.panels = TV.panels || {};

TV.panels.factors = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const colOpts = cols.map(c =>
    `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)} (${TV.escapeHtml(c.type)})</option>`
  ).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="6" cy="6" r="2"/>
          <circle cx="6" cy="14" r="2"/>
          <circle cx="14" cy="10" r="2"/>
          <path d="M8 6h6M8 14h6M12 10h4" stroke-linecap="round"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">factors</div>
        <div class="tv-panel-sub">collapse, lump, reorder, and reference levels</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div class="tv-field">
        <label class="tv-field-label">column</label>
        <select class="tv-select" id="factor-col" onchange="TVFACTORS.loadValues()">
          ${colOpts}
        </select>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">save result to</label>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="tv-chip selected" id="factor-same-btn" onclick="TVFACTORS.setTarget('same')">same column</button>
          <button class="tv-chip" id="factor-new-btn" onclick="TVFACTORS.setTarget('new')">new column</button>
        </div>
        <input class="tv-input" id="factor-new-col" placeholder="new column name" style="display:none;margin-top:6px" oninput="TVFACTORS.updatePreview()">
      </div>

      <div class="tv-field">
        <label class="tv-field-label">tool</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="factor-mode-collapse" onclick="TVFACTORS.setMode('collapse')">collapse</button>
          <button class="tv-chip" id="factor-mode-lump" onclick="TVFACTORS.setMode('lump')">lump rare</button>
          <button class="tv-chip" id="factor-mode-reorder" onclick="TVFACTORS.setMode('reorder')">reorder</button>
          <button class="tv-chip" id="factor-mode-reference" onclick="TVFACTORS.setMode('reference')">reference</button>
        </div>
      </div>

      <div class="tv-field" id="factor-as-factor-wrap">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px">
          <input type="checkbox" id="factor-as-factor" checked onchange="TVFACTORS.updatePreview()">
          store result as factor
        </label>
      </div>

      <div id="factor-collapse-section">
        <div class="tv-field">
          <label class="tv-field-label">collapse mapping</label>
          <textarea class="tv-input" id="factor-collapse-text" style="min-height:140px;font-family:var(--tv-type-mono);resize:vertical" oninput="TVFACTORS.updatePreview()" placeholder="Child = Infant, Toddler, Youth&#10;Adult = Parent, Guardian&#10;Senior = Elder"></textarea>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:4px;line-height:1.5">
            One output label per line. Format: <code>new label = old value 1, old value 2</code>
          </div>
        </div>
      </div>

      <div id="factor-lump-section" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="tv-field">
            <label class="tv-field-label">top n to keep</label>
            <input class="tv-input" id="factor-top-n" type="number" min="1" placeholder="e.g. 5" oninput="TVFACTORS.updatePreview()">
          </div>
          <div class="tv-field">
            <label class="tv-field-label">minimum count</label>
            <input class="tv-input" id="factor-min-count" type="number" min="1" placeholder="e.g. 10" oninput="TVFACTORS.updatePreview()">
          </div>
        </div>
        <div class="tv-field">
          <label class="tv-field-label">label for lumped categories</label>
          <input class="tv-input" id="factor-other-label" value="Other" oninput="TVFACTORS.updatePreview()">
        </div>
      </div>

      <div id="factor-reorder-section" style="display:none">
        <div class="tv-field">
          <label class="tv-field-label">order levels by</label>
          <select class="tv-select" id="factor-reorder-mode" onchange="TVFACTORS.updatePreview()">
            <option value="appearance">first appearance</option>
            <option value="alphabet_asc">alphabet A to Z</option>
            <option value="alphabet_desc">alphabet Z to A</option>
            <option value="freq_desc">most frequent first</option>
            <option value="freq_asc">least frequent first</option>
            <option value="custom">custom list</option>
          </select>
        </div>
        <div class="tv-field" id="factor-custom-levels-wrap" style="display:none">
          <label class="tv-field-label">custom level order</label>
          <textarea class="tv-input" id="factor-custom-levels" style="min-height:120px;font-family:var(--tv-type-mono);resize:vertical" oninput="TVFACTORS.updatePreview()" placeholder="High&#10;Medium&#10;Low"></textarea>
          <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:4px">One level per line. Unlisted values will be appended after your custom order.</div>
        </div>
      </div>

      <div id="factor-reference-section" style="display:none">
        <div class="tv-field">
          <label class="tv-field-label">reference level</label>
          <select class="tv-select" id="factor-reference-level" onchange="TVFACTORS.updatePreview()">
            <option value="">choose level...</option>
          </select>
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">current values</label>
        <div id="factor-values-hint" style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);font-size:11px;color:var(--md-on-surface-variant);line-height:1.6">loading values...</div>
      </div>

      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="factor-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap;word-break:break-word">
          <span style="color:var(--md-on-surface-variant);font-style:italic">configure the factor tool above...</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="factor-apply-btn">apply factors ↗</button>
    </div>`;

  TVFACTORS.init();
};

const TVFACTORS = (() => {
  let mode = 'collapse';
  let target = 'same';
  let values = [];

  function currentColumn() {
    return document.getElementById('factor-col')?.value || '';
  }

  function targetName() {
    const col = currentColumn();
    const newCol = document.getElementById('factor-new-col')?.value?.trim() || '';
    return target === 'new' ? newCol : col;
  }

  function asFactor() {
    return document.getElementById('factor-as-factor')?.checked ?? true;
  }

  function parseCollapseGroups() {
    const raw = document.getElementById('factor-collapse-text')?.value || '';
    return raw.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const idx = line.indexOf('=');
        if (idx === -1) return null;
        const to = line.slice(0, idx).trim();
        const from = line.slice(idx + 1).split(',').map(x => x.trim()).filter(Boolean);
        if (!to || !from.length) return null;
        return { to, from };
      })
      .filter(Boolean);
  }

  function customLevels() {
    return (document.getElementById('factor-custom-levels')?.value || '')
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);
  }

  function updateModeUI() {
    ['collapse', 'lump', 'reorder', 'reference'].forEach(name => {
      document.getElementById(`factor-mode-${name}`)?.classList.toggle('selected', name === mode);
      const section = document.getElementById(`factor-${name}-section`);
      if (section) section.style.display = name === mode ? '' : 'none';
    });
    const asFactorWrap = document.getElementById('factor-as-factor-wrap');
    if (asFactorWrap) asFactorWrap.style.display = ['collapse', 'lump'].includes(mode) ? '' : 'none';
    const customWrap = document.getElementById('factor-custom-levels-wrap');
    if (customWrap) customWrap.style.display = (document.getElementById('factor-reorder-mode')?.value === 'custom' && mode === 'reorder') ? '' : 'none';
  }

  function updateValuesHint() {
    const hint = document.getElementById('factor-values-hint');
    if (!hint) return;
    if (!values.length) {
      hint.textContent = 'No non-missing values found in this column yet.';
      return;
    }
    hint.textContent = values.slice(0, 12).join(' • ') + (values.length > 12 ? ` • +${values.length - 12} more` : '');
  }

  function fillReferenceOptions() {
    const sel = document.getElementById('factor-reference-level');
    if (!sel) return;
    sel.innerHTML = `<option value="">choose level...</option>` +
      values.map(v => `<option value="${TV.escapeAttr(v)}">${TV.escapeHtml(v)}</option>`).join('');
  }

  async function loadValues() {
    const col = currentColumn();
    values = [];
    updateValuesHint();
    fillReferenceOptions();
    if (!col) return;
    try {
      const res = await TV.api('col_values', { col });
      values = (res.values || []).map(v => String(v));
    } catch (e) {
      values = [];
    }
    updateValuesHint();
    fillReferenceOptions();
    updatePreview();
  }

  function previewCollapse(source, targetCol) {
    const groups = parseCollapseGroups();
    if (!groups.length) return '# add at least one collapse mapping';
    const tos = [];
    const froms = [];
    groups.forEach(group => {
      group.from.forEach(value => {
        tos.push(group.to);
        froms.push(value);
      });
    });
    const collapsed = values.map(v => {
      const hit = groups.find(group => group.from.includes(v));
      return hit ? hit.to : v;
    });
    const levelOrder = [...new Set([...groups.map(g => g.to), ...collapsed])];
    const lines = [
      `..tv_factor_lookup <- stats::setNames(c(${tos.map(TV.rString).join(', ')}), c(${froms.map(TV.rString).join(', ')}))`,
      `${source}[, ${TV.rName(targetCol)} := ..tv_factor_lookup[as.character(${TV.rName(currentColumn())})]]`,
      `${source}[is.na(${TV.rName(targetCol)}), ${TV.rName(targetCol)} := as.character(${TV.rName(currentColumn())})]`,
    ];
    if (asFactor()) {
      lines.push(`${source}[, ${TV.rName(targetCol)} := factor(${TV.rName(targetCol)}, levels = c(${levelOrder.map(TV.rString).join(', ')}))]`);
    }
    return lines.join('\n');
  }

  function previewLump(source, targetCol) {
    const sourceCol = `${source}[[${TV.rString(currentColumn())}]]`;
    const topN = document.getElementById('factor-top-n')?.value?.trim() || '';
    const minCount = document.getElementById('factor-min-count')?.value?.trim() || '';
    const otherLabel = document.getElementById('factor-other-label')?.value?.trim() || 'Other';
    if (!topN && !minCount) return '# enter top n or minimum count';
    const lines = [
      `..tv_counts <- sort(table(as.character(${sourceCol})), decreasing = TRUE)`,
      '..tv_keep <- names(..tv_counts)'
    ];
    if (minCount) lines.push(`..tv_keep <- names(..tv_counts)[..tv_counts >= ${minCount}]`);
    if (topN) lines.push(`..tv_keep <- head(..tv_keep, ${topN})`);
    lines.push(`${source}[, ${TV.rName(targetCol)} := data.table::fifelse(!is.na(as.character(${TV.rName(currentColumn())})) & !(as.character(${TV.rName(currentColumn())}) %in% ..tv_keep), ${TV.rString(otherLabel)}, as.character(${TV.rName(currentColumn())}))]`);
    if (asFactor()) {
      lines.push(`${source}[, ${TV.rName(targetCol)} := factor(${TV.rName(targetCol)}, levels = c(..tv_keep, ${TV.rString(otherLabel)}))]`);
    }
    return lines.join('\n');
  }

  function previewReorder(source, targetCol) {
    const sourceCol = `${source}[[${TV.rString(currentColumn())}]]`;
    const reorderMode = document.getElementById('factor-reorder-mode')?.value || 'appearance';
    if (reorderMode === 'custom') {
      const lvls = customLevels();
      if (!lvls.length) return '# add custom levels, one per line';
      return `${source}[, ${TV.rName(targetCol)} := factor(as.character(${TV.rName(currentColumn())}), levels = c(${lvls.map(TV.rString).join(', ')}))]`;
    }
    const levelExpr = {
      appearance: `unique(as.character(${sourceCol}))`,
      alphabet_asc: `sort(unique(as.character(${sourceCol})))`,
      alphabet_desc: `sort(unique(as.character(${sourceCol})), decreasing = TRUE)`,
      freq_desc: `names(sort(table(as.character(${sourceCol})), decreasing = TRUE))`,
      freq_asc: `names(sort(table(as.character(${sourceCol})), decreasing = FALSE))`,
    }[reorderMode] || `unique(as.character(${sourceCol}))`;
    return [
      `..tv_levels <- ${levelExpr}`,
      `${source}[, ${TV.rName(targetCol)} := factor(as.character(${TV.rName(currentColumn())}), levels = ..tv_levels)]`
    ].join('\n');
  }

  function previewReference(source, targetCol) {
    const ref = document.getElementById('factor-reference-level')?.value || '';
    if (!ref) return '# choose a reference level';
    const sourceCol = `${source}[[${TV.rString(currentColumn())}]]`;
    return [
      `..tv_levels <- unique(as.character(${sourceCol}))`,
      `..tv_levels <- c(${TV.rString(ref)}, setdiff(..tv_levels, ${TV.rString(ref)}))`,
      `${source}[, ${TV.rName(targetCol)} := factor(as.character(${TV.rName(currentColumn())}), levels = ..tv_levels)]`
    ].join('\n');
  }

  function updatePreview() {
    updateModeUI();
    const preview = document.getElementById('factor-preview');
    if (!preview) return;
    const source = TV.rName(TV.state.name || 'DT');
    const tgt = targetName();
    if (!currentColumn()) {
      preview.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">choose a column above...</span>`;
      return;
    }
    if (!tgt) {
      preview.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">enter a target column name...</span>`;
      return;
    }
    const code = mode === 'collapse' ? previewCollapse(source, tgt)
      : mode === 'lump' ? previewLump(source, tgt)
      : mode === 'reorder' ? previewReorder(source, tgt)
      : previewReference(source, tgt);
    preview.textContent = code;
  }

  function setMode(nextMode) {
    mode = nextMode;
    updatePreview();
  }

  function setTarget(nextTarget) {
    target = nextTarget;
    document.getElementById('factor-same-btn')?.classList.toggle('selected', nextTarget === 'same');
    document.getElementById('factor-new-btn')?.classList.toggle('selected', nextTarget === 'new');
    const input = document.getElementById('factor-new-col');
    if (input) input.style.display = nextTarget === 'new' ? '' : 'none';
    updatePreview();
  }

  async function apply() {
    const col = currentColumn();
    const tgt = targetName();
    if (!col) {
      await TV.showMessage('Choose a column first.');
      return;
    }
    if (!tgt) {
      await TV.showMessage('Enter a target column name.');
      return;
    }
    const payload = {
      col,
      mode,
      new_col: target === 'new' ? tgt : '',
      as_factor: asFactor(),
    };
    if (mode === 'collapse') {
      payload.groups = parseCollapseGroups();
      if (!payload.groups.length) {
        await TV.showMessage('Add at least one collapse mapping.');
        return;
      }
    } else if (mode === 'lump') {
      payload.top_n = document.getElementById('factor-top-n')?.value || '';
      payload.min_count = document.getElementById('factor-min-count')?.value || '';
      payload.other_label = document.getElementById('factor-other-label')?.value?.trim() || 'Other';
      if (!payload.top_n && !payload.min_count) {
        await TV.showMessage('Enter top n or minimum count for lumping.');
        return;
      }
    } else if (mode === 'reorder') {
      payload.order_by = document.getElementById('factor-reorder-mode')?.value || 'appearance';
      payload.levels = customLevels();
      if (payload.order_by === 'custom' && !payload.levels.length) {
        await TV.showMessage('Add at least one custom level.');
        return;
      }
    } else if (mode === 'reference') {
      payload.ref_level = document.getElementById('factor-reference-level')?.value || '';
      if (!payload.ref_level) {
        await TV.showMessage('Choose a reference level.');
        return;
      }
    }

    const btn = document.getElementById('factor-apply-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'applying...';
    }
    try {
      const res = await TV.api('op_factor', payload);
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Factor tools error: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'apply factors ↗';
      }
    }
  }

  function init() {
    mode = 'collapse';
    target = 'same';
    values = [];
    document.getElementById('factor-apply-btn')?.addEventListener('click', apply);
    document.getElementById('factor-col')?.addEventListener('change', loadValues);
    document.getElementById('factor-reorder-mode')?.addEventListener('change', updatePreview);
    document.getElementById('factor-reference-level')?.addEventListener('change', updatePreview);
    updatePreview();
    loadValues();
  }

  return { init, loadValues, setMode, setTarget, updatePreview, apply };
})();
