/* tidyview ops_plot.js - phase 1 base R plot builder */
'use strict';

TV.panels = TV.panels || {};

TV.panels.plot = function(pane) {
  if (!TV.state.dt || !TV.state.dt.length) {
    pane.innerHTML = `
      <div class="tv-panel-header">
        <div class="tv-panel-icon">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 15h12" stroke-linecap="round"/>
            <path d="M5 13l3-4 3 2 4-5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div><div class="tv-panel-title">plot</div><div class="tv-panel-sub">load data first</div></div>
        <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
      </div>
      <div class="tv-panel-body">
        <div style="font-size:13px;color:var(--md-on-surface-variant)">No data loaded.</div>
      </div>`;
    return;
  }

  const cols = window.__TV_COLS__ || [];
  const options = cols.map(col =>
    `<option value="${TV.escapeAttr(col.name)}">${TV.escapeHtml(col.name)} (${col.type})</option>`
  ).join('');

  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 15h12" stroke-linecap="round"/>
          <path d="M5 13l3-4 3 2 4-5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="5" cy="13" r="1"/>
          <circle cx="8" cy="9" r="1"/>
          <circle cx="11" cy="11" r="1"/>
          <circle cx="15" cy="6" r="1"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">plot</div>
        <div class="tv-panel-sub">phase 1 base R chart builder</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">
      <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:14px;line-height:1.6">
        Build simple plots with base R and add the generated code to your script. This first phase focuses on bar, histogram, scatter, line, and boxplot workflows.
      </div>

      <div class="tv-field" style="margin-top:0">
        <label class="tv-field-label">chart type</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Start with the question you want to answer: counts, distribution, relationship, trend, or grouped spread.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tv-chip selected" id="plot-type-bar" onclick="TVPLOT.setType('bar')">bar</button>
          <button class="tv-chip" id="plot-type-histogram" onclick="TVPLOT.setType('histogram')">histogram</button>
          <button class="tv-chip" id="plot-type-scatter" onclick="TVPLOT.setType('scatter')">scatter</button>
          <button class="tv-chip" id="plot-type-line" onclick="TVPLOT.setType('line')">line</button>
          <button class="tv-chip" id="plot-type-boxplot" onclick="TVPLOT.setType('boxplot')">boxplot</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
          <button class="tv-btn-outlined" type="button" onclick="TVPLOT.applySuggestedColumns()">use suggested columns</button>
          <div id="plot-suggestion-note" style="font-size:11px;color:var(--md-on-surface-variant);line-height:1.5">
            tidyview can suggest columns that fit the selected chart type.
          </div>
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">x column</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Use the x column for categories, order, or the main numeric variable you want to plot first.
        </div>
        <select class="tv-select" id="plot-x" onchange="TVPLOT.updatePreview()">
          <option value="">choose column...</option>${options}
        </select>
      </div>

      <div class="tv-field" id="plot-y-field" style="display:none">
        <label class="tv-field-label">y column</label>
        <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
          Choose a y column when the chart compares one variable against another, such as scatter, line, or boxplot.
        </div>
        <select class="tv-select" id="plot-y" onchange="TVPLOT.updatePreview()">
          <option value="">choose column...</option>${options}
        </select>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">title (optional)</label>
        <input class="tv-input" id="plot-title" placeholder="leave blank for a sensible default" oninput="TVPLOT.updatePreview()">
      </div>

      <div class="tv-plot-grid">
        <div class="tv-field">
          <label class="tv-field-label">x label (optional)</label>
          <input class="tv-input" id="plot-xlab" placeholder="leave blank for column name" oninput="TVPLOT.updatePreview()">
        </div>
        <div class="tv-field">
          <label class="tv-field-label">y label (optional)</label>
          <input class="tv-input" id="plot-ylab" placeholder="leave blank for a sensible default" oninput="TVPLOT.updatePreview()">
        </div>
      </div>

      <div class="tv-plot-grid">
        <div class="tv-field">
          <label class="tv-field-label">colour</label>
          <div style="font-size:11px;color:var(--md-on-surface-variant);margin-bottom:8px;line-height:1.5">
            Use a basic color name like <code>steelblue</code> or a hex code like <code>#2F6BFF</code>.
          </div>
          <input class="tv-input" id="plot-colour" value="${TV.escapeAttr(TVPLOT.defaultColour())}" oninput="TVPLOT.updatePreview()">
        </div>
        <div class="tv-field">
          <label class="tv-field-label">note</label>
          <div class="tv-plot-note" id="plot-note">Choose a chart type and columns to build plot code.</div>
        </div>
      </div>

      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">generated R</div>
        <div id="plot-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface);white-space:pre-wrap"></div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">close</button>
      <button class="tv-btn-filled" type="button" onclick="TVPLOT.addToScript()">add plot code</button>
    </div>`;

  TVPLOT.init();
};

const TVPLOT = (() => {
  let type = 'bar';

  function cols() {
    return window.__TV_COLS__ || [];
  }

  function defaultColour() {
    const root = document.documentElement;
    const fromCss = getComputedStyle(root).getPropertyValue('--md-primary').trim();
    return fromCss || '#534AB7';
  }

  function colMeta(name) {
    return cols().find(col => col.name === name) || null;
  }

  function isNumericType(colType) {
    return ['int', 'integer', 'dbl', 'numeric'].includes(String(colType || '').toLowerCase());
  }

  function isDateType(colType) {
    return ['date', 'idate', 'posixct', 'itime'].includes(String(colType || '').toLowerCase());
  }

  function isCategoricalType(colType) {
    return ['chr', 'character', 'factor', 'lgl', 'logical'].includes(String(colType || '').toLowerCase());
  }

  function isIdentifierLikeName(name) {
    const key = String(name || '').toLowerCase();
    return /(^id$|_id$|^uuid$|_uuid$|serial|record_id|person_id|household_id|map_uuid|code$)/.test(key);
  }

  function normalizeConceptName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/^[a-z]\d+_/, '')
      .replace(/_group(_.*)?$/, '')
      .replace(/_(level|status|type|code|month|day|year|count|number|total)$/, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function areTooSimilarForPair(xName, yName) {
    const left = normalizeConceptName(xName);
    const right = normalizeConceptName(yName);
    if (!left || !right) return false;
    return left === right || left.startsWith(`${right}_`) || right.startsWith(`${left}_`);
  }

  function scoreColumnPreference(col, role) {
    if (!col) return -999;
    const name = String(col.name || '').toLowerCase();
    let score = 0;
    const looksPersonalName = /(first_name|last_name|middle_name|suffix|^name$|_name$)/.test(name);
    const looksLocation = /(region|province|city|municipality|barangay|country)/.test(name);
    const looksCategory = /(group|status|type|relation|sex|gender|marital|religion|ethnicity|literacy|level|class|citizenship|occupation|industry|reason|participation|employment|worker|farmer|fisherfolk|pwd|solo_parent|school|disability)/.test(name);
    const looksMeasure = /(age|income|amount|score|count|total|value|hours|year|rate|percent|pct|number)/.test(name);
    const looksWeakOrder = /(day|month)/.test(name) && !/(date_of_movement_month|months_since|monthly)/.test(name);

    if (role === 'category') {
      if (isCategoricalType(col.type)) score += 4;
      if (isDateType(col.type)) score -= 2;
      if (looksLocation) score += 7;
      if (looksCategory) score += 7;
      if (/label/.test(name)) score += 4;
      if (looksMeasure) score -= 2;
      if (looksPersonalName) score -= 10;
      if (isIdentifierLikeName(name)) score -= 8;
      if (isNumericType(col.type) && looksCategory) score += 5;
    } else if (role === 'ordered') {
      if (isDateType(col.type)) score += 6;
      if (isNumericType(col.type)) score += 4;
      if (/date|year|time/.test(name)) score += 6;
      if (/age|score|income|amount|count|total|value|hours/.test(name)) score += 3;
      if (/group/.test(name)) score -= 4;
      if (/age_group/.test(name)) score -= 4;
      if (looksWeakOrder) score -= 4;
      if (looksPersonalName) score -= 10;
      if (looksCategory) score -= 3;
      if (isIdentifierLikeName(name)) score -= 6;
    } else if (role === 'numeric') {
      if (isNumericType(col.type)) score += 6;
      if (looksMeasure) score += 3;
      if (looksWeakOrder) score -= 2;
      if (looksPersonalName) score -= 10;
      if (looksCategory) score -= 1;
      if (isIdentifierLikeName(name)) score -= 4;
    }

    return score;
  }

  function sortByPreference(items, role) {
    return items.slice().sort((a, b) => {
      const diff = scoreColumnPreference(b, role) - scoreColumnPreference(a, role);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  function vectorExpr(colName) {
    const dataName = TV.rName(TV.state.name || 'DT');
    return `${dataName}[[${TV.rString(colName)}]]`;
  }

  function stringExpr(colName) {
    return `as.character(${vectorExpr(colName)})`;
  }

  function numericExpr(colName) {
    return `as.numeric(${vectorExpr(colName)})`;
  }

  function value(id) {
    return String(document.getElementById(id)?.value || '').trim();
  }

  function defaultTitle(nextType, xCol, yCol) {
    if (nextType === 'bar') return xCol ? `Count of ${xCol}` : 'Bar chart';
    if (nextType === 'histogram') return xCol ? `Distribution of ${xCol}` : 'Histogram';
    if (nextType === 'scatter') return xCol && yCol ? `${yCol} vs ${xCol}` : 'Scatter plot';
    if (nextType === 'line') return xCol && yCol ? `${yCol} over ${xCol}` : 'Line chart';
    if (nextType === 'boxplot') return yCol && xCol ? `${yCol} by ${xCol}` : 'Boxplot';
    return 'Plot';
  }

  function defaultYLabel(nextType, yCol) {
    if (nextType === 'bar') return 'Count';
    if (nextType === 'histogram') return 'Frequency';
    if (nextType === 'scatter' || nextType === 'line' || nextType === 'boxplot') return yCol || 'Value';
    return 'Value';
  }

  function quotedOrDefault(inputValue, fallback) {
    return TV.rString(inputValue || fallback || '');
  }

  function suggestColumns(nextType = type) {
    const allCols = cols();
    const numericCols = sortByPreference(allCols.filter(col => isNumericType(col.type)), 'numeric');
    const dateCols = sortByPreference(allCols.filter(col => isDateType(col.type)), 'ordered');
    const categoricalCols = sortByPreference(allCols.filter(col => isCategoricalType(col.type)), 'category');
    const discreteCols = sortByPreference(
      [...categoricalCols, ...dateCols.filter(col => !categoricalCols.some(x => x.name === col.name))],
      'category'
    );
    const orderedCols = sortByPreference(
      [...dateCols, ...numericCols.filter(col => !dateCols.some(x => x.name === col.name))],
      'ordered'
    );

    if (nextType === 'bar') {
      const x = (discreteCols[0] || numericCols[0] || allCols[0] || {}).name || '';
      return {
        x,
        y: '',
        note: x
          ? `Suggested x column: ${x}. Bar charts count the distinct values in one column.`
          : 'No columns available to suggest for a bar chart.'
      };
    }

    if (nextType === 'histogram') {
      const x = (numericCols[0] || {}).name || '';
      return {
        x,
        y: '',
        note: x
          ? `Suggested x column: ${x}. Histograms work best with one numeric column.`
          : 'No numeric column found yet for a histogram.'
      };
    }

    if (nextType === 'scatter') {
      const pair = numericCols.slice(0, 2);
      const x = (pair[0] || dateCols[0] || numericCols[0] || {}).name || '';
      const y = (pair[1] || numericCols.find(col => col.name !== x) || {}).name || '';
      return {
        x,
        y,
        note: x && y
          ? `Suggested x and y columns: ${x} and ${y}. Scatter plots compare two numeric variables row by row.`
          : 'Choose two numeric columns for a scatter plot.'
      };
    }

    if (nextType === 'line') {
      const x = (orderedCols[0] || {}).name || '';
      const y = (
        numericCols.find(col => col.name !== x && !areTooSimilarForPair(x, col.name)) ||
        numericCols.find(col => col.name !== x) ||
        numericCols[0] ||
        {}
      ).name || '';
      return {
        x,
        y,
        note: x && y
          ? `Suggested x and y columns: ${x} and ${y}. Line charts work best with ordered x values and a numeric y column.`
          : 'Choose an ordered x column plus a numeric y column for a line chart.'
      };
    }

    const x = (categoricalCols[0] || discreteCols[0] || {}).name || '';
    const y = (numericCols.find(col => col.name !== x) || numericCols[0] || {}).name || '';
    return {
      x,
      y,
      note: x && y
        ? `Suggested group and value columns: ${x} and ${y}. Boxplots show numeric spread within groups.`
        : 'Choose a grouping column plus a numeric value column for a boxplot.'
    };
  }

  function readSpec() {
    return {
      type,
      x: value('plot-x'),
      y: value('plot-y'),
      title: value('plot-title'),
      xlab: value('plot-xlab'),
      ylab: value('plot-ylab'),
      colour: value('plot-colour') || defaultColour(),
    };
  }

  function buildCode() {
    const spec = readSpec();
    const xMeta = colMeta(spec.x);
    const yMeta = colMeta(spec.y);
    const main = quotedOrDefault(spec.title, defaultTitle(spec.type, spec.x, spec.y));
    const xlab = quotedOrDefault(spec.xlab, spec.x || 'x');
    const ylab = quotedOrDefault(spec.ylab, defaultYLabel(spec.type, spec.y));
    const colour = TV.rString(spec.colour || defaultColour());

    if (!spec.x) {
      return { ok: false, note: 'Choose an x column first.', code: '# choose an x column to build plot code' };
    }

    if (spec.type === 'bar') {
      return {
        ok: true,
        note: 'Bar charts count the unique values in the x column.',
        code: [
          `..tv_plot <- stats::na.omit(${stringExpr(spec.x)})`,
          `graphics::barplot(table(..tv_plot, useNA = "ifany"), main = ${main}, xlab = ${xlab}, ylab = ${ylab}, col = ${colour}, las = 2)`,
          'rm(..tv_plot)',
        ].join('\n'),
      };
    }

    if (spec.type === 'histogram') {
      if (!isNumericType(xMeta?.type)) {
        return { ok: false, note: 'Histogram works best with numeric columns.', code: '# choose a numeric x column for a histogram' };
      }
      return {
        ok: true,
        note: 'Histogram uses the selected numeric x column.',
        code: `graphics::hist(stats::na.omit(${numericExpr(spec.x)}), main = ${main}, xlab = ${xlab}, ylab = ${ylab}, col = ${colour}, border = "white")`,
      };
    }

    if (!spec.y) {
      return { ok: false, note: 'Choose a y column for this chart type.', code: '# choose a y column to build plot code' };
    }

    if (spec.type === 'scatter') {
      if (!(isNumericType(xMeta?.type) || isDateType(xMeta?.type)) || !(isNumericType(yMeta?.type) || isDateType(yMeta?.type))) {
        return { ok: false, note: 'Scatter works best with numeric or date-like x and y columns.', code: '# choose numeric or date-like x and y columns for a scatter plot' };
      }
      return {
        ok: true,
        note: 'Scatter plot compares x and y values row by row.',
        code: [
          `..tv_plot <- stats::na.omit(data.frame(x = ${vectorExpr(spec.x)}, y = ${vectorExpr(spec.y)}))`,
          `graphics::plot(..tv_plot$x, ..tv_plot$y, main = ${main}, xlab = ${xlab}, ylab = ${ylab}, pch = 19, col = ${colour})`,
          'rm(..tv_plot)',
        ].join('\n'),
      };
    }

    if (spec.type === 'line') {
      if (!(isNumericType(xMeta?.type) || isDateType(xMeta?.type)) || !(isNumericType(yMeta?.type) || isDateType(yMeta?.type))) {
        return { ok: false, note: 'Line charts work best with ordered x values and numeric or date-like columns.', code: '# choose ordered x values plus a numeric or date-like y column for a line chart' };
      }
      return {
        ok: true,
        note: 'Line chart orders the data by x before drawing the line, which is usually easier to read for dates and numeric sequences.',
        code: [
          `..tv_plot <- stats::na.omit(data.frame(x = ${vectorExpr(spec.x)}, y = ${vectorExpr(spec.y)}))`,
          `..tv_plot <- ..tv_plot[order(..tv_plot$x), , drop = FALSE]`,
          `graphics::plot(..tv_plot$x, ..tv_plot$y, type = "l", lwd = 2, main = ${main}, xlab = ${xlab}, ylab = ${ylab}, col = ${colour})`,
          'rm(..tv_plot)',
        ].join('\n'),
      };
    }

    if (!isNumericType(yMeta?.type)) {
      return { ok: false, note: 'Boxplot needs a numeric y column.', code: '# choose a numeric y column for a boxplot' };
    }

    return {
      ok: true,
      note: 'Boxplot summarizes a numeric y column across groups from the x column.',
      code: [
        `..tv_plot <- stats::na.omit(data.frame(group = as.factor(${vectorExpr(spec.x)}), value = ${numericExpr(spec.y)}))`,
        `graphics::boxplot(value ~ group, data = ..tv_plot, main = ${main}, xlab = ${xlab}, ylab = ${ylab}, col = ${colour})`,
        'rm(..tv_plot)',
      ].join('\n'),
    };
  }

  function updateFieldVisibility() {
    const needsY = ['scatter', 'line', 'boxplot'].includes(type);
    const yField = document.getElementById('plot-y-field');
    if (yField) yField.style.display = needsY ? '' : 'none';
  }

  function updatePreview() {
    updateFieldVisibility();
    const preview = document.getElementById('plot-preview');
    const note = document.getElementById('plot-note');
    const suggestion = document.getElementById('plot-suggestion-note');
    const result = buildCode();
    if (preview) preview.textContent = result.code;
    if (note) note.textContent = result.note;
    if (suggestion) {
      const suggestionInfo = suggestColumns(type);
      suggestion.textContent = suggestionInfo.note;
    }
  }

  function applySuggestedColumns() {
    const suggestion = suggestColumns(type);
    const xInput = document.getElementById('plot-x');
    const yInput = document.getElementById('plot-y');
    if (xInput) xInput.value = suggestion.x || '';
    if (yInput) yInput.value = suggestion.y || '';
    updatePreview();
  }

  function setType(nextType) {
    type = nextType;
    ['bar', 'histogram', 'scatter', 'line', 'boxplot'].forEach(name => {
      document.getElementById(`plot-type-${name}`)?.classList.toggle('selected', name === nextType);
    });
    applySuggestedColumns();
  }

  async function addToScript() {
    const result = buildCode();
    if (!result.ok) {
      await TV.showMessage(result.note, { title: 'Plot Incomplete' });
      return;
    }
    try {
      const res = await TV.api('add_history', { code: result.code });
      if (Array.isArray(res.history)) TV.setHistory(res.history);
      else TV.pushCode(result.code);
      if (Array.isArray(res.sessions)) {
        TV.state.sessions = res.sessions;
        TV.renderSessionTabs(res.sessions);
      }
      TV.closePanel();
      TV.showToast('plot code added to script');
    } catch (e) {
      await TV.showError('Plot error: ' + e.message);
    }
  }

  function init() {
    type = 'bar';
    updateFieldVisibility();
    applySuggestedColumns();
  }

  return { init, setType, updatePreview, addToScript, defaultColour, applySuggestedColumns };
})();
