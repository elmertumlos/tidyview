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
        <div class="tv-panel-sub">match rows between two tables and bring columns together</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Choose another table, tell tidyview how rows should match, and preview what rows will stay, disappear, or expand.
      </div>

      <div class="tv-field">
        <label class="tv-field-label">table to bring in from the R environment</label>
        <select class="tv-select" id="join-right" onchange="TVJOIN.updatePreview()">${tblOpts}</select>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.5">
          Choose the lookup or reference table that has columns you want to add to the current table.
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">how should tidyview keep rows?</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          This choice decides whether unmatched rows are dropped, kept, or added from the other table.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px" id="join-type-grid">
          <button class="tv-chip selected" id="jt-inner" onclick="TVJOIN.setType('inner')">keep only matching rows</button>
          <button class="tv-chip" id="jt-left" onclick="TVJOIN.setType('left')">keep all current rows</button>
          <button class="tv-chip" id="jt-right" onclick="TVJOIN.setType('right')">follow the other table</button>
          <button class="tv-chip" id="jt-full" onclick="TVJOIN.setType('full')">keep rows from both tables</button>
          <button class="tv-chip" id="jt-semi" onclick="TVJOIN.setType('semi')">keep current rows that match</button>
          <button class="tv-chip" id="jt-anti" onclick="TVJOIN.setType('anti')">keep current rows with no match</button>
        </div>
        <div id="join-type-help" style="font-size:11px;color:var(--md-on-surface-variant);margin-top:8px;line-height:1.6">
          Only rows with matching keys in both tables will remain. Unmatched rows from the current table will be dropped.
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">columns that identify the same row in both tables</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Add the column names that should match between the current table and the table you selected above.
        </div>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          If a key repeats in either table, one row can match many rows and the result may expand.
        </div>
        <div id="key-rows" style="margin-bottom:8px"></div>
        <button class="tv-add-btn" id="add-key-btn">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
          </svg>
          add matching column
        </button>
      </div>

      <div style="margin-top:8px;padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm);background:var(--md-surface-variant)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">What This Will Do</div>
        <div id="join-source-summary" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:6px">Current table: "${TV.escapeHtml(TV.state.name || 'current table')}".</div>
        <div id="join-target-summary" style="font-size:12px;color:var(--md-on-surface);margin-bottom:6px">Result: choose another table and at least one matching column.</div>
        <div id="join-friendly-summary" style="font-size:11px;color:var(--md-on-surface);line-height:1.6;margin-bottom:10px">Choose how rows should match and tidyview will explain the result here.</div>
        <div id="join-impact" style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px">
          Choose a table and at least one matching column to preview the impact.
        </div>
        <div id="join-warning" style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.6;margin-bottom:10px">
          Join warnings will appear here once you choose a table and matching columns.
        </div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">Generated R</div>
        <div id="join-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap">
          <span style="color:var(--md-on-surface-variant);font-style:italic">configure the join above...</span>
        </div>
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
  let latestPreview = null;

  function init(nextCols, nextColOpts) {
    cols = nextCols;
    colOpts = nextColOpts;
    joinType = 'inner';
    keyRows = [];
    previewSeq = 0;
    latestPreview = null;
  }

  function joinTypeWarning(type) {
    const messages = {
      inner: 'Only rows with matching keys in both tables will remain. Unmatched rows from the current table will be dropped.',
      left: 'All rows from the current table stay. Matching columns are added from the other table. Duplicate keys on the right can expand rows.',
      right: 'Rows will follow the right-hand table. Unmatched rows from the current table can disappear.',
      full: 'Rows from either table can appear. Unmatched keys can create missing values in the result.',
      semi: 'Only current rows with a match in the other table will remain.',
      anti: 'Only current rows without a match in the other table will remain.',
    };
    return messages[type] || '';
  }

  function joinTypeFriendlyLabel(type) {
    const messages = {
      inner: 'keep only rows that match in both tables',
      left: 'keep every row from the current table',
      right: 'follow the rows from the other table',
      full: 'keep rows from either table',
      semi: 'keep current rows that have a match',
      anti: 'keep current rows that do not have a match',
    };
    return messages[type] || 'match rows between both tables';
  }

  function countLabel(n, singular, plural = singular + 's') {
    return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
  }

  function joinPreviewSummary(res, right, keys) {
    const base = `This will ${joinTypeFriendlyLabel(joinType)} by matching ${keys.join(', ')} between "${TV.state.name || 'current table'}" and "${right}".`;
    const matchedKeys = Number(res?.matched_keys || 0);
    const onlyLeftKeys = Number(res?.only_left_keys || 0);
    const onlyRightKeys = Number(res?.only_right_keys || 0);
    if (!matchedKeys && !onlyLeftKeys && !onlyRightKeys) {
      return base;
    }
    return `${base} Preview found ${countLabel(matchedKeys, 'matching key')}, ${countLabel(onlyLeftKeys, 'key')} only in the current table, and ${countLabel(onlyRightKeys, 'key')} only in "${right}".`;
  }

  function previewWarningText(res, right) {
    const beforeRows = Number(res?.before_nrow || 0);
    const afterRows = Number(res?.after_nrow || 0);
    const warnings = [joinTypeWarning(joinType)];
    const matchedKeys = Number(res?.matched_keys || 0);
    const onlyLeftKeys = Number(res?.only_left_keys || 0);
    const onlyRightKeys = Number(res?.only_right_keys || 0);
    const duplicateLeft = Number(res?.duplicate_keys_left || 0);
    const duplicateRight = Number(res?.duplicate_keys_right || 0);
    const manyToMany = Boolean(res?.many_to_many);

    if (matchedKeys === 0) {
      warnings.push('Preview found no matching keys yet, so this join will not line rows up until the key values overlap.');
    }
    if (onlyLeftKeys > 0) {
      if (['left', 'full'].includes(joinType)) {
        warnings.push(`${countLabel(onlyLeftKeys, 'key')} in the current table do not match "${right}", so added columns will be missing for those rows.`);
      } else if (joinType === 'anti') {
        warnings.push(`${countLabel(onlyLeftKeys, 'key')} only exist in the current table, so those unmatched rows are the ones this anti join will keep.`);
      } else if (['inner', 'semi', 'right'].includes(joinType)) {
        warnings.push(`${countLabel(onlyLeftKeys, 'key')} only exist in the current table, so some current rows will be excluded or treated as unmatched.`);
      }
    }
    if (onlyRightKeys > 0 && ['right', 'full'].includes(joinType)) {
      warnings.push(`${countLabel(onlyRightKeys, 'key')} only exist in "${right}", so new rows may come from the other table.`);
    }
    if (manyToMany && !['semi', 'anti'].includes(joinType)) {
      warnings.push('Both tables repeat some join keys, so this is behaving like a many-to-many join and can multiply rows quickly.');
    } else if (duplicateRight > 0 && ['inner', 'left', 'full'].includes(joinType)) {
      warnings.push(`${countLabel(duplicateRight, 'duplicate key row')} on "${right}" can expand matching current rows.`);
    } else if (duplicateLeft > 0 && ['inner', 'right', 'full'].includes(joinType)) {
      warnings.push(`${countLabel(duplicateLeft, 'duplicate key row')} in the current table will repeat any matching values from "${right}".`);
    }
    if (afterRows > beforeRows) {
      warnings.push('Preview shows row expansion, which usually means the join keys are duplicated in the other table.');
    } else if (afterRows < beforeRows && ['inner', 'right', 'semi', 'anti'].includes(joinType)) {
      warnings.push('Preview shows fewer rows than the current table, so some rows will be excluded.');
    }
    if (joinType === 'full' && afterRows > beforeRows) {
      warnings.push('New rows may come from keys that only exist in the other table.');
    }
    return warnings.join(' ');
  }

  function setType(nextType) {
    joinType = nextType;
    ['inner', 'left', 'right', 'full', 'semi', 'anti'].forEach(jt => {
      document.getElementById('jt-' + jt)?.classList.toggle('selected', jt === nextType);
    });
    const help = document.getElementById('join-type-help');
    if (help) help.textContent = joinTypeWarning(nextType);
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
    const warning = document.getElementById('join-warning');
    const targetSummary = document.getElementById('join-target-summary');
    const friendlySummary = document.getElementById('join-friendly-summary');
    if (!prev) return;
    const code = buildCode();
    const right = document.getElementById('join-right')?.value || '';
    const keys = selectedKeys();
    if (code) prev.textContent = code;
    else prev.innerHTML = `<span style="color:var(--md-on-surface-variant);font-style:italic">add at least one key column...</span>`;
    if (!impact) return;
    if (!right || !keys.length) {
      if (targetSummary) targetSummary.textContent = 'Result: choose another table and at least one matching column.';
      if (friendlySummary) friendlySummary.textContent = 'Choose how rows should match and tidyview will explain the result here.';
      impact.textContent = 'Choose a table and at least one matching column to preview the impact.';
      if (warning) warning.textContent = 'Join warnings will appear here once you choose a table and matching columns.';
      latestPreview = null;
      return;
    }
    if (targetSummary) {
      targetSummary.textContent = `Result: join "${TV.state.name || 'current table'}" with "${right}" using ${keys.join(', ')}.`;
    }
    if (friendlySummary) {
      friendlySummary.textContent = `This will ${joinTypeFriendlyLabel(joinType)} by matching ${keys.join(', ')} between "${TV.state.name || 'current table'}" and "${right}".`;
    }
    const seq = ++previewSeq;
    impact.textContent = 'Previewing impact...';
    if (warning) warning.textContent = joinTypeWarning(joinType);
    TV.api('preview_op', { op: 'join', params: { right_name: right, by: keys, type: joinType } })
      .then(res => {
        if (seq !== previewSeq) return;
        latestPreview = res;
        impact.textContent = TV.formatImpactSummary(res, 'join');
        if (friendlySummary) friendlySummary.textContent = joinPreviewSummary(res, right, keys);
        if (warning) warning.textContent = previewWarningText(res, right);
      })
      .catch(e => {
        if (seq !== previewSeq) return;
        latestPreview = null;
        impact.textContent = e.message;
        if (warning) warning.textContent = joinTypeWarning(joinType);
      });
  }

  async function apply() {
    const right = document.getElementById('join-right')?.value;
    const byCols = selectedKeys();
    if (!byCols.length || !right) {
      await TV.showMessage('Choose a table and at least one key.', { title: 'Join Incomplete' });
      return;
    }
    const preview = latestPreview;
    const beforeRows = Number(preview?.before_nrow || 0);
    const afterRows = Number(preview?.after_nrow || 0);
    if (preview && afterRows !== beforeRows) {
      const ok = await TV.confirmMessage(
        afterRows > beforeRows
          ? `This join expands the current table from ${beforeRows.toLocaleString()} to ${afterRows.toLocaleString()} rows. Continue?`
          : `This join reduces the current table from ${beforeRows.toLocaleString()} to ${afterRows.toLocaleString()} rows. Continue?`,
        { title: 'Review Join Impact', confirmLabel: 'apply' }
      );
      if (!ok) return;
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
