#' Programmatic tidyview verbs
#'
#' These helpers mirror the GUI operations with structured arguments and
#' return a `data.table` carrying the generated R code in `attr(x, "tv_code")`.
#'
#' @name tv_select
#' @title Programmatic tidyview verbs
#' @description
#' Lightweight programmatic helpers that mirror the main tidyview GUI actions.
#' Each helper returns a `data.table` result or summary object and stores the
#' generated paste-ready R code in `attr(x, "tv_code")`.

.tv_state <- function(data, as) {
  dt <- if (data.table::is.data.table(data)) data.table::copy(data) else data.table::as.data.table(data)
  state <- new.env(parent = emptyenv())
  state$dt <- dt
  state$name <- as
  state$history <- character(0)
  state$undo_stack <- list()
  state
}


.tv_result <- function(state) {
  attr(state$dt, "tv_code") <- tail(state$history, 1)
  state$dt
}


.tv_audit_result <- function(audit, code) {
  attr(audit, "tv_code") <- code
  class(audit) <- c("tv_audit", "list")
  audit
}


.tv_compare_result <- function(compare, code) {
  attr(compare, "tv_code") <- code
  class(compare) <- c("tv_compare", "list")
  compare
}


.tv_validate_result <- function(validate, code) {
  attr(validate, "tv_code") <- code
  class(validate) <- c("tv_validate", "list")
  validate
}


.tv_missing_result <- function(missing, code) {
  attr(missing, "tv_code") <- code
  class(missing) <- c("tv_missing", "list")
  missing
}


#' @param data A data frame or data.table.
#' @param columns Character vector of column names.
#' @param as Name to use in generated code. Defaults to the input name.
#' @export
tv_select <- function(data, columns, as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_select(list(columns = columns), state)
  .tv_result(state)
}


#' @param top_n Number of top values to include per column.
#' @rdname tv_select
#' @export
tv_audit <- function(data, top_n = 3L, as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  top_n <- suppressWarnings(as.integer(top_n))
  if (is.na(top_n) || top_n < 1L) top_n <- 3L
  audit <- .audit_summary(state$dt, name = state$name, top_n = top_n)
  cols_dt <- data.table::rbindlist(lapply(audit$columns, function(x) {
    data.table::data.table(
      name = x$name,
      label = x$label %||% NA_character_,
      type = x$type,
      missing_n = x$missing_n,
      missing_pct = x$missing_pct,
      distinct_n = x$distinct_n,
      constant = isTRUE(x$constant),
      sample = paste(unlist(x$sample %||% list()), collapse = ", "),
      top_values = paste(unlist(x$top_values %||% list()), collapse = "; "),
      min = x$min %||% NA_character_,
      max = x$max %||% NA_character_,
      summary = x$summary %||% ""
    )
  }), fill = TRUE)
  overview_dt <- data.table::rbindlist(list(
    data.table::data.table(metric = "rows", value = as.character(audit$overview$nrow)),
    data.table::data.table(metric = "columns", value = as.character(audit$overview$ncol)),
    data.table::data.table(metric = "rows_with_missing", value = as.character(audit$overview$rows_with_missing)),
    data.table::data.table(metric = "duplicate_rows", value = as.character(audit$overview$duplicate_rows)),
    data.table::data.table(metric = "missing_cells", value = sprintf("%s (%s%%)", audit$overview$missing_cells, audit$overview$missing_pct))
  ))
  .tv_audit_result(list(
    overview = overview_dt,
    columns = cols_dt
  ), audit$code)
}


#' @param other A second data frame or data.table to compare against.
#' @param by Optional key columns used to compare matched rows.
#' @param other_name Name to use in generated code for `other`.
#' @rdname tv_select
#' @export
tv_compare <- function(data, other, by = NULL, as = deparse(substitute(data)),
                       other_name = deparse(substitute(other))) {
  state <- .tv_state(data, as)
  state$sessions <- list()
  state$active_idx <- 0L
  cmp <- .compare_summary(state$dt, state$name, list(right_dt = other, right_name = other_name, by = by %||% character(0)), state)
  overview_dt <- data.table::data.table(
    left_name = cmp$overview$left_name,
    right_name = cmp$overview$right_name,
    left_nrow = cmp$overview$left_nrow,
    right_nrow = cmp$overview$right_nrow,
    left_ncol = cmp$overview$left_ncol,
    right_ncol = cmp$overview$right_ncol,
    shared_columns_n = cmp$overview$shared_columns_n,
    left_only_columns_n = cmp$overview$left_only_columns_n,
    right_only_columns_n = cmp$overview$right_only_columns_n,
    type_mismatches_n = cmp$overview$type_mismatches_n
  )
  shared_dt <- data.table::data.table(column = cmp$shared_columns %||% character(0))
  left_only_dt <- data.table::data.table(column = cmp$left_only_columns %||% character(0))
  right_only_dt <- data.table::data.table(column = cmp$right_only_columns %||% character(0))
  mismatch_dt <- data.table::rbindlist(lapply(cmp$type_mismatches %||% list(), function(x) {
    data.table::data.table(column = x$column, left_type = x$left_type, right_type = x$right_type)
  }), fill = TRUE)
  key_dt <- if (is.null(cmp$key_summary)) data.table::data.table() else data.table::data.table(
    matched_keys = cmp$key_summary$matched_keys,
    only_left_keys = cmp$key_summary$only_left_keys,
    only_right_keys = cmp$key_summary$only_right_keys,
    duplicate_keys_left = cmp$key_summary$duplicate_keys_left,
    duplicate_keys_right = cmp$key_summary$duplicate_keys_right,
    changed_rows = cmp$key_summary$changed_rows %||% NA_integer_,
    changed_columns = paste(cmp$key_summary$changed_columns %||% character(0), collapse = ", ")
  )
  .tv_compare_result(list(
    overview = overview_dt,
    shared_columns = shared_dt,
    left_only_columns = left_only_dt,
    right_only_columns = right_only_dt,
    type_mismatches = mismatch_dt,
    key_summary = key_dt
  ), cmp$code)
}


#' @param rules A list of validation rules.
#' @rdname tv_select
#' @export
tv_validate <- function(data, rules, as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  res <- .validate_summary(state$dt, state$name, rules)
  rules_dt <- data.table::rbindlist(lapply(res$rules, function(x) {
    data.table::data.table(
      id = x$id,
      label = x$label,
      type = x$type,
      column = x$column %||% NA_character_,
      status = x$status,
      failing_n = x$failing_n,
      passing_n = x$passing_n,
      detail = x$detail %||% "",
      sample = paste(unlist(x$sample %||% list()), collapse = ", ")
    )
  }), fill = TRUE)
  overview_dt <- data.table::rbindlist(list(
    data.table::data.table(metric = "rows", value = as.character(res$overview$nrow)),
    data.table::data.table(metric = "rule_count", value = as.character(res$overview$rule_count)),
    data.table::data.table(metric = "passing_rules", value = as.character(res$overview$passing_rules)),
    data.table::data.table(metric = "failing_rules", value = as.character(res$overview$failing_rules)),
    data.table::data.table(metric = "rows_with_issues", value = as.character(res$overview$rows_with_issues))
  ))
  .tv_validate_result(list(
    overview = overview_dt,
    rules = rules_dt
  ), res$code)
}


#' @param group_by Optional column used for grouped missing-data summaries.
#' @rdname tv_select
#' @export
tv_missing_summary <- function(data, group_by = NULL, as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  res <- .missing_summary(state$dt, name = state$name, group_by = group_by)
  columns_dt <- data.table::rbindlist(lapply(res$columns, function(x) {
    data.table::data.table(
      name = x$name,
      label = x$label %||% NA_character_,
      type = x$type,
      missing_n = x$missing_n,
      missing_pct = x$missing_pct,
      distinct_n = x$distinct_n,
      summary = x$summary %||% "",
      sample = paste(unlist(x$sample %||% list()), collapse = ", ")
    )
  }), fill = TRUE)
  overview_dt <- data.table::rbindlist(list(
    data.table::data.table(metric = "rows", value = as.character(res$overview$nrow)),
    data.table::data.table(metric = "columns", value = as.character(res$overview$ncol)),
    data.table::data.table(metric = "rows_with_missing", value = as.character(res$overview$rows_with_missing)),
    data.table::data.table(metric = "columns_with_missing", value = as.character(res$overview$columns_with_missing)),
    data.table::data.table(metric = "missing_cells", value = sprintf("%s (%s%%)", res$overview$missing_cells, res$overview$missing_pct))
  ))
  groups_dt <- data.table::rbindlist(lapply(res$group_summary %||% list(), function(x) {
    data.table::data.table(
      group = x$group,
      rows = x$rows,
      rows_with_missing = x$rows_with_missing,
      missing_cells = x$missing_cells,
      missing_row_pct = x$missing_row_pct
    )
  }), fill = TRUE)
  .tv_missing_result(list(
    overview = overview_dt,
    columns = columns_dt,
    groups = groups_dt
  ), res$code)
}


#' @param conditions A list of condition descriptors like
#'   `list(list(col = "region", op = "==", val = "North"))`.
#' @param expr Optional logical filter expression evaluated against the data.
#' @param logic Either `"AND"` or `"OR"`.
#' @rdname tv_select
#' @export
tv_filter <- function(data, conditions = list(), expr = NULL, logic = c("AND", "OR"),
                      as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_filter(list(conditions = conditions, expr = expr, logic = match.arg(logic)), state)
  .tv_result(state)
}


#' @param col_name New column name.
#' @param expr Character R expression evaluated against the data.
#' @rdname tv_select
#' @export
tv_mutate <- function(data, col_name, expr, as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_mutate(list(col_name = col_name, expr = expr), state)
  .tv_result(state)
}


#' @param aggregations A list of aggregation descriptors like
#'   `list(list(output = "sales", fn = "sum", col = "amount"))`.
#' @param group_by Optional character vector of grouping columns.
#' @rdname tv_select
#' @export
tv_summarise <- function(data, aggregations, group_by = NULL,
                         as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_summarise(list(aggregations = aggregations, group_by = group_by), state)
  .tv_result(state)
}


#' @param sorts A list like `list(list(col = "region", desc = FALSE))`.
#' @rdname tv_select
#' @export
tv_arrange <- function(data, sorts, as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_arrange(list(sorts = sorts), state)
  .tv_result(state)
}


#' @param right Right-hand data source for joins.
#' @param by Character vector of join keys.
#' @param type Join type.
#' @param right_name Name to use in generated code for the right table.
#' @rdname tv_select
#' @export
tv_join <- function(data, right, by, type = c("inner", "left", "right", "full", "semi", "anti"),
                    as = deparse(substitute(data)),
                    right_name = deparse(substitute(right))) {
  state <- .tv_state(data, as)
  .op_join(list(
    right_name = right_name,
    right_dt = right,
    by = by,
    type = match.arg(type)
  ), state)
  .tv_result(state)
}


#' @param other Second data source to combine with `data`.
#' @param use_names Match columns by name when stacking rows.
#' @param fill Fill missing columns with `NA` when stacking rows.
#' @rdname tv_select
#' @export
tv_bind_rows <- function(data, other, use_names = TRUE, fill = TRUE,
                         as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_combine(list(
    mode = "rows",
    right_dt = other,
    right_name = deparse(substitute(other)),
    use_names = use_names,
    fill = fill
  ), state)
  .tv_result(state)
}


#' @param other Second data source to combine with `data`.
#' @rdname tv_select
#' @export
tv_bind_cols <- function(data, other, as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_combine(list(
    mode = "cols",
    right_dt = other,
    right_name = deparse(substitute(other))
  ), state)
  .tv_result(state)
}


#' @param columns Columns to relocate.
#' @param before Optional anchor column to move before.
#' @param after Optional anchor column to move after.
#' @rdname tv_select
#' @export
tv_relocate <- function(data, columns, before = NULL, after = NULL,
                        as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_relocate(list(columns = columns, before = before, after = after), state)
  .tv_result(state)
}


#' @param direction Either `"longer"` or `"wider"`.
#' @param id_vars Identifier columns used for longer reshaping.
#' @param measure_vars Measure columns used for longer reshaping.
#' @param formula Formula used for wider reshaping.
#' @param value_var Value column used for wider reshaping.
#' @param var_name Output column name for variable labels in longer reshaping.
#' @param val_name Output column name for values in longer reshaping.
#' @rdname tv_select
#' @export
tv_reshape <- function(data, direction = c("longer", "wider"),
                       id_vars = NULL, measure_vars = NULL,
                       formula = NULL, value_var = NULL,
                       var_name = "variable", val_name = "value",
                       as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  direction <- match.arg(direction)
  params <- if (identical(direction, "longer")) {
    list(
      direction = direction,
      id_vars = id_vars,
      measure_vars = measure_vars,
      var_name = var_name,
      val_name = val_name
    )
  } else {
    list(direction = direction, formula = formula, value_var = value_var)
  }
  .op_reshape(params, state)
  .tv_result(state)
}


#' @param old Existing column names.
#' @param new New column names.
#' @param types Optional named list mapping final column names to target types.
#' @rdname tv_select
#' @export
tv_rename <- function(data, old = character(0), new = character(0), types = NULL,
                      as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_rename(list(old = old, new = new, types = types %||% list()), state)
  .tv_result(state)
}


#' @param columns Optional subset of columns to rename. Defaults to all columns.
#' @param fn Rename transform: `"lower"`, `"upper"`, `"trim"`, `"snake"`,
#'   `"prefix"`, `"suffix"`, `"replace"`, or `"replace_regex"`.
#' @param prefix Text to add before each selected column name.
#' @param suffix Text to add after each selected column name.
#' @param pattern Plain text to replace when `fn = "replace"`.
#' @param replacement Replacement text when `fn = "replace"`.
#' @rdname tv_select
#' @export
tv_rename_with <- function(data, columns = NULL,
                           fn = c("lower", "upper", "trim", "snake", "prefix", "suffix", "replace", "replace_regex"),
                           prefix = "", suffix = "", pattern = "", replacement = "",
                           as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_rename_with(list(
    columns = columns %||% character(0),
    fn = match.arg(fn),
    prefix = prefix,
    suffix = suffix,
    pattern = pattern,
    replacement = replacement
  ), state)
  .tv_result(state)
}


#' @param column Source column to transform.
#' @param mode Factor transformation mode.
#' @param groups For collapse mode, a list like
#'   `list(list(to = "Child", from = c("Infant", "Toddler")))`.
#' @param top_n For lump mode, keep only the top `n` categories.
#' @param min_count For lump mode, keep categories with at least this count.
#' @param other_label Label to use for lumped categories.
#' @param order_by For reorder mode: `"appearance"`, `"alphabet_asc"`,
#'   `"alphabet_desc"`, `"freq_desc"`, `"freq_asc"`, or `"custom"`.
#' @param levels For reorder mode with `order_by = "custom"`, the desired
#'   level order.
#' @param ref_level For reference mode, the level to move first.
#' @param new_col Optional output column. Defaults to overwriting `column`.
#' @param as_factor Store the result as a factor when supported by the mode.
#' @rdname tv_select
#' @export
tv_factor <- function(data, column,
                      mode = c("collapse", "lump", "reorder", "reference"),
                      groups = list(),
                      top_n = NULL,
                      min_count = NULL,
                      other_label = "Other",
                      order_by = c("appearance", "alphabet_asc", "alphabet_desc", "freq_desc", "freq_asc", "custom"),
                      levels = NULL,
                      ref_level = NULL,
                      new_col = NULL,
                      as_factor = TRUE,
                      as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_factor(list(
    col = column,
    mode = match.arg(mode),
    groups = groups,
    top_n = top_n,
    min_count = min_count,
    other_label = other_label,
    order_by = match.arg(order_by),
    levels = levels %||% character(0),
    ref_level = ref_level,
    new_col = new_col %||% "",
    as_factor = as_factor
  ), state)
  .tv_result(state)
}


#' @rdname tv_select
#' @export
tv_collapse_levels <- function(data, column, groups, new_col = NULL, as_factor = TRUE,
                               as = deparse(substitute(data))) {
  tv_factor(data, column = column, mode = "collapse", groups = groups,
            new_col = new_col, as_factor = as_factor, as = as)
}


#' @rdname tv_select
#' @export
tv_lump_levels <- function(data, column, top_n = NULL, min_count = NULL,
                           other_label = "Other", new_col = NULL, as_factor = TRUE,
                           as = deparse(substitute(data))) {
  tv_factor(data, column = column, mode = "lump", top_n = top_n,
            min_count = min_count, other_label = other_label,
            new_col = new_col, as_factor = as_factor, as = as)
}


#' @rdname tv_select
#' @export
tv_reorder_levels <- function(data, column,
                              order_by = c("appearance", "alphabet_asc", "alphabet_desc", "freq_desc", "freq_asc", "custom"),
                              levels = NULL, new_col = NULL,
                              as = deparse(substitute(data))) {
  tv_factor(data, column = column, mode = "reorder",
            order_by = match.arg(order_by), levels = levels,
            new_col = new_col, as = as)
}


#' @rdname tv_select
#' @export
tv_relevel <- function(data, column, ref_level, new_col = NULL,
                       as = deparse(substitute(data))) {
  tv_factor(data, column = column, mode = "reference",
            ref_level = ref_level, new_col = new_col, as = as)
}


#' @param by_cols Optional subset of columns defining duplicate rows.
#' @rdname tv_select
#' @export
tv_dedupe <- function(data, by_cols = NULL, as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_dedupe(list(by_cols = by_cols %||% character(0)), state)
  .tv_result(state)
}


#' @param columns Optional subset of columns used to detect missing values.
#' @rdname tv_select
#' @export
tv_drop_na <- function(data, columns = NULL, as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_drop_na(list(columns = columns %||% character(0)), state)
  .tv_result(state)
}


#' @param type Slice method: `"head"`, `"tail"`, or `"sample"`.
#' @param n Number of rows.
#' @rdname tv_select
#' @export
tv_slice <- function(data, type = c("head", "tail", "sample"), n = 10L,
                     as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_slice(list(type = match.arg(type), n = n), state)
  .tv_result(state)
}


#' @param sort Sort descending by count.
#' @rdname tv_select
#' @export
tv_count <- function(data, by_cols = NULL, sort = FALSE,
                     as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_count(list(by_cols = by_cols %||% character(0), sort = sort), state)
  .tv_result(state)
}


#' @param column Column to tabulate.
#' @param weight_expr Optional weighting expression evaluated against the data.
#' @param engine Either `"data.table"`, `"tsg"`, or `"auto"`.
#' @param sort Sort descending by frequency.
#' @param percent Add a percent column.
#' @param cumulative Add a cumulative percent column.
#' @param convert_factor Convert labelled values to factors when using `tsg`.
#' @param top_n Optional top-`n` cutoff when using `tsg`.
#' @param top_n_only Keep only the top `n` categories when using `tsg`.
#' @param add_total Add a total row when using `tsg`.
#' @param include_na Include missing values when using `tsg`.
#' @param position_total Position of the total row when using `tsg`.
#' @param output_name Object name used in generated code for the result.
#' @rdname tv_select
#' @export
tv_tabulate <- function(data, column, weight_expr = NULL,
                        engine = c("data.table", "tsg", "auto"),
                        sort = TRUE, percent = TRUE, cumulative = FALSE,
                        convert_factor = FALSE, top_n = NULL, top_n_only = FALSE,
                        add_total = TRUE, include_na = TRUE,
                        position_total = c("bottom", "top"),
                        output_name = paste0(deparse(substitute(data)), "_tab"),
                        as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_tabulate(list(
    column = column,
    weight_expr = weight_expr %||% "",
    engine = match.arg(engine),
    sort = sort,
    percent = percent,
    cumulative = cumulative,
    convert_factor = convert_factor,
    top_n = top_n,
    top_n_only = top_n_only,
    add_total = add_total,
    include_na = include_na,
    position_total = match.arg(position_total),
    output_name = output_name
  ), state)
  .tv_result(state)
}


#' @param row_var Row dimension for a crosstab.
#' @param col_var Column dimension for a crosstab.
#' @param normalize Normalization mode: `"none"`, `"row"`, `"col"`, or `"all"`.
#' @param totals Add totals row and column.
#' @param engine Either `"data.table"`, `"tsg"`, or `"auto"`.
#' @param add_total Add totals when using `tsg`.
#' @param add_total_row Add a total row when using `tsg`.
#' @param add_total_column Add a total column when using `tsg`.
#' @param add_percent Add percent columns when using `tsg`.
#' @param percent_by_column Calculate percentages by column when using `tsg`.
#' @param convert_factor Convert labelled values to factors when using `tsg`.
#' @param include_na Include missing values when using `tsg`.
#' @param position_total Position of totals when using `tsg`.
#' @rdname tv_select
#' @export
tv_crosstab <- function(data, row_var, col_var, weight_expr = NULL,
                        normalize = c("none", "row", "col", "all"),
                        totals = FALSE,
                        engine = c("data.table", "tsg", "auto"),
                        add_total = totals,
                        add_total_row = totals,
                        add_total_column = totals,
                        add_percent = NULL,
                        percent_by_column = NULL,
                        convert_factor = FALSE,
                        include_na = TRUE,
                        position_total = c("bottom", "top"),
                        output_name = paste0(deparse(substitute(data)), "_xtab"),
                        as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  normalize <- match.arg(normalize)
  if (is.null(add_percent)) add_percent <- !identical(normalize, "none")
  if (is.null(percent_by_column)) percent_by_column <- identical(normalize, "col")
  .op_crosstab(list(
    row_var = row_var,
    col_var = col_var,
    weight_expr = weight_expr %||% "",
    normalize = normalize,
    totals = totals,
    engine = match.arg(engine),
    add_total = add_total,
    add_total_row = add_total_row,
    add_total_column = add_total_column,
    add_percent = add_percent,
    percent_by_column = percent_by_column,
    convert_factor = convert_factor,
    include_na = include_na,
    position_total = match.arg(position_total),
    output_name = output_name
  ), state)
  .tv_result(state)
}


#' @param columns Columns to fill.
#' @param method Either `"value"`, `"down"`, or `"up"`.
#' @param value Replacement value for `method = "value"`.
#' @rdname tv_select
#' @export
tv_fill_na <- function(data, columns, method = c("value", "down", "up"),
                       value = "", as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_fill_na(list(columns = columns, method = match.arg(method), value = value), state)
  .tv_result(state)
}


#' @param column Source column to split.
#' @param into Output column names.
#' @param sep Separator string or regex passed to `tstrsplit()`.
#' @param remove Drop the source column after splitting. Default `TRUE`.
#' @rdname tv_select
#' @export
tv_separate <- function(data, column, into, sep = "_", remove = TRUE,
                        as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_separate(list(column = column, into = into, sep = sep, remove = remove), state)
  .tv_result(state)
}


#' @param columns Source columns to combine.
#' @param into Output column name.
#' @param sep Separator inserted between values. Default `"_"`.
#' @param remove Drop the source columns after combining. Default `TRUE`.
#' @rdname tv_select
#' @export
tv_unite <- function(data, columns, into, sep = "_", remove = TRUE,
                     as = deparse(substitute(data))) {
  state <- .tv_state(data, as)
  .op_unite(list(columns = columns, into = into, sep = sep, remove = remove), state)
  .tv_result(state)
}
