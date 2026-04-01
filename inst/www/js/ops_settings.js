/* tidyview ops_settings.js - settings panel */
'use strict';

TV.panels = TV.panels || {};

TV.panels.settings = function(pane) {
  pane.innerHTML = `
    <div class="tv-panel-header">
      <div class="tv-panel-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="10" cy="10" r="2.5"/>
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.6 4.6l1.4 1.4M14 14l1.4 1.4M4.6 15.4l1.4-1.4M14 6l1.4-1.4"/>
        </svg>
      </div>
      <div>
        <div class="tv-panel-title">settings</div>
        <div class="tv-panel-sub">theme · appearance · display</div>
      </div>
      <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
    </div>

    <div class="tv-panel-body">

      <div class="tv-field">
        <label class="tv-field-label">appearance</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button class="tv-chip" id="settings-light-btn" onclick="TVSETTINGS.setDark(false)">light</button>
          <button class="tv-chip" id="settings-dark-btn" onclick="TVSETTINGS.setDark(true)">dark</button>
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">theme colour</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap" id="settings-swatches">
          ${TVSETTINGS.swatchHTML()}
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <label style="font-size:11px;color:var(--md-on-surface-variant)">custom</label>
          <input type="color" id="settings-color-input"
            style="width:36px;height:36px;border:none;border-radius:6px;cursor:pointer;padding:2px;background:transparent"
            onchange="TVSETTINGS.setCustomColor(this.value)">
          <span id="settings-color-hex" style="font:var(--tv-type-mono);font-size:11px;color:var(--md-on-surface-variant)"></span>
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">rows per page</label>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px" id="settings-perpage-grid">
          ${[20, 50, 100, 200].map(n =>
            `<button class="tv-chip" id="settings-pp-${n}" onclick="TVSETTINGS.setPerPage(${n})">${n}</button>`
          ).join('')}
        </div>
      </div>

      <div class="tv-field">
        <label class="tv-field-label">script style</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button class="tv-chip" id="settings-code-native" onclick="TVSETTINGS.setCodeStyle('native')">native</button>
          <button class="tv-chip" id="settings-code-tidyverse" onclick="TVSETTINGS.setCodeStyle('tidyverse')">tidyverse</button>
        </div>
        <div style="font-size:10px;color:var(--md-on-surface-variant);margin-top:6px;line-height:1.5">
          native keeps the current data.table script. tidyverse shows a best-effort dplyr/tidyr translation in the R script pane.
        </div>
      </div>

      <div style="padding:10px 12px;border:1px solid var(--md-outline-variant);border-radius:var(--tv-radius-sm)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--md-on-surface-variant);margin-bottom:5px;font-weight:500">preview</div>
        <div id="settings-preview" style="font:var(--tv-type-mono);font-size:11px;line-height:1.7;color:var(--md-on-surface)">
          <span style="color:var(--md-on-surface-variant);font-style:italic">loading...</span>
        </div>
      </div>
    </div>

    <div class="tv-panel-footer">
      <button class="tv-btn-outlined" onclick="TV.closePanel()">cancel</button>
      <button class="tv-btn-filled" id="settings-apply-btn" onclick="TVSETTINGS.apply()">apply settings -></button>
    </div>`;

  TVSETTINGS.init();
};


const TVSETTINGS = (() => {
  const PRESETS = [
    { label: 'purple', hex: '#534AB7' },
    { label: 'teal', hex: '#1D9E75' },
    { label: 'rose', hex: '#D85A30' },
    { label: 'sky', hex: '#1A73E8' },
    { label: 'gold', hex: '#C68A00' },
    { label: 'slate', hex: '#607D8B' },
  ];

  let current = { seed: '#534AB7', dark: false, perPage: 50, codeStyle: 'native' };

  function swatchHTML() {
    return PRESETS.map(p =>
      `<button onclick="TVSETTINGS.setSeed('${p.hex}')"
        title="${p.label}"
        style="width:28px;height:28px;border-radius:50%;background:${p.hex};border:2px solid transparent;cursor:pointer;transition:border-color .15s"
        id="swatch-${p.hex.slice(1)}"
        class="settings-swatch"></button>`
    ).join('');
  }

  async function init() {
    try {
      const s = await TV.api('get_settings', {});
      current = {
        seed: s.seed,
        dark: s.dark,
        perPage: s.perPage,
        codeStyle: (s.codeStyle || 'native').toLowerCase() === 'tidyverse' ? 'tidyverse' : 'native',
      };
    } catch (e) {
      /* use defaults */
    }
    syncUI();
    updatePreview();
  }

  function syncUI() {
    document.getElementById('settings-light-btn')?.classList.toggle('selected', !current.dark);
    document.getElementById('settings-dark-btn')?.classList.toggle('selected', current.dark);

    [20, 50, 100, 200].forEach(n => {
      document.getElementById('settings-pp-' + n)?.classList.toggle('selected', n === current.perPage);
    });
    document.getElementById('settings-code-native')?.classList.toggle('selected', current.codeStyle === 'native');
    document.getElementById('settings-code-tidyverse')?.classList.toggle('selected', current.codeStyle === 'tidyverse');

    const colorInput = document.getElementById('settings-color-input');
    if (colorInput) colorInput.value = current.seed;
    const hexSpan = document.getElementById('settings-color-hex');
    if (hexSpan) hexSpan.textContent = current.seed;

    document.querySelectorAll('.settings-swatch').forEach(btn => {
      const active = btn.style.background === current.seed ||
        btn.style.background.toLowerCase() === current.seed.toLowerCase();
      btn.style.borderColor = active ? 'var(--md-primary)' : 'transparent';
    });
  }

  function setDark(dark) {
    current.dark = dark;
    syncUI();
    updatePreview();
  }

  function setSeed(hex) {
    current.seed = hex;
    const colorInput = document.getElementById('settings-color-input');
    if (colorInput) colorInput.value = hex;
    syncUI();
    updatePreview();
  }

  function setCustomColor(hex) {
    current.seed = hex;
    const hexSpan = document.getElementById('settings-color-hex');
    if (hexSpan) hexSpan.textContent = hex;
    syncUI();
    updatePreview();
  }

  function setPerPage(n) {
    current.perPage = n;
    syncUI();
    updatePreview();
  }

  function setCodeStyle(nextStyle) {
    current.codeStyle = String(nextStyle).toLowerCase() === 'tidyverse' ? 'tidyverse' : 'native';
    syncUI();
    updatePreview();
  }

  function updatePreview() {
    const prev = document.getElementById('settings-preview');
    if (!prev) return;
    const mode = current.dark ? 'dark' : 'light';
    const header =
      `m3_theme("${current.seed}", dark = ${current.dark ? 'TRUE' : 'FALSE'})  # ${mode} · ${current.perPage} rows/page`;
    const scriptExample = current.codeStyle === 'tidyverse'
      ? [
          'people <- tibble::as_tibble(source_data)',
          'people <- dplyr::filter(people, status == "Active")',
          'people <- dplyr::select(people, record_id, status, region)'
        ].join('\n')
      : [
          'people <- data.table::as.data.table(source_data)',
          'people <- people[status == "Active"]',
          'people <- people[, .(record_id, status, region)]'
        ].join('\n');
    prev.textContent = `${header}\n\n${scriptExample}`;
  }

  function updatePreview() {
    const prev = document.getElementById('settings-preview');
    if (!prev) return;
    const mode = current.dark ? 'dark' : 'light';
    const header = [
      `m3_theme("${current.seed}", dark = ${current.dark ? 'TRUE' : 'FALSE'})`,
      `# ${mode} mode | ${current.perPage} rows/page | ${current.codeStyle} script`
    ].join('\n');
    const scriptExample = current.codeStyle === 'tidyverse'
      ? [
          'people <- tibble::as_tibble(source_data) |>',
          '  dplyr::filter(status == "Active") |>',
          '  dplyr::select(record_id, status, region)'
        ].join('\n')
      : [
          'people <- data.table::as.data.table(source_data)',
          'people <- people[status == "Active"]',
          'people <- people[, .(record_id, status, region)]'
        ].join('\n');
    prev.textContent = `${header}\n\n${scriptExample}`;
  }

  async function apply() {
    const btn = document.getElementById('settings-apply-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'applying...'; }
    try {
      const res = await TV.api('set_theme', {
        seed: current.seed,
        dark: current.dark,
        perPage: current.perPage,
        codeStyle: current.codeStyle,
      });

      const styleTag = document.getElementById('tv-dynamic-theme');
      if (styleTag) styleTag.textContent = res.css;

      document.documentElement.classList.toggle('tv-dark', res.dark);

      TV.state.perPage = res.perPage;
      TV.state.codeStyle = (res.codeStyle || 'native').toLowerCase() === 'tidyverse' ? 'tidyverse' : 'native';
      TV.state.page = 1;
      TV.renderTable();
      TV.renderHistory();

      TV.closePanel();
    } catch (e) {
      await TV.showError('Settings error:\n' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'apply settings ->'; }
    }
  }

  return { swatchHTML, init, setDark, setSeed, setCustomColor, setPerPage, setCodeStyle, apply };
})();
