/* tidyview ops_help.js - help and keyboard shortcuts */
'use strict';

TV.panels = TV.panels || {};

TV.panels.help = function(pane) {
  const sections = [
    {
      title: 'Core workflow',
      items: [
        {
          name: 'load',
          panel: 'load',
          functions: ['tidygui()', 'tv_load()', 'tv_fread()', 'tv_from_env()', 'tv_read_rcdf()'],
          terms: ['import', 'open data', 'file', 'environment', 'rcdf'],
          definition: 'Bring data into tidyview from the R environment or from a file.',
          usage: 'Use this first. RCDF import also starts here.',
          example: 'people <- data.table::as.data.table(source_data[["people"]])',
        },
        {
          name: 'slice',
          panel: 'slice',
          functions: ['tv_slice()'],
          terms: ['rows', 'head', 'tail', 'sample'],
          definition: 'Keep or remove rows by row number.',
          usage: 'Useful for sampling, trimming, or checking specific records.',
          example: 'DT <- DT[1:100]\nDT <- DT[-c(1, 2, 3)]',
        },
        {
          name: 'columns',
          panel: 'columns',
          functions: ['names()', 'str()'],
          terms: ['schema', 'metadata', 'types', 'labels'],
          definition: 'Inspect column names, types, and quick metadata.',
          usage: 'Use it to audit fields before filtering, joining, or recoding.',
          example: 'names(DT)\nstr(DT)',
        },
        {
          name: 'audit',
          panel: 'audit',
          functions: ['tv_audit()'],
          terms: ['data quality', 'missing values', 'duplicates', 'distinct counts', 'summary'],
          definition: 'Review missingness, duplicate rows, distinct counts, and top values across the full table.',
          usage: 'Use it near the start of a workflow to catch data issues before cleaning, joins, or tabulation.',
          example: 'audit_report <- tv_audit(DT, top_n = 5L)',
        },
        {
          name: 'missing',
          panel: 'missing',
          functions: ['tv_missing_summary()'],
          terms: ['missing data', 'na dashboard', 'missingness by column', 'grouped missingness', 'complete cases'],
          definition: 'Review where missing values appear across the active dataset.',
          usage: 'Use it after audit when you want to focus specifically on missing cells, affected rows, and grouped missingness before using replace_na or drop_na.',
          example: 'missing_report <- tv_missing_summary(DT, group_by = "region")',
        },
        {
          name: 'validate',
          panel: 'validate',
          functions: ['tv_validate()'],
          terms: ['validation rules', 'required field', 'unique key', 'allowed values', 'regex', 'range', 'custom rule'],
          definition: 'Check whether rows satisfy a set of validation rules.',
          usage: 'Use it after audit when you want explicit pass/fail checks for required values, uniqueness, allowed sets, regex patterns, ranges, or custom expressions.',
          example: 'validate_report <- tv_validate(DT, rules = list(list(type = "not_missing", col = "record_id"), list(type = "range", col = "age", min = "0", max = "120")))',
        },
        {
          name: 'compare',
          panel: 'compare',
          functions: ['tv_compare()'],
          terms: ['dataset compare', 'schema diff', 'matched rows', 'changed values'],
          definition: 'Compare the active dataset with another tab or R object.',
          usage: 'Start with schema differences, then add key columns to count left-only, right-only, and changed matched rows.',
          example: 'compare_report <- tv_compare(current_data, previous_data, by = c("record_id"))',
        },
      ],
    },
    {
      title: 'Transform',
      items: [
        {
          name: 'regex',
          panel: 'filter',
          functions: ['grepl()', 'gsub()', 'sub()'],
          terms: ['regex', 'pattern', 'matches regex', 'does not match regex', 'replace text', 'extract text'],
          definition: 'Use regular expressions to match, extract, remove, or replace text values.',
          usage: 'Regex is available in filter, mutate, validate, and rename tools. Use it when exact text matching is too limited.',
          example: 'DT <- DT[grepl("^[A-Za-z]{3}$", as.character(last_name), perl = TRUE)]',
        },
        {
          name: 'filter',
          panel: 'filter',
          functions: ['tv_filter()', 'grepl()'],
          terms: ['where', 'keep rows', 'if_any', 'if_all', 'regex', 'starts with', 'ends with', 'contains text', 'date range', 'between'],
          definition: 'Keep only rows that match your conditions.',
          usage: 'Supports standard conditions plus if_any / if_all helpers, regex matching, text helpers like starts with or ends with, and between filters for numeric or date ranges.',
          example: 'DT <- DT[(interview_date >= as.Date("2024-01-01") & interview_date <= as.Date("2024-12-31")) | startsWith(as.character(last_name), "San")]',
        },
        {
          name: 'select',
          panel: 'select',
          functions: ['tv_select()'],
          terms: ['keep columns', 'pick columns'],
          definition: 'Keep only the columns you want to work with.',
          usage: 'Good for simplifying wide tables before tabulation or export.',
          example: 'DT <- DT[, .(record_id, last_name, first_name, status)]',
        },
        {
          name: 'relocate',
          panel: 'relocate',
          functions: ['tv_relocate()', 'data.table::setcolorder()'],
          terms: ['move columns', 'before', 'after', 'column order'],
          definition: 'Move columns to the front or before / after another column.',
          usage: 'Use it to make key identifiers easier to see.',
          example: 'data.table::setcolorder(DT, c("uuid", "line_number", setdiff(names(DT), c("uuid", "line_number"))))',
        },
        {
          name: 'mutate',
          panel: 'mutate',
          functions: ['tv_mutate()', 'data.table::fifelse()', 'data.table::fcase()', 'data.table::fcoalesce()', 'data.table::shift()', 'trimws()', 'tools::toTitleCase()', 'gsub()', 'sub()', 'as.Date()', 'data.table::as.IDate()', 'format()', 'difftime()'],
          terms: ['new column', 'case_when', 'if_else', 'coalesce', 'lead', 'lag', 'across', 'regex', 'string', 'replace text', 'title case', 'date', 'year', 'month', 'day', 'age'],
          definition: 'Create or overwrite columns using an expression.',
          usage: 'Includes helpers for if_else, coalesce, lead, lag, across, string operations, date parsing and extraction, regex, and case_when-style rules.',
          example: 'DT[, birth_year := as.integer(format(as.Date(as.character(birth_date)), "%Y"))]',
        },
        {
          name: 'recode',
          panel: 'recode',
          functions: ['data.table::fcase()'],
          terms: ['label values', 'classify', 'conditional rules', 'factor'],
          definition: 'Relabel values or classify them into new categories.',
          usage: 'Use value mappings for exact replacements or conditional rules for grouped labels.',
          example: 'DT[, status_label := data.table::fcase(status_code == "A", "Active", status_code == "I", "Inactive", default = "Other")]',
        },
        {
          name: 'factors',
          panel: 'factors',
          functions: ['tv_factor()', 'tv_collapse_levels()', 'tv_lump_levels()', 'tv_reorder_levels()', 'tv_relevel()'],
          terms: ['category tools', 'collapse categories', 'lump rare', 'reference level', 'reorder levels'],
          definition: 'Collapse categories, lump rare values, reorder factor levels, or set a reference level.',
          usage: 'Use this after recoding when you want cleaner category groups or a stable factor order for tables and models.',
          example: 'DT[, status_group := factor(as.character(status_group), levels = c("Priority", "Standard", "Other"))]',
        },
        {
          name: 'summarise',
          panel: 'summarise',
          functions: ['tv_summarise()'],
          terms: ['group by', 'aggregate', 'mean', 'sum', 'count', 'across'],
          definition: 'Aggregate rows into grouped totals, means, counts, or custom summaries.',
          usage: 'Use one or more grouping columns, then add the statistics you need.',
          example: 'DT <- DT[, .(n = .N, avg_income = mean(income, na.rm = TRUE)), by = .(region)]',
        },
        {
          name: 'arrange',
          panel: 'arrange',
          functions: ['tv_arrange()'],
          terms: ['sort', 'order rows', 'descending'],
          definition: 'Sort rows by one or more columns.',
          usage: 'Useful before inspection, export, or top-N style workflows.',
          example: 'DT <- DT[order(region, -income)]',
        },
        {
          name: 'replace_na',
          panel: 'fill_na',
          functions: ['tv_fill_na()'],
          terms: ['fill missing', 'na', 'replace missing'],
          definition: 'Replace missing values with a chosen constant.',
          usage: 'Works well before tabulation, joins, and exports.',
          example: 'DT[is.na(email), email := "unknown@example.com"]',
        },
        {
          name: 'drop_na',
          panel: 'drop_na',
          functions: ['tv_drop_na()'],
          terms: ['remove missing', 'complete cases'],
          definition: 'Remove rows that have missing values in selected columns.',
          usage: 'Leave the selection empty to drop rows with any missing value in the whole table.',
          example: 'DT <- DT[stats::complete.cases(DT[, .(record_id, status)])]',
        },
        {
          name: 'rename',
          panel: 'rename',
          functions: ['tv_rename()', 'tv_rename_with()', 'data.table::setnames()'],
          terms: ['rename_with', 'snake_case', 'prefix', 'suffix', 'regex', 'replace text'],
          definition: 'Rename columns one by one or in bulk with rename_with tools.',
          usage: 'Supports lowercase, uppercase, snake_case, prefixes, suffixes, and find/replace.',
          example: 'data.table::setnames(DT, c("firstName"), c("first_name"))',
        },
        {
          name: 'distinct',
          panel: 'dedupe',
          functions: ['tv_dedupe()', 'unique()'],
          terms: ['unique rows', 'duplicates', 'dedupe'],
          definition: 'Keep unique rows based on all columns or selected keys.',
          usage: 'Use it to remove duplicates before joins, tabulations, or exports.',
          example: 'DT <- unique(DT, by = c("record_id", "visit_date"))',
        },
        {
          name: 'separate',
          panel: 'separate',
          functions: ['tv_separate()', 'tv_unite()'],
          terms: ['split column', 'unite', 'combine text', 'delimiter'],
          definition: 'Split one column into several columns or combine several into one.',
          usage: 'Useful for codes, names, or delimited text values.',
          example: 'DT[, c("region_code", "district_code") := tstrsplit(area_code, "-", fixed = TRUE)]',
        },
      ],
    },
    {
      title: 'Combine and shape',
      items: [
        {
          name: 'join',
          panel: 'join',
          functions: ['tv_join()', 'merge()'],
          terms: ['left join', 'right join', 'full join', 'semi join', 'anti join'],
          definition: 'Match the active table with another table from the R environment.',
          usage: 'Supports inner, left, right, full, semi, and anti joins.',
          example: 'DT <- merge(DT, lookup_table, by = "region_code", all.x = TRUE, all.y = FALSE)',
        },
        {
          name: 'combine',
          panel: 'combine',
          functions: ['tv_bind_rows()', 'tv_bind_cols()', 'data.table::rbindlist()'],
          terms: ['bind_rows', 'bind_cols', 'stack tables', 'combine tables'],
          definition: 'Stack tables with bind_rows or combine them side by side with bind_cols.',
          usage: 'You can combine with another open tab or a table from the R environment.',
          example: 'DT <- data.table::rbindlist(list(DT, archived_rows), use.names = TRUE, fill = TRUE)',
        },
        {
          name: 'area names',
          panel: 'psgc',
          functions: ['tv_get_psgc()', 'tv_join_psgc()'],
          terms: ['phscs', 'psgc', 'province', 'municipality', 'barangay'],
          definition: 'Add PSGC or area-name information using the phscs integration.',
          usage: 'Helpful when you need readable province, municipality, or barangay labels.',
          example: 'DT <- merge(DT, area_reference, by = "area_code", all.x = TRUE)',
        },
        {
          name: 'pivot',
          panel: 'reshape',
          functions: ['tv_reshape()', 'data.table::melt()', 'data.table::dcast()'],
          terms: ['reshape', 'long', 'wide', 'melt', 'cast'],
          definition: 'Reshape data between wide and long forms.',
          usage: 'Use longer for repeated columns and wider for category-to-column summaries.',
          example: 'DT <- data.table::melt(DT, id.vars = c("record_id"), measure.vars = c("sales_q1", "sales_q2"))',
        },
      ],
    },
    {
      title: 'Tabulate and output',
      items: [
        {
          name: 'count',
          panel: 'count',
          functions: ['tv_count()'],
          terms: ['frequency', 'quick counts', 'group counts'],
          definition: 'Count records by one or more grouping columns.',
          usage: 'This is the quickest frequency workflow when you only need counts.',
          example: 'DT <- DT[, .(n = .N), by = .(status)]',
        },
        {
          name: 'tabulate',
          panel: 'tabulate',
          functions: ['tv_tabulate()', 'tv_generate_frequency()', 'tsg::generate_frequency()'],
          terms: ['frequency table', 'one-way table', 'tsg'],
          definition: 'Build one-way tables, optionally into a new output object.',
          usage: 'Can use the built-in data.table engine or the tsg integration.',
          example: 'status_tab <- DT[, .(n = .N), by = .(status)]',
        },
        {
          name: 'crosstab',
          panel: 'crosstab',
          functions: ['tv_crosstab()', 'tv_generate_crosstab()', 'tsg::generate_crosstab()'],
          terms: ['cross tabulation', 'two-way table', 'totals', 'percent', 'tsg'],
          definition: 'Build two-way tables, with totals or percentages when needed.',
          usage: 'Can create output objects for reporting instead of overwriting the active table.',
          example: 'status_region_xtab <- data.table::dcast(DT[, .(n = .N), by = .(status, region)], status ~ region, value.var = "n")',
        },
        {
          name: 'plot',
          panel: 'plot',
          functions: ['graphics::barplot()', 'graphics::hist()', 'graphics::plot()', 'graphics::boxplot()'],
          terms: ['chart', 'visualize', 'base plot', 'bar chart', 'histogram', 'scatter', 'line', 'boxplot'],
          definition: 'Build simple base-R plots without requiring ggplot2.',
          usage: 'Phase 1 supports bar, histogram, scatter, line, and boxplot code that you can add to the script pane.',
          example: 'graphics::hist(stats::na.omit(as.numeric(DT[["income"]])), main = "Distribution of income", xlab = "income", col = "#534AB7", border = "white")',
        },
        {
          name: 'export',
          panel: 'export',
          functions: ['data.table::fwrite()', 'saveRDS()'],
          terms: ['csv', 'tsv', 'xlsx', 'rds', 'sav', 'dta'],
          definition: 'Write the current result to CSV, TSV, Excel, RDS, SPSS, or Stata.',
          usage: 'Use the code pane if you also want a paste-ready export script.',
          example: 'data.table::fwrite(DT, "output.csv")',
        },
      ],
    },
  ];

  const shortcuts = [
    { keys: ['F1'], action: 'Open help', note: 'Shows this help panel from anywhere in the app.' },
    { keys: ['Shift', '?'], action: 'Open help', note: 'Quick keyboard-only way to reopen help.' },
    { keys: ['Ctrl/Cmd', 'K'], action: 'Focus search', note: 'Jumps to the table search box.' },
    { keys: ['/'], action: 'Focus search', note: 'Works when you are not typing in a field.' },
    { keys: ['Ctrl/Cmd', 'Z'], action: 'Undo last operation', note: 'Restores the previous data state.' },
    { keys: ['Ctrl/Cmd', 'Shift', 'C'], action: 'Copy R script', note: 'Copies the whole generated script from the code pane.' },
    { keys: ['Esc'], action: 'Close panel', note: 'Closes the open side panel. Dialogs already close with Escape too.' },
    { keys: ['Alt', 'L'], action: 'Open load', note: 'Jump straight to data import.' },
    { keys: ['Alt', 'A'], action: 'Open audit', note: 'Review missing values, duplicates, and column summaries.' },
    { keys: ['Alt', 'N'], action: 'Open missing', note: 'Focus on missing cells, missing rows, and grouped missingness.' },
    { keys: ['Alt', 'Y'], action: 'Open validate', note: 'Run required, unique, allowed-value, regex, and range checks.' },
    { keys: ['Alt', 'V'], action: 'Open compare', note: 'Compare the active data with another tab or R object.' },
    { keys: ['Alt', 'F'], action: 'Open filter', note: 'Start row filtering quickly.' },
    { keys: ['Alt', 'S'], action: 'Open select', note: 'Choose columns to keep.' },
    { keys: ['Alt', 'M'], action: 'Open mutate', note: 'Create or transform columns.' },
    { keys: ['Alt', 'G'], action: 'Open factors', note: 'Open factor and category tools.' },
    { keys: ['Alt', 'J'], action: 'Open join', note: 'Open the join panel.' },
    { keys: ['Alt', 'C'], action: 'Open combine', note: 'Open bind_rows / bind_cols.' },
    { keys: ['Alt', 'P'], action: 'Open pivot', note: 'Open reshape / pivot tools.' },
    { keys: ['Alt', 'O'], action: 'Open plot', note: 'Open the phase 1 base-R plot builder.' },
    { keys: ['Alt', 'T'], action: 'Open tabulate', note: 'Start one-way tabulation.' },
    { keys: ['Alt', 'X'], action: 'Open crosstab', note: 'Start two-way tabulation.' },
    { keys: ['Alt', 'R'], action: 'Open rename', note: 'Rename or bulk rename columns.' },
    { keys: ['Alt', 'H'], action: 'Open help', note: 'Another fast way to get back here.' },
  ];

  function renderShortcutKeys(keys) {
    return keys.map(key => `<span class="tv-kbd">${TV.escapeHtml(key)}</span>`).join('');
  }

  function itemSearchText(item) {
    return [
      item.name,
      item.panel,
      item.definition,
      item.usage,
      item.example,
      ...(item.functions || []),
      ...(item.terms || [])
    ].join(' ').toLowerCase();
  }

  function shortcutSearchText(item) {
    return [
      item.action,
      item.note,
      ...(item.keys || [])
    ].join(' ').toLowerCase();
  }

  function renderHelpCard(item) {
    return `
      <div class="tv-help-card">
        <div class="tv-help-card-head">
          <div class="tv-help-card-title">${TV.escapeHtml(item.name)}</div>
          <button class="tv-chip" type="button" onclick="TV.openPanel('${item.panel}')">open</button>
        </div>
        <div class="tv-help-card-sub">${TV.escapeHtml(item.definition)}</div>
        <label class="tv-help-label">usage</label>
        <div class="tv-help-card-sub">${TV.escapeHtml(item.usage)}</div>
        <label class="tv-help-label">R helper</label>
        <div class="tv-help-terms">${(item.functions || []).map(fn => `<span class="tv-help-term">${TV.escapeHtml(fn)}</span>`).join('')}</div>
        <label class="tv-help-label">example</label>
        <code class="tv-help-code">${TV.escapeHtml(item.example)}</code>
      </div>`;
  }

  function render(query) {
    const q = String(query || '').trim().toLowerCase();
    const filteredSections = sections
      .map(section => ({
        title: section.title,
        items: q ? section.items.filter(item => itemSearchText(item).includes(q)) : section.items
      }))
      .filter(section => section.items.length);
    const filteredShortcuts = q ? shortcuts.filter(item => shortcutSearchText(item).includes(q)) : shortcuts;
    const matchCount = filteredSections.reduce((sum, section) => sum + section.items.length, 0) + filteredShortcuts.length;
    const searchSummary = q
      ? `${matchCount} match${matchCount === 1 ? '' : 'es'} for "${query}".`
      : 'Search help topics, verbs, functions, or shortcuts.';

    pane.innerHTML = `
      <div class="tv-panel-header">
        <div class="tv-panel-icon">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="10" cy="10" r="7"/>
            <path d="M8.7 7.6a1.8 1.8 0 113.4 1.1c0 1.2-1.3 1.7-2 2.3-.4.3-.6.8-.6 1.3" stroke-linecap="round"/>
            <circle cx="10" cy="14.1" r=".7" fill="currentColor" stroke="none"/>
          </svg>
        </div>
        <div>
          <div class="tv-panel-title">help</div>
          <div class="tv-panel-sub">usage, examples, and keyboard shortcuts</div>
        </div>
        <button class="tv-panel-close" onclick="TV.closePanel()">x</button>
      </div>

      <div class="tv-panel-body">
        <div class="tv-help-intro">
          tidyview lets you work through data step by step, while showing the equivalent paste-ready <code>data.table</code> code in the R script pane. Use the examples below as a quick reference for what each tool does and what kind of R it generates.
        </div>

        <div class="tv-help-search-wrap">
          <div class="tv-search tv-help-search">
            <span class="tv-search-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6">
                <circle cx="9" cy="9" r="5.5"></circle>
                <path d="M13.2 13.2L17 17" stroke-linecap="round"></path>
              </svg>
            </span>
            <input id="tv-help-search-input" type="text" placeholder="search help, verbs, functions, shortcuts..." value="${TV.escapeAttr(query || '')}">
          </div>
          <div class="tv-help-search-meta">${TV.escapeHtml(searchSummary)}</div>
        </div>

        ${filteredSections.length ? filteredSections.map(section => `
          <div class="tv-help-section">
            <div class="tv-help-section-title">${TV.escapeHtml(section.title)}</div>
            <div class="tv-help-grid">
              ${section.items.map(renderHelpCard).join('')}
            </div>
          </div>
        `).join('') : `
          <div class="tv-help-empty">
            No help topics matched <strong>${TV.escapeHtml(query || '')}</strong>. Try a tool name like <code>filter</code>, a function like <code>tv_filter()</code>, or a shortcut like <code>Ctrl/Cmd + K</code>.
          </div>
        `}

        ${filteredShortcuts.length ? `
          <div class="tv-help-section">
            <div class="tv-help-section-title">Keyboard shortcuts</div>
            <div class="tv-help-shortcuts">
              ${filteredShortcuts.map(item => `
                <div class="tv-help-shortcut">
                  <div class="tv-kbd-group">${renderShortcutKeys(item.keys)}</div>
                  <div class="tv-help-shortcut-text">
                    <strong>${TV.escapeHtml(item.action)}</strong>
                    <span>${TV.escapeHtml(item.note)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="tv-panel-footer">
        <button class="tv-btn-outlined" onclick="TV.closePanel()">close</button>
        <button class="tv-btn-filled" onclick="TV.copyToClipboard('F1 or Shift+? = help\\nCtrl/Cmd+K or / = search\\nCtrl/Cmd+Z = undo\\nCtrl/Cmd+Shift+C = copy R script\\nEsc = close panel\\nAlt+A/N/Y/V/L/F/S/M/G/J/C/P/O/T/X/R/H = open tools', 'keyboard shortcuts')">copy shortcuts</button>
      </div>`;

    const input = pane.querySelector('#tv-help-search-input');
    if (input) {
      input.addEventListener('input', (event) => render(event.target.value));
      if (q) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  render('');
};
