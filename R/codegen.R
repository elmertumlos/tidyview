#' Code generation: translate GUI operation descriptors into data.table R expressions
#'
#' Every function here takes a structured list (parsed from JSON sent by
#' the browser) and returns a character string of valid R code, plus
#' executes the operation against the state's data.table.

.ensure_state_dt <- function(state) {
  if (is.null(state$dt)) return(invisible(NULL))
  if (!data.table::is.data.table(state$dt)) {
    state$dt <- data.table::as.data.table(.strip_labelled(state$dt))
  }
  invisible(state$dt)
}


#' @noRd
.op_select <- function(params, state) {
  .ensure_state_dt(state)
  cols <- as.character(unlist(params$columns))
  if (!length(cols)) stop("No columns specified.")

  .snapshot_state(state)
  cols_r  <- .code_name_list(cols)
  code_dt <- sprintf("%s <- %s[, .(%s)]", .code_name(state$name), .code_name(state$name), cols_r)

  state$dt   <- state$dt[, cols, with = FALSE]
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt))
}


.op_filter <- function(params, state) {
  .ensure_state_dt(state)
  expr       <- trimws(params$expr %||% "")
  conditions <- params$conditions
  logic      <- params$logic %||% "AND"

  .snapshot_state(state)

  if (!nzchar(expr)) {
    exprs <- vapply(conditions, function(cond) .condition_to_expr(cond, state$dt), character(1))
    sep   <- if (logic == "AND") " & " else " | "
    expr  <- paste(exprs, collapse = sep)
  }

  code_dt <- sprintf("%s <- %s[%s]", .code_name(state$name), .code_name(state$name), expr)

  if (nzchar(trimws(params$expr %||% ""))) {
    mask <- eval(parse(text = expr), envir = state$dt)
    state$dt <- state$dt[mask, ]
  } else {
    state$dt <- state$dt[.conditions_to_mask(state$dt, conditions, logic), ]
  }
  .push_history(state, code_dt)
  list(code = code_dt, nrow = nrow(state$dt), ncol = ncol(state$dt),
       preview = .dt_preview(state$dt))
}


.op_mutate <- function(params, state) {
  .ensure_state_dt(state)
  col_name <- params$col_name
  expr     <- params$expr

  .snapshot_state(state)
  code_dt <- sprintf("%s[, %s := %s]", .code_name(state$name), .code_name(col_name), expr)

  state$dt[, (col_name) := eval(parse(text = expr),
                                 envir = state$dt)]
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt))
}


.op_summarise <- function(params, state) {
  .ensure_state_dt(state)
  group_by <- as.character(unlist(params$group_by))
  aggs     <- params$aggregations

  .snapshot_state(state)
  agg_exprs <- vapply(aggs, .agg_to_expr, character(1))

  agg_str <- paste(agg_exprs, collapse = ", ")
  by_expr <- .code_name_list(group_by)

  if (length(group_by)) {
    code_dt <- sprintf("result <- %s[, .(%s), by = .(%s)]",
                       .code_name(state$name), agg_str, by_expr)
    state$dt <- eval(parse(text = sprintf(
      "state$dt[, .(%s), by = .(%s)]",
      agg_str, by_expr)))
  } else {
    code_dt <- sprintf("result <- %s[, .(%s)]", .code_name(state$name), agg_str)
    state$dt <- eval(parse(text = sprintf("state$dt[, .(%s)]", agg_str)))
  }

  state$name <- "result"
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), preview = .dt_preview(state$dt),
       name = state$name, ncol = ncol(state$dt))
}


.op_arrange <- function(params, state) {
  .ensure_state_dt(state)
  sorts <- params$sorts

  .snapshot_state(state)
  sort_cols <- vapply(sorts, function(s) s$col, character(1))
  sort_order <- vapply(sorts, function(s) if (isTRUE(s$desc)) -1L else 1L, integer(1))
  code_dt <- paste(
    sprintf("%s <- data.table::copy(%s)", .code_name(state$name), .code_name(state$name)),
    sprintf(
      "data.table::setorderv(%s, cols = c(%s), order = c(%s), na.last = TRUE)",
      .code_name(state$name),
      .code_chr_vec(sort_cols),
      paste(sort_order, collapse = ", ")
    ),
    sep = "\n"
  )

  state$dt <- .sort_dt(
    state$dt,
    cols = sort_cols,
    descending = vapply(sorts, function(s) isTRUE(s$desc), logical(1))
  )
  .push_history(state, code_dt)
  list(code = code_dt, preview = .dt_preview(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt))
}


.op_join <- function(params, state) {
  .ensure_state_dt(state)
  right_name <- params$right_name
  by_cols    <- as.character(unlist(params$by))
  join_type  <- params$type %||% "inner"

  .snapshot_state(state)
  right_dt <- if (!is.null(params$right_dt)) {
    data.table::as.data.table(params$right_dt)
  } else {
    tryCatch(
      data.table::as.data.table(get(right_name, envir = .GlobalEnv)),
      error = function(e) stop("Object '", right_name, "' not found.")
    )
  }

  by_str <- .code_chr_vec(by_cols)

  if (join_type %in% c("semi", "anti")) {
    code_lines <- c(
      sprintf("..tv_left <- data.table::copy(%s)", .code_name(state$name)),
      "..tv_left[, ..tv_rowid__ := .I]",
      sprintf("..tv_keys <- unique(%s[, .(%s)])", .code_name(right_name), .code_name_list(by_cols)),
      sprintf(
        '..tv_hits <- merge(..tv_left[, c("..tv_rowid__", %s), with = FALSE], ..tv_keys, by = c(%s), all = FALSE, sort = FALSE)',
        .code_chr_vec(by_cols), by_str
      )
    )
    if (join_type == "semi") {
      code_lines <- c(
        code_lines,
        sprintf("%s <- ..tv_left[unique(..tv_hits$..tv_rowid__)]", .code_name(state$name))
      )
    } else {
      code_lines <- c(
        code_lines,
        sprintf("%s <- ..tv_left[!(..tv_rowid__ %%in%% unique(..tv_hits$..tv_rowid__))]", .code_name(state$name))
      )
    }
    code_lines <- c(code_lines, sprintf('%s[, ..tv_rowid__ := NULL]', .code_name(state$name)))
    code_dt <- paste(code_lines, collapse = "\n")
    state$dt <- .filter_join_dt(state$dt, right_dt, by_cols, anti = identical(join_type, "anti"))
  } else {
    all_x <- join_type %in% c("left",  "full")
    all_y <- join_type %in% c("right", "full")
    code_dt <- sprintf(
      '%s <- merge(%s, %s, by = c(%s), all.x = %s, all.y = %s)',
      .code_name(state$name), .code_name(state$name), .code_name(right_name), by_str,
      toupper(all_x), toupper(all_y))
    state$dt <- merge(state$dt, right_dt, by = by_cols,
                      all.x = all_x, all.y = all_y, sort = FALSE)
  }

  .push_history(state, code_dt)
  list(
    code = code_dt,
    columns = .dt_column_meta(state$dt),
    preview = .dt_preview(state$dt),
    nrow = nrow(state$dt),
    ncol = ncol(state$dt)
  )
}


.resolve_combine_input <- function(params, state) {
  if (!is.null(params$right_dt)) {
    right_name <- params$right_name %||% "other"
    return(list(
      dt = data.table::as.data.table(params$right_dt),
      code_ref = .code_name(right_name),
      code_lines = character(0)
    ))
  }

  source_type <- params$source_type %||% stop("source_type required")
  if (identical(source_type, "session")) {
    idx <- as.integer(params$session_idx %||% stop("session_idx required"))
    if (idx < 1L || idx > length(state$sessions)) stop("Invalid session index.")
    sess <- state$sessions[[idx]]
    return(list(
      dt = data.table::copy(sess$dt),
      code_ref = .code_name(sess$name %||% paste0("session_", idx)),
      code_lines = as.character(sess$history %||% character(0))
    ))
  }

  if (identical(source_type, "env")) {
    nm <- params$name %||% stop("name required")
    element <- params$element %||% NULL
    obj <- tryCatch(get(nm, envir = .GlobalEnv),
                    error = function(e) stop("Object '", nm, "' not found."))
    if (!is.null(element) && nzchar(element)) {
      if (grepl("^\\[\\[[0-9]+\\]\\]$", element)) {
        idx <- as.integer(gsub("[^0-9]", "", element))
        obj <- obj[[idx]]
        code_src <- sprintf("%s[[%d]]", .code_name(nm), idx)
      } else {
        obj <- obj[[element]]
        code_src <- sprintf('%s[["%s"]]', .code_name(nm), element)
      }
    } else {
      code_src <- .code_name(nm)
    }
    return(list(
      dt = data.table::as.data.table(.strip_labelled(obj)),
      code_ref = sprintf("data.table::as.data.table(%s)", code_src),
      code_lines = character(0)
    ))
  }

  stop("Unsupported combine source: ", source_type)
}


.op_combine <- function(params, state) {
  .ensure_state_dt(state)
  mode <- params$mode %||% "rows"
  use_names <- !identical(params$use_names, FALSE)
  fill <- !identical(params$fill, FALSE)

  .snapshot_state(state)
  right <- .resolve_combine_input(params, state)
  code_lines <- right$code_lines

  if (identical(mode, "rows")) {
    code_lines <- c(
      code_lines,
      sprintf(
        "%s <- data.table::rbindlist(list(%s, %s), use.names = %s, fill = %s)",
        .code_name(state$name),
        .code_name(state$name),
        right$code_ref,
        toupper(use_names),
        toupper(fill)
      )
    )
    state$dt <- data.table::rbindlist(
      list(state$dt, data.table::as.data.table(right$dt)),
      use.names = use_names,
      fill = fill
    )
  } else if (identical(mode, "cols")) {
    if (nrow(state$dt) != nrow(right$dt)) {
      stop("bind_cols requires both inputs to have the same number of rows.")
    }
    code_lines <- c(
      code_lines,
      sprintf("..tv_bound <- data.table::as.data.table(cbind(%s, %s))", .code_name(state$name), right$code_ref),
      "data.table::setnames(..tv_bound, make.unique(names(..tv_bound)))",
      sprintf("%s <- ..tv_bound", .code_name(state$name))
    )
    bound <- data.table::as.data.table(cbind(state$dt, data.table::as.data.table(right$dt)))
    data.table::setnames(bound, make.unique(names(bound)))
    state$dt <- bound
  } else {
    stop("Unsupported combine mode: ", mode)
  }

  code_dt <- paste(code_lines, collapse = "\n")
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt))
}


.op_relocate <- function(params, state) {
  .ensure_state_dt(state)
  cols <- as.character(unlist(params$columns))
  before <- params$before %||% NULL
  after <- params$after %||% NULL
  if (!length(cols)) stop("Choose at least one column to relocate.")

  .snapshot_state(state)
  new_order <- .relocate_order(names(state$dt), cols, before = before, after = after)
  code_dt <- sprintf(
    "data.table::setcolorder(%s, c(%s))",
    .code_name(state$name),
    .code_chr_vec(new_order)
  )

  data.table::setcolorder(state$dt, new_order)
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt))
}


.op_join_psgc <- function(params, state) {
  .ensure_state_dt(state)
  .snapshot_state(state)
  out <- tv_join_psgc(
    data = state$dt,
    area_code = params$area_code %||% NULL,
    level = params$level %||% "barangays",
    harmonize = !identical(params$harmonize, FALSE),
    minimal = !identical(params$minimal, FALSE),
    cols = as.character(unlist(params$cols %||% character(0))),
    region_col = params$region_col %||% NULL,
    province_col = params$province_col %||% NULL,
    city_mun_col = params$city_mun_col %||% NULL,
    barangay_col = params$barangay_col %||% NULL,
    as = state$name
  )
  code_dt <- attr(out, "tv_code") %||% "# PSGC join"
  state$dt <- data.table::as.data.table(out)
  .push_history(state, code_dt)
  list(
    code = code_dt,
    columns = .dt_column_meta(state$dt),
    preview = .dt_preview(state$dt),
    nrow = nrow(state$dt),
    ncol = ncol(state$dt)
  )
}


.op_reshape <- function(params, state) {
  .ensure_state_dt(state)
  direction <- params$direction

  .snapshot_state(state)
  if (direction == "longer") {
    id_vars      <- as.character(unlist(params$id_vars))
    measure_vars <- as.character(unlist(params$measure_vars))
    var_name     <- params$var_name  %||% "variable"
    val_name     <- params$val_name  %||% "value"

    id_str  <- .code_chr_vec(id_vars)
    msr_str <- .code_chr_vec(measure_vars)
    code_dt <- sprintf(
      '%s <- melt(%s, id.vars = c(%s), measure.vars = c(%s), variable.name = "%s", value.name = "%s")',
      .code_name(state$name), .code_name(state$name), id_str, msr_str, var_name, val_name)
    state$dt <- data.table::melt(state$dt,
                                  id.vars       = id_vars,
                                  measure.vars  = measure_vars,
                                  variable.name = var_name,
                                  value.name    = val_name)
  } else {
    formula_str <- params$formula
    value_var   <- params$value_var
    code_dt <- sprintf(
      '%s <- dcast(%s, %s, value.var = "%s")',
      .code_name(state$name), .code_name(state$name), formula_str, value_var)
    state$dt <- data.table::dcast(state$dt,
                                   as.formula(formula_str),
                                   value.var = value_var)
  }

  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt))
}


.op_rename <- function(params, state) {
  .ensure_state_dt(state)
  old_names <- as.character(unlist(params$old))
  new_names <- as.character(unlist(params$new))
  types     <- params$types %||% list()

  .snapshot_state(state)
  old_str <- .code_chr_vec(old_names)
  new_str <- .code_chr_vec(new_names)
  code_lines <- character(0)

  if (length(old_names)) {
    code_lines <- c(code_lines, sprintf('data.table::setnames(%s, c(%s), c(%s))', .code_name(state$name), old_str, new_str))
    data.table::setnames(state$dt, old_names, new_names)
  }

  if (length(types)) {
    for (col_name in names(types)) {
      target_type <- types[[col_name]]
      if (identical(target_type, "(keep)") || is.null(target_type) || !nzchar(target_type)) next
      state$dt[, (col_name) := .coerce_column(get(col_name), target_type)]
      code_lines <- c(code_lines, .coerce_code(state$name, col_name, target_type))
    }
  }

  code_dt <- if (length(code_lines)) paste(code_lines, collapse = "\n") else "# no changes"
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt), ncol = ncol(state$dt))
}


.rename_with_transform <- function(names, fn = c("lower", "upper", "trim", "snake", "prefix", "suffix", "replace", "replace_regex"),
                                   prefix = "", suffix = "", pattern = "", replacement = "") {
  fn <- match.arg(fn)
  names <- as.character(names)
  switch(
    fn,
    lower = tolower(names),
    upper = toupper(names),
    trim = trimws(names),
    snake = {
      out <- trimws(names)
      out <- gsub("([a-z0-9])([A-Z])", "\\1_\\2", out, perl = TRUE)
      out <- gsub("[^A-Za-z0-9]+", "_", out, perl = TRUE)
      out <- gsub("_+", "_", out, perl = TRUE)
      out <- gsub("^_|_$", "", out, perl = TRUE)
      tolower(out)
    },
    prefix = paste0(prefix %||% "", names),
    suffix = paste0(names, suffix %||% ""),
    replace = gsub(pattern %||% "", replacement %||% "", names, fixed = TRUE),
    replace_regex = gsub(pattern %||% "", replacement %||% "", names, perl = TRUE)
  )
}


.op_rename_with <- function(params, state) {
  .ensure_state_dt(state)
  cols <- as.character(unlist(params$columns %||% character(0)))
  fn <- params$fn %||% "lower"
  all_names <- names(state$dt)
  target_cols <- if (length(cols)) intersect(cols, all_names) else all_names
  if (!length(target_cols)) stop("Choose at least one column to rename.")

  new_target <- .rename_with_transform(
    target_cols,
    fn = fn,
    prefix = params$prefix %||% "",
    suffix = params$suffix %||% "",
    pattern = params$pattern %||% "",
    replacement = params$replacement %||% ""
  )

  other_names <- setdiff(all_names, target_cols)
  if (anyDuplicated(c(other_names, new_target))) {
    stop("rename_with produced duplicate column names. Adjust the transform and try again.")
  }

  .op_rename(list(old = target_cols, new = new_target, types = params$types %||% list()), state)
}


.op_dedupe <- function(params, state) {
  .ensure_state_dt(state)
  by_cols <- as.character(unlist(params$by_cols))

  .snapshot_state(state)
  if (length(by_cols)) {
    by_str  <- .code_chr_vec(by_cols)
    code_dt <- sprintf('%s <- unique(%s, by = c(%s))', .code_name(state$name), .code_name(state$name), by_str)
    state$dt <- unique(state$dt, by = by_cols)
  } else {
    code_dt <- sprintf('%s <- unique(%s)', .code_name(state$name), .code_name(state$name))
    state$dt <- unique(state$dt)
  }

  .push_history(state, code_dt)
  list(code = code_dt, nrow = nrow(state$dt))
}


.op_drop_na <- function(params, state) {
  .ensure_state_dt(state)
  cols <- as.character(unlist(params$columns %||% character(0)))

  .snapshot_state(state)
  if (length(cols)) {
    code_dt <- sprintf(
      "%s <- %s[stats::complete.cases(%s[, .(%s)])]",
      .code_name(state$name), .code_name(state$name), .code_name(state$name), .code_name_list(cols)
    )
    mask <- stats::complete.cases(state$dt[, cols, with = FALSE])
  } else {
    code_dt <- sprintf(
      "%s <- %s[stats::complete.cases(%s)]",
      .code_name(state$name), .code_name(state$name), .code_name(state$name)
    )
    mask <- stats::complete.cases(state$dt)
  }

  state$dt <- state$dt[mask, ]
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt))
}


.op_slice <- function(params, state) {
  .ensure_state_dt(state)
  type <- params$type %||% "head"
  n    <- as.integer(params$n %||% 10L)

  .snapshot_state(state)
  if (type == "head") {
    code_dt <- sprintf("%s <- head(%s, %d)", .code_name(state$name), .code_name(state$name), n)
    state$dt <- head(state$dt, n)
  } else if (type == "tail") {
    code_dt <- sprintf("%s <- tail(%s, %d)", .code_name(state$name), .code_name(state$name), n)
    state$dt <- tail(state$dt, n)
  } else {
    code_dt <- sprintf("%s <- %s[sample(.N, min(%d, .N))]", .code_name(state$name), .code_name(state$name), n)
    state$dt <- state$dt[sample(.N, min(n, .N))]
  }

  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt))
}


.op_count <- function(params, state) {
  .ensure_state_dt(state)
  by_cols <- as.character(unlist(params$by_cols))
  sort    <- isTRUE(params$sort)

  .snapshot_state(state)
  if (length(by_cols)) {
    by_expr <- .code_name_list(by_cols)
    sort_str <- if (sort) sprintf("\nresult <- result[order(-n)]") else ""
    code_dt  <- sprintf('result <- %s[, .(n = .N), by = .(%s)]%s',
                        .code_name(state$name), by_expr, sort_str)
    state$dt <- state$dt[, .(n = .N), by = by_cols]
    if (sort) state$dt <- state$dt[order(-n)]
  } else {
    code_dt  <- sprintf('result <- data.table::data.table(n = nrow(%s))', .code_name(state$name))
    state$dt <- data.table::data.table(n = nrow(state$dt))
  }

  state$name <- "result"
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt), name = state$name)
}


.op_tabulate <- function(params, state) {
  .ensure_state_dt(state)
  engine      <- params$engine %||% "data.table"
  column      <- params$column %||% stop("column required")
  weight_expr <- trimws(params$weight_expr %||% "")
  sort        <- !identical(params$sort, FALSE)
  percent     <- !identical(params$percent, FALSE)
  cumulative  <- isTRUE(params$cumulative)
  output_name <- params$output_name %||% paste0(state$name, "_tab")
  .validate_object_name(output_name)

  .snapshot_state(state)

  use_tsg <- identical(engine, "tsg") ||
    (identical(engine, "auto") && requireNamespace("tsg", quietly = TRUE))

  if (use_tsg) {
    result <- tv_generate_frequency(
      data = state$dt,
      column = column,
      sort_value = sort,
      sort_except = as.character(unlist(params$sort_except %||% character(0))),
      convert_factor = isTRUE(params$convert_factor),
      top_n = if (is.null(params$top_n) || identical(params$top_n, "")) NULL else as.integer(params$top_n),
      top_n_only = isTRUE(params$top_n_only),
      add_total = !identical(params$add_total, FALSE),
      include_na = !identical(params$include_na, FALSE),
      position_total = params$position_total %||% "bottom",
      output_name = output_name,
      as = state$name
    )

    state$dt <- data.table::as.data.table(result)
    state$name <- output_name
    code_dt <- attr(result, "tv_code") %||% "# tsg frequency table"
    .push_history(state, code_dt)
    return(list(
      code = code_dt,
      columns = .dt_column_meta(state$dt),
      nrow = nrow(state$dt),
      ncol = ncol(state$dt),
      preview = .dt_preview(state$dt),
      name = state$name
    ))
  }

  code_lines <- character(0)
  if (nzchar(weight_expr)) {
    result <- .tabulate_dt(state$dt, by = column, weight_expr = weight_expr)
    code_lines <- c(code_lines, sprintf(
      '%s <- %s[, .(n = sum(%s, na.rm = TRUE)), by = .(%s)]',
      .code_name(output_name), .code_name(state$name), weight_expr, .code_name(column)
    ))
  } else {
    result <- state$dt[, .(n = .N), by = column]
    code_lines <- c(code_lines, sprintf(
      '%s <- %s[, .(n = .N), by = .(%s)]',
      .code_name(output_name), .code_name(state$name), .code_name(column)
    ))
  }

  if (sort) {
    result <- result[order(-n)]
    code_lines <- c(code_lines, sprintf('%s <- %s[order(-n)]', .code_name(output_name), .code_name(output_name)))
  }

  if (percent || cumulative) {
    total_n <- sum(result$n, na.rm = TRUE)
    result[, pct := if (isTRUE(all.equal(total_n, 0))) NA_real_ else n / total_n * 100]
    code_lines <- c(code_lines, sprintf('%s[, pct := n / sum(n) * 100]', .code_name(output_name)))
  }

  if (cumulative) {
    result[, cum_pct := cumsum(pct)]
    code_lines <- c(code_lines, sprintf('%s[, cum_pct := cumsum(pct)]', .code_name(output_name)))
  }

  state$dt <- result
  state$name <- output_name
  code_dt <- paste(code_lines, collapse = "\n")
  .push_history(state, code_dt)

  list(
    code = code_dt,
    columns = .dt_column_meta(state$dt),
    nrow = nrow(state$dt),
    ncol = ncol(state$dt),
    preview = .dt_preview(state$dt),
    name = state$name
  )
}


.op_crosstab <- function(params, state) {
  .ensure_state_dt(state)
  engine      <- params$engine %||% "data.table"
  row_var     <- params$row_var %||% stop("row_var required")
  col_var     <- params$col_var %||% stop("col_var required")
  weight_expr <- trimws(params$weight_expr %||% "")
  normalize   <- params$normalize %||% "none"
  totals      <- isTRUE(params$totals)
  output_name <- params$output_name %||% paste0(state$name, "_xtab")
  .validate_object_name(output_name)

  .snapshot_state(state)

  use_tsg <- identical(engine, "tsg") ||
    (identical(engine, "auto") && requireNamespace("tsg", quietly = TRUE))

  if (use_tsg) {
    add_total <- if (!is.null(params$add_total)) isTRUE(params$add_total) else totals
    add_percent <- if (!is.null(params$add_percent)) isTRUE(params$add_percent) else !identical(normalize, "none")
    percent_by_column <- if (!is.null(params$percent_by_column)) {
      isTRUE(params$percent_by_column)
    } else {
      identical(normalize, "col")
    }
    result <- tv_generate_crosstab(
      data = state$dt,
      row_var = row_var,
      col_var = col_var,
      add_total = add_total,
      add_total_row = if (!is.null(params$add_total_row)) isTRUE(params$add_total_row) else totals,
      add_total_column = if (!is.null(params$add_total_column)) isTRUE(params$add_total_column) else totals,
      add_percent = add_percent,
      percent_by_column = percent_by_column,
      convert_factor = isTRUE(params$convert_factor),
      include_na = !identical(params$include_na, FALSE),
      position_total = params$position_total %||% "bottom",
      output_name = output_name,
      as = state$name
    )

    state$dt <- data.table::as.data.table(result)
    state$name <- output_name
    code_dt <- attr(result, "tv_code") %||% "# tsg crosstab"
    .push_history(state, code_dt)
    return(list(
      code = code_dt,
      columns = .dt_column_meta(state$dt),
      nrow = nrow(state$dt),
      ncol = ncol(state$dt),
      preview = .dt_preview(state$dt),
      name = state$name
    ))
  }

  code_lines <- character(0)
  if (nzchar(weight_expr)) {
    long <- .tabulate_dt(state$dt, by = c(row_var, col_var), weight_expr = weight_expr)
    code_lines <- c(code_lines, sprintf(
      '%s <- %s[, .(n = sum(%s, na.rm = TRUE)), by = .(%s, %s)]',
      .code_name(output_name), .code_name(state$name), weight_expr, .code_name(row_var), .code_name(col_var)
    ))
  } else {
    long <- state$dt[, .(n = .N), by = c(row_var, col_var)]
    code_lines <- c(code_lines, sprintf(
      '%s <- %s[, .(n = .N), by = .(%s, %s)]',
      .code_name(output_name), .code_name(state$name), .code_name(row_var), .code_name(col_var)
    ))
  }

  value_var <- "n"
  if (!identical(normalize, "none")) {
    if (identical(normalize, "row")) {
      long[, value := n / sum(n) * 100, by = row_var]
      code_lines <- c(code_lines, sprintf('%s[, value := n / sum(n) * 100, by = %s]', .code_name(output_name), .code_name(row_var)))
    } else if (identical(normalize, "col")) {
      long[, value := n / sum(n) * 100, by = col_var]
      code_lines <- c(code_lines, sprintf('%s[, value := n / sum(n) * 100, by = %s]', .code_name(output_name), .code_name(col_var)))
    } else if (identical(normalize, "all")) {
      long[, value := n / sum(n) * 100]
      code_lines <- c(code_lines, sprintf('%s[, value := n / sum(n) * 100]', .code_name(output_name)))
    } else {
      stop("Unknown normalize option: ", normalize)
    }
    value_var <- "value"
  }

  result <- data.table::dcast(
    long,
    as.formula(sprintf("%s ~ %s", row_var, col_var)),
    value.var = value_var,
    fill = 0
  )
  code_lines <- c(code_lines, sprintf(
    '%s <- data.table::dcast(%s, %s ~ %s, value.var = "%s", fill = 0)',
    .code_name(output_name), .code_name(output_name), .code_name(row_var), .code_name(col_var), value_var
  ))

  if (totals) {
    result <- .add_crosstab_totals(result)
    code_lines <- c(code_lines, .crosstab_totals_code(output_name, row_var))
  }

  state$dt <- result
  state$name <- output_name
  code_dt <- paste(code_lines, collapse = "\n")
  .push_history(state, code_dt)

  list(
    code = code_dt,
    columns = .dt_column_meta(state$dt),
    nrow = nrow(state$dt),
    ncol = ncol(state$dt),
    preview = .dt_preview(state$dt),
    name = state$name
  )
}


.op_fill_na <- function(params, state) {
  .ensure_state_dt(state)
  cols   <- as.character(unlist(params$columns))
  method <- params$method %||% "value"
  value  <- params$value  %||% ""

  .snapshot_state(state)
  lines <- vapply(cols, function(col) {
    if (method == "value") {
      col_obj  <- state$dt[[col]]
      val_expr <- .fill_value_code(value, col_obj)
      sprintf('%s[is.na(%s), %s := %s]', .code_name(state$name), .code_name(col), .code_name(col), val_expr)
    } else {
      nafill_type <- if (method == "down") "locf" else "nocb"
      sprintf('%s[, %s := data.table::nafill(%s, type = "%s")]',
              .code_name(state$name), .code_name(col), .code_name(col), nafill_type)
    }
  }, character(1))

  for (i in seq_along(cols)) {
    col <- cols[i]
    if (method == "value") {
      state$dt[is.na(get(col)), (col) := .coerce_scalar(value, state$dt[[col]])]
    } else {
      nafill_type <- if (method == "down") "locf" else "nocb"
      state$dt[, (col) := data.table::nafill(get(col), type = nafill_type)]
    }
  }

  code_dt <- paste(lines, collapse = "\n")
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt))
}


.op_separate <- function(params, state) {
  .ensure_state_dt(state)
  column <- params$column %||% stop("column required")
  into <- as.character(unlist(params$into))
  sep <- params$sep %||% "_"
  remove <- !identical(params$remove, FALSE)
  if (!length(into)) stop("Provide at least one output column.")

  .snapshot_state(state)
  state$dt[, (into) := data.table::tstrsplit(as.character(get(column)), sep, fixed = TRUE, fill = NA_character_, keep = seq_along(into))]
  code_lines <- c(sprintf(
    '%s[, c(%s) := data.table::tstrsplit(as.character(%s), %s, fixed = TRUE, fill = NA_character_, keep = %s)]',
    .code_name(state$name),
    .code_chr_vec(into),
    .code_name(column),
    .str_lit(sep),
    sprintf("c(%s)", paste(seq_along(into), collapse = ", "))
  ))
  if (remove) {
    state$dt[, (column) := NULL]
    code_lines <- c(code_lines, sprintf('%s[, %s := NULL]', .code_name(state$name), .code_name(column)))
  }
  code_dt <- paste(code_lines, collapse = "\n")
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt))
}


.op_unite <- function(params, state) {
  .ensure_state_dt(state)
  cols <- as.character(unlist(params$columns))
  into <- params$into %||% stop("name required")
  sep <- params$sep %||% "_"
  remove <- !identical(params$remove, FALSE)
  if (!length(cols)) stop("Choose at least one column to combine.")

  .snapshot_state(state)
  state$dt[, (into) := do.call(paste, c(.SD, sep = sep)), .SDcols = cols]
  code_lines <- c(sprintf(
    '%s[, %s := do.call(paste, c(.SD, sep = %s)), .SDcols = c(%s)]',
    .code_name(state$name), .code_name(into), .str_lit(sep), .code_chr_vec(cols)
  ))
  if (remove) {
    state$dt[, (cols) := NULL]
    code_lines <- c(code_lines, sprintf('%s[, c(%s) := NULL]', .code_name(state$name), .code_chr_vec(cols)))
  }
  code_dt <- paste(code_lines, collapse = "\n")
  .push_history(state, code_dt)
  list(code = code_dt, columns = .dt_column_meta(state$dt),
       nrow = nrow(state$dt), ncol = ncol(state$dt))
}


.op_recode <- function(params, state) {
  .ensure_state_dt(state)
  col       <- params$col       %||% stop("col required")
  mapping   <- params$mapping   %||% stop("mapping required")  # list of {from, to}
  as_factor <- isTRUE(params$as_factor)
  new_col   <- trimws(params$new_col %||% "")
  target    <- if (nzchar(new_col)) new_col else col

  if (!col %in% names(state$dt)) stop("Column '", col, "' not found.")

  froms <- vapply(mapping, function(m) as.character(m$from), character(1))
  tos   <- vapply(mapping, function(m) as.character(m$to),   character(1))
  if (!length(froms)) stop("At least one mapping pair required.")

  pairs_r <- paste(sprintf('%s = %s', vapply(froms, .str_lit, character(1)), vapply(tos, .str_lit, character(1))), collapse = ", ")
  lookup  <- sprintf('c(%s)[as.character(%s)]', pairs_r, .code_name(col))

  if (as_factor) {
    lvls_r <- .code_chr_vec(tos)
    code   <- sprintf('%s[, %s := factor(%s, levels = c(%s))]',
                      .code_name(state$name), .code_name(target), lookup, lvls_r)
  } else {
    code   <- sprintf('%s[, %s := %s]', .code_name(state$name), .code_name(target), lookup)
  }

  .snapshot_state(state)
  lookup_vec <- setNames(tos, froms)
  new_vals   <- lookup_vec[as.character(state$dt[[col]])]
  if (as_factor) {
    state$dt[, (target) := factor(new_vals, levels = tos)]
  } else {
    state$dt[, (target) := new_vals]
  }
  .push_history(state, code)

  list(code    = code,
       columns = .dt_column_meta(state$dt),
       preview = .dt_preview(state$dt),
       nrow    = nrow(state$dt),
       ncol    = ncol(state$dt))
}


.factor_levels_in_order <- function(x) {
  if (is.factor(x)) return(levels(x))
  unique(as.character(x[!is.na(x)]))
}


.factor_assign <- function(state, target, values, levels = NULL, as_factor = TRUE) {
  if (isTRUE(as_factor)) {
    state$dt[, (target) := factor(values, levels = levels)]
  } else {
    state$dt[, (target) := values]
  }
}


.op_factor <- function(params, state) {
  .ensure_state_dt(state)
  col <- params$col %||% stop("col required")
  mode <- params$mode %||% stop("mode required")
  new_col <- trimws(params$new_col %||% "")
  target <- if (nzchar(new_col)) new_col else col
  as_factor <- !identical(params$as_factor, FALSE)

  if (!col %in% names(state$dt)) stop("Column '", col, "' not found.")

  x <- state$dt[[col]]
  base_vals <- as.character(x)
  base_non_na <- base_vals[!is.na(base_vals)]
  code_lines <- character(0)

  .snapshot_state(state)

  if (identical(mode, "collapse")) {
    groups <- params$groups %||% list()
    tos <- character(0)
    froms <- character(0)
    for (grp in groups) {
      to <- trimws(as.character(grp$to %||% ""))
      from <- as.character(unlist(grp$from %||% character(0)))
      from <- trimws(from)
      from <- from[nzchar(from)]
      if (!nzchar(to) || !length(from)) next
      tos <- c(tos, rep(to, length(from)))
      froms <- c(froms, from)
    }
    if (!length(froms)) stop("Add at least one category mapping.")
    lookup <- stats::setNames(tos, froms)
    new_vals <- unname(lookup[base_vals])
    keep_idx <- is.na(new_vals)
    new_vals[keep_idx] <- base_vals[keep_idx]
    level_order <- unique(c(unique(tos), new_vals[!is.na(new_vals)]))
    code_lines <- c(
      sprintf("..tv_factor_lookup <- stats::setNames(c(%s), c(%s))",
              .code_chr_vec(tos), .code_chr_vec(froms)),
      sprintf("%s[, %s := ..tv_factor_lookup[as.character(%s)]]",
              .code_name(state$name), .code_name(target), .code_name(col)),
      sprintf("%s[is.na(%s), %s := as.character(%s)]",
              .code_name(state$name), .code_name(target), .code_name(target), .code_name(col))
    )
    if (isTRUE(as_factor)) {
      code_lines <- c(code_lines, sprintf("%s[, %s := factor(%s, levels = c(%s))]",
                                          .code_name(state$name), .code_name(target), .code_name(target), .code_chr_vec(level_order)))
    }
    .factor_assign(state, target, new_vals, levels = level_order, as_factor = as_factor)
  } else if (identical(mode, "lump")) {
    top_n <- suppressWarnings(as.integer(params$top_n %||% NA))
    min_count <- suppressWarnings(as.integer(params$min_count %||% NA))
    other_label <- trimws(params$other_label %||% "Other")
    if (is.na(top_n) && is.na(min_count)) stop("Provide top_n or min_count for lumping.")
    counts <- sort(table(base_non_na), decreasing = TRUE)
    keep <- names(counts)
    if (!is.na(min_count)) keep <- names(counts)[counts >= min_count]
    if (!is.na(top_n)) keep <- utils::head(keep, top_n)
    new_vals <- base_vals
    lump_idx <- !is.na(base_vals) & !(base_vals %in% keep)
    new_vals[lump_idx] <- other_label
    level_order <- c(keep, if (any(lump_idx)) other_label)
    level_order <- unique(c(level_order, new_vals[!is.na(new_vals)]))
    code_lines <- c(
      sprintf("..tv_keep <- c(%s)", .code_chr_vec(keep)),
      sprintf("%s[, %s := data.table::fifelse(!is.na(as.character(%s)) & !(as.character(%s) %%in%% ..tv_keep), %s, as.character(%s))]",
              .code_name(state$name), .code_name(target), .code_name(col), .code_name(col), .str_lit(other_label), .code_name(col))
    )
    if (isTRUE(as_factor)) {
      code_lines <- c(code_lines, sprintf("%s[, %s := factor(%s, levels = c(%s))]",
                                          .code_name(state$name), .code_name(target), .code_name(target), .code_chr_vec(level_order)))
    }
    .factor_assign(state, target, new_vals, levels = level_order, as_factor = as_factor)
  } else if (identical(mode, "reorder")) {
    order_by <- params$order_by %||% "appearance"
    custom_levels <- trimws(as.character(unlist(params$levels %||% character(0))))
    custom_levels <- custom_levels[nzchar(custom_levels)]
    level_order <- switch(
      order_by,
      appearance = unique(base_non_na),
      alphabet_asc = sort(unique(base_non_na)),
      alphabet_desc = sort(unique(base_non_na), decreasing = TRUE),
      freq_desc = names(sort(table(base_non_na), decreasing = TRUE)),
      freq_asc = names(sort(table(base_non_na), decreasing = FALSE)),
      custom = unique(c(custom_levels, setdiff(unique(base_non_na), custom_levels))),
      stop("Unsupported reorder mode: ", order_by)
    )
    code_lines <- c(sprintf("%s[, %s := factor(as.character(%s), levels = c(%s))]",
                            .code_name(state$name), .code_name(target), .code_name(col), .code_chr_vec(level_order)))
    .factor_assign(state, target, base_vals, levels = level_order, as_factor = TRUE)
  } else if (identical(mode, "reference")) {
    ref_level <- trimws(params$ref_level %||% "")
    current_levels <- .factor_levels_in_order(x)
    if (!nzchar(ref_level)) stop("Choose a reference level.")
    if (!ref_level %in% current_levels) stop("Reference level not found in the column.")
    level_order <- c(ref_level, setdiff(current_levels, ref_level))
    code_lines <- c(sprintf("%s[, %s := factor(as.character(%s), levels = c(%s))]",
                            .code_name(state$name), .code_name(target), .code_name(col), .code_chr_vec(level_order)))
    .factor_assign(state, target, base_vals, levels = level_order, as_factor = TRUE)
  } else {
    stop("Unsupported factor mode: ", mode)
  }

  code_dt <- paste(code_lines, collapse = "\n")
  .push_history(state, code_dt)
  list(
    code = code_dt,
    columns = .dt_column_meta(state$dt),
    preview = .dt_preview(state$dt),
    nrow = nrow(state$dt),
    ncol = ncol(state$dt)
  )
}


.condition_to_expr <- function(cond, dt = NULL) {
  col  <- cond$col
  op   <- cond$op
  val  <- cond$val
  col_obj <- if (!is.null(dt) && col %in% names(dt)) dt[[col]] else NULL
  value_code <- .value_to_code(val, col_obj)
  col_code <- .code_name(col)

  switch(op,
    "=="        = sprintf('%s == %s',           col_code, value_code),
    "!="        = sprintf('%s != %s',           col_code, value_code),
    ">"         = sprintf('%s > %s',            col_code, value_code),
    ">="        = sprintf('%s >= %s',           col_code, value_code),
    "<"         = sprintf('%s < %s',            col_code, value_code),
    "<="        = sprintf('%s <= %s',           col_code, value_code),
    "%between%" = {
      bounds <- .split_condition_range(val, col_obj)
      sprintf('(%s >= %s & %s <= %s)', col_code, .scalar_to_code(bounds[[1]]), col_code, .scalar_to_code(bounds[[2]]))
    },
    "%in%"      = {
      items <- paste(vapply(.split_condition_values(val, col_obj), .scalar_to_code, character(1)),
                     collapse = ", ")
      sprintf('%s %%in%% c(%s)', col_code, items)
    },
    "!%in%"     = {
      items <- paste(vapply(.split_condition_values(val, col_obj), .scalar_to_code, character(1)),
                     collapse = ", ")
      sprintf('!(%s %%in%% c(%s))', col_code, items)
    },
    "%like%"    = sprintf('grepl(%s, as.character(%s), ignore.case = TRUE, fixed = TRUE)', .str_lit(val), col_code),
    "%starts%"  = sprintf('startsWith(as.character(%s), %s)', col_code, .str_lit(val)),
    "%ends%"    = sprintf('endsWith(as.character(%s), %s)', col_code, .str_lit(val)),
    "%regex%"   = sprintf('grepl(%s, as.character(%s), perl = TRUE)', .str_lit(val), col_code),
    "!%regex%"  = sprintf('!grepl(%s, as.character(%s), perl = TRUE)', .str_lit(val), col_code),
    "is.na"     = sprintf('is.na(%s)',          col_code),
    "!is.na"    = sprintf('!is.na(%s)',         col_code),
    "is.true"   = sprintf('%s %%in%% TRUE',     col_code),
    "is.false"  = sprintf('%s %%in%% FALSE',    col_code),
    stop("Unknown operator: ", op)
  )
}


.push_history <- function(state, code) {
  state$history <- c(state$history, code)
}


.snapshot_state <- function(state) {
  state$undo_stack <- c(state$undo_stack, list(list(
    dt = if (is.null(state$dt)) NULL else data.table::copy(state$dt),
    name = state$name,
    history = state$history
  )))
}


.tabulate_dt <- function(dt, by, weight_expr = "") {
  work_dt <- data.table::copy(dt)
  if (nzchar(weight_expr)) {
    work_dt[, ..tv_weight__ := eval(parse(text = weight_expr), envir = work_dt)]
    work_dt[, .(n = sum(..tv_weight__, na.rm = TRUE)), by = by]
  } else {
    work_dt[, .(n = .N), by = by]
  }
}


.filter_join_dt <- function(left_dt, right_dt, by_cols, anti = FALSE) {
  left <- data.table::copy(left_dt)
  left[, ..tv_rowid__ := .I]
  right_keys <- unique(right_dt[, by_cols, with = FALSE])
  hit_map <- merge(
    left[, c("..tv_rowid__", by_cols), with = FALSE],
    right_keys,
    by = by_cols,
    all = FALSE,
    sort = FALSE
  )
  hit_ids <- unique(hit_map$..tv_rowid__)
  if (anti) {
    left <- left[!(..tv_rowid__ %in% hit_ids)]
  } else {
    left <- left[..tv_rowid__ %in% hit_ids]
  }
  left[, ..tv_rowid__ := NULL]
  left
}


.relocate_order <- function(current_names, cols, before = NULL, after = NULL) {
  cols <- unique(cols)
  if (!all(cols %in% current_names)) {
    stop("Unknown column(s): ", paste(setdiff(cols, current_names), collapse = ", "))
  }
  if (!is.null(before) && !nzchar(before)) before <- NULL
  if (!is.null(after) && !nzchar(after)) after <- NULL
  if (!is.null(before) && !is.null(after)) {
    stop("Choose either `before` or `after`, not both.")
  }
  if (!is.null(before) && !before %in% current_names) stop("Column '", before, "' not found.")
  if (!is.null(after) && !after %in% current_names) stop("Column '", after, "' not found.")

  remaining <- setdiff(current_names, cols)
  if (!is.null(before)) {
    idx <- match(before, remaining)
    return(append(remaining, cols, after = idx - 1L))
  }
  if (!is.null(after)) {
    idx <- match(after, remaining)
    return(append(remaining, cols, after = idx))
  }
  c(cols, remaining)
}


.sort_dt <- function(dt, cols, descending = FALSE) {
  sorted <- data.table::copy(dt)
  if (!length(cols)) return(sorted)
  order_vec <- ifelse(descending, -1L, 1L)
  data.table::setorderv(sorted, cols = cols, order = order_vec, na.last = TRUE)
  sorted
}


.agg_to_expr <- function(agg) {
  fn <- agg$fn
  output <- agg$output
  col <- agg$col

  switch(fn,
    n = sprintf("%s = .N", .code_name(output)),
    n_distinct = sprintf("%s = data.table::uniqueN(%s)", .code_name(output), .code_name(col)),
    sprintf("%s = %s(%s)", .code_name(output), fn, .code_name(col))
  )
}


.add_crosstab_totals <- function(dt) {
  wide <- data.table::copy(dt)
  id_col <- names(wide)[1]
  measure_cols <- setdiff(names(wide), id_col)
  wide[, Total := rowSums(.SD, na.rm = TRUE), .SDcols = measure_cols]

  totals <- lapply(wide[, c(measure_cols, "Total"), with = FALSE], sum, na.rm = TRUE)
  total_row <- data.table::as.data.table(c(setNames(list("Total"), id_col), totals))
  data.table::rbindlist(list(wide, total_row), fill = TRUE)
}


.crosstab_totals_code <- function(output_name, row_var) {
  paste(
    sprintf('..tv_measure_cols <- setdiff(names(%s), "%s")', output_name, row_var),
    sprintf('%s[, Total := rowSums(.SD, na.rm = TRUE), .SDcols = ..tv_measure_cols]', output_name),
    sprintf('..tv_total_row <- data.table::as.data.table(c(setNames(list("Total"), "%s"), lapply(%s[, c(..tv_measure_cols, "Total"), with = FALSE], sum, na.rm = TRUE)))', row_var, output_name),
    sprintf('%s <- data.table::rbindlist(list(%s, ..tv_total_row), fill = TRUE)', output_name, output_name),
    sep = "\n"
  )
}


.validate_object_name <- function(name) {
  if (!grepl("^[A-Za-z.][A-Za-z0-9._]*$", name)) {
    stop("Invalid output object name: ", name)
  }
  invisible(name)
}


.conditions_to_mask <- function(dt, conditions, logic) {
  masks <- lapply(conditions, function(cond) .condition_to_mask(dt, cond))
  if (!length(masks)) return(rep(TRUE, nrow(dt)))
  reducer <- if (identical(logic, "OR")) `|` else `&`
  Reduce(reducer, masks)
}


.condition_to_mask <- function(dt, cond) {
  col <- cond$col
  op  <- cond$op
  val <- cond$val
  x   <- dt[[col]]

  switch(op,
    "==" = x == .coerce_scalar(val, x),
    "!=" = x != .coerce_scalar(val, x),
    ">" = x > .coerce_scalar(val, x),
    ">=" = x >= .coerce_scalar(val, x),
    "<" = x < .coerce_scalar(val, x),
    "<=" = x <= .coerce_scalar(val, x),
    "%between%" = {
      bounds <- .split_condition_range(val, x)
      x >= bounds[[1]] & x <= bounds[[2]]
    },
    "%in%" = x %in% .split_condition_values(val, x),
    "!%in%" = !(x %in% .split_condition_values(val, x)),
    "%like%" = grepl(val, as.character(x), ignore.case = TRUE, fixed = TRUE),
    "%starts%" = startsWith(as.character(x), as.character(val)),
    "%ends%" = endsWith(as.character(x), as.character(val)),
    "%regex%" = grepl(val, as.character(x), perl = TRUE),
    "!%regex%" = !grepl(val, as.character(x), perl = TRUE),
    "is.na" = is.na(x),
    "!is.na" = !is.na(x),
    "is.true" = x %in% TRUE,
    "is.false" = x %in% FALSE,
    stop("Unknown operator: ", op)
  )
}


.split_condition_values <- function(val, template) {
  parts <- strsplit(val, ",\\s*")[[1]]
  parts <- parts[nzchar(parts)]
  if (is.null(template)) return(parts)
  if (!length(parts)) return(vector(mode = typeof(template), length = 0L))
  vapply(parts, .coerce_scalar, template = template, FUN.VALUE = template[NA_integer_])
}


.split_condition_range <- function(val, template) {
  parts <- strsplit(val, ",\\s*")[[1]]
  parts <- trimws(parts)
  parts <- parts[nzchar(parts)]
  if (length(parts) != 2L) {
    stop("Between filters need two values separated by a comma.")
  }
  list(
    .coerce_scalar(parts[[1]], template),
    .coerce_scalar(parts[[2]], template)
  )
}


.coerce_scalar <- function(value, template) {
  if (inherits(template, "IDate")) return(data.table::as.IDate(value))
  if (inherits(template, "Date")) return(as.Date(value))
  if (inherits(template, "POSIXct")) return(as.POSIXct(value, tz = attr(template, "tzone") %||% "UTC"))
  if (inherits(template, "factor")) return(as.character(value))
  if (is.logical(template)) {
    lower <- tolower(trimws(as.character(value)))
    return(lower %in% c("true", "t", "1", "yes", "y"))
  }
  if (is.integer(template)) return(as.integer(value))
  if (is.numeric(template)) return(as.numeric(value))
  as.character(value)
}


.value_to_code <- function(value, template) {
  .scalar_to_code(.coerce_scalar(value, template))
}


.scalar_to_code <- function(value) {
  if (inherits(value, "IDate")) return(sprintf('data.table::as.IDate("%s")', as.character(value)))
  if (inherits(value, "Date")) return(sprintf('as.Date("%s")', as.character(value)))
  if (inherits(value, "POSIXct")) return(sprintf('as.POSIXct("%s")', format(value, tz = "UTC", usetz = TRUE)))
  if (is.logical(value)) return(if (isTRUE(value)) "TRUE" else "FALSE")
  if (is.numeric(value) || is.integer(value)) return(as.character(value))
  sprintf('"%s"', gsub('"', '\\"', as.character(value), fixed = TRUE))
}


.coerce_column <- function(column, target_type) {
  switch(target_type,
    int = as.integer(column),
    dbl = as.numeric(column),
    chr = as.character(column),
    lgl = as.logical(column),
    IDate = data.table::as.IDate(column),
    factor = as.factor(column),
    stop("Unsupported target type: ", target_type)
  )
}


.coerce_code <- function(name, col_name, target_type) {
  fn <- switch(target_type,
    int = "as.integer",
    dbl = "as.numeric",
    chr = "as.character",
    lgl = "as.logical",
    IDate = "data.table::as.IDate",
    factor = "as.factor",
    stop("Unsupported target type: ", target_type)
  )
  sprintf("%s[, %s := %s(%s)]", .code_name(name), .code_name(col_name), fn, .code_name(col_name))
}


.fill_value_code <- function(value, template) {
  .scalar_to_code(.coerce_scalar(value, template))
}


.code_name <- function(name) {
  name <- as.character(name)
  if (grepl("^[A-Za-z.][A-Za-z0-9._]*$", name)) return(name)
  sprintf("`%s`", gsub("`", "\\\\`", name, fixed = TRUE))
}


.code_name_list <- function(names) {
  paste(vapply(names, .code_name, character(1)), collapse = ", ")
}


.str_lit <- function(value) {
  sprintf('"%s"', gsub('"', '\\"', as.character(value), fixed = TRUE))
}


.code_chr_vec <- function(values) {
  paste(vapply(values, .str_lit, character(1)), collapse = ", ")
}


`%||%` <- function(a, b) if (!is.null(a) && length(a)) a else b
