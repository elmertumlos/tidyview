/* tidyview ops_join.js - join panel */
'use strict';

TV.panels.join = function(pane) {
  const cols = window.__TV_COLS__ || [];
  const envObjs = window.__ENV_OBJECTS__ || [];

  const colOpts = cols.map(c => `<option value="${TV.escapeAttr(c.name)}">${TV.escapeHtml(c.name)}</option>`).join('');
  const tables = envObjs.filter(o => o.type === 'table');
  const tblOpts = tables.map(o =>
    `<option value="${TV.escapeAttr(o.name)}">${TV.escapeHtml(o.name)} (${o.nrow}x${o.ncol})</option>`
  ).join('') || '<option value="">no tables in environment</option>';

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="7" cy="10" r="5"/><circle cx="13" cy="10" r="5"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">join</div>
        <div class="tv-panel-sub">inner_join() - left_join() - semi_join() - anti_join()</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div class="tv-field">
        <label class="tv-field-label">right-hand table (from R environment)</label>
        <select class="tv-select" id="join-right" onchange="TVJOIN.updatePreview()">${tblOpts}</select>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">join type</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px" id="join-type-grid">
          <button class="tv-chip selected" id="jt-inner" onclick="TVJOIN.setType('inner')">inner_join</button>
          <button class="tv-chip" id="jt-left" onclick="TVJOIN.setType('left')">left_join</button>
          <button class="tv-chip" id="jt-right" onclick="TVJOIN.setType('right')">right_join</button>
          <button class="tv-chip" id="jt-full" onclick="TVJOIN.setType('full')">full_join</button>
          <button class="tv-chip" id="jt-semi" onclick="TVJOIN.setType('semi')">semi_join</button>
          <button class="tv-chip" id="jt-anti" onclick="TVJOIN.setType('anti')">anti_join</button>
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">join keys</label>
        <div id="key-rows" style="margin-bottom:8px"></div>
        <button class="tv-add-btn" id="add-key-btn">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
          </svg>
          add key column
        </button>
      </div>

      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="join-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap">
          <span style="color:var(--md-on-surface-variant);font-style:italic">configure the join above...</span>
        </div>
      </div>
      <div id="join-impact" style="margin-top:8px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);font-size:11px;color:var(--md-on-surface-variant)">
        Choose a table and at least one key to preview the impact.
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="join-apply-btn">apply join -></button>
    </div>`;

  document.getElementById('add-key-btn').addEventListener('click', TVJOIN.addKeyRow);
  document.getElementById('join-apply-btn').addEventListener('click', TVJOIN.apply);
  TVJOIN.init(cols, colOpts);
  TVJOIN.addKeyRow();
};


const TVJOIN = (() => {
  let cols = [];
  let colOpts = '';
  let joinType = 'inner';
  let keyRows = [];
  let previewSeq = 0;

  function init(nextCols, nextColOpts) {
    cols = nextCols;
    colOpts = nextColOpts;
    joinType = 'inner';
    keyRows = [];
    previewSeq = 0;
  }

  function setType(nextType) {
    joinType = nextType;
    ['inner', 'left', 'right', 'full', 'semi', 'anti'].forEach(jt => {
      document.getElementById('jt-' + jt)?.classList.toggle('selected', jt === nextType);
    });
    updatePreview();
  }

  function addKeyRow() {
    const id = 'k' + Date.now() + Math.floor(Math.random() * 1000);
    keyRows.push(id);
    const container = document.getElementById('key-rows');
    if (!container) return;
    const div = document.createElement('div');
    div.id = 'key-row-' + id;
    div.style.cssText = 'display:grid;grid-template-columns:1fr 28px;gap:8px;align-items:center;margin-bottom:7px';
    div.innerHTML = `
      <select class="tv-select" id="key-col-${id}" style="padding:7px 10px;font-size:12px" onchange="TVJOIN.updatePreview()">${colOpts}</select>
      <button onclick="TVJOIN.removeKeyRow('${id}')" style="width:26px;height:26px;border-radius:50%;border:none;background:transparent;color:var(--md-on-surface-variant);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">x</button>`;
    container.appendChild(div);
    updatePreview();
  }

  function removeKeyRow(id) {
    keyRows = keyRows.filter(rowId => rowId !== id);
    document.getElementById('key-row-' + id)?.remove();
    updatePreview();
  }

  function selectedKeys() {
    return keyRows
      .filter(id => document.getElementById('key-row-' + id))
      .map(id => document.getElementById('key-col-' + id)?.value)
      .filter(Boolean);
  }

  function buildCode() {
    const right = document.getElementById('join-right')?.value || 'DT2';
    const left = TV.rName(TV.state.name || 'DT');
    const keys = selectedKeys();
    if (!keys.length) return null;

    const byStr = keys.length === 1 ? `"${keys[0]}"` : `c(${keys.map(k => `"${k}"`).join(', ')})`;
    if (joinType === 'semi' || joinType === 'anti') {
      const keyCols = keys.map(k => `"${k}"`).join(', ');
      return [
        `..tv_left <- data.table::copy(${left})`,
        '..tv_left[, ..tv_rowid__ := .I]',
        `..tv_keys <- unique(${TV.rName(right)}[, .(${keys.map(k => TV.rName(k)).join(', ')})])`,
        `..tv_hits <- merge(..tv_left[, c("..tv_rowid__", ${keyCols}), with = FALSE], ..tv_keys, by = ${byStr}, all = FALSE, sort = FALSE)`,
        joinType === 'semi'
          ? `${left} <- ..tv_left[..tv_rowid__ %in% unique(..tv_hits$..tv_rowid__)]`
          : `${left} <- ..tv_left[!(..tv_rowid__ %in% unique(..tv_hits$..tv_rowid__))]`,
        `${left}[, ..tv_rowid__ := NULL]`,
      ].join('\n');
    }

    const allX = joinType === 'left' || joinType === 'full';
    const allY = joinType === 'right' || joinType === 'full';
    return `${left} <- merge(${left}, ${TV.rName(right)}, by = ${byStr}, all.x = ${allX ? 'TRUE' : 'FALSE'}, all.y = ${allY ? 'TRUE' : 'FALSE'})`;
  }

  function updatePreview() {
    const prev = document.getElementById('join-preview');
    const impact = document.getElementById('join-impact');
    if (!prev) return;
    const code = buildCode();
    const right = document.getElementById('join-right')?.value || '';
    const keys = selectedKeys();
    if (code) prev.textContent = code;
    else prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">add at least one key column...</span>`;
    if (!impact) return;
    if (!right || !keys.length) {
      impact.textContent = 'Choose a table and at least one key to preview the impact.';
      return;
    }
    const seq = ++previewSeq;
    impact.textContent = 'Previewing impact...';
    TV.api('preview_op', { op: 'join', params: { right_name: right, by: keys, type: joinType } })
      .then(res => {
        if (seq !== previewSeq) return;
        impact.textContent = TV.formatImpactSummary(res, 'join');
      })
      .catch(e => {
        if (seq !== previewSeq) return;
        impact.textContent = e.message;
      });
  }

  async function apply() {
    const right = document.getElementById('join-right')?.value;
    const byCols = selectedKeys();
    if (!byCols.length || !right) {
      await TV.showMessage('Choose a table and at least one key.', { title: 'Join Incomplete' });
      return;
    }
    const btn = document.getElementById('join-apply-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'joining...';
    }
    try {
      const res = await TV.api('op_join', { right_name: right, by: byCols, type: joinType });
      TV.pushCode(res.code);
      TV.state.dt = res.columns;
      TV.state.nrow = res.nrow;
      TV.state.ncol = res.ncol;
      TV.updateDimLabel();
      TV.renderTable();
      TV.closePanel();
    } catch (e) {
      await TV.showError('Join error:\n' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'apply join ->';
      }
    }
  }

  return { init, setType, addKeyRow, removeKeyRow, updatePreview, apply };
})();
