#' API handlers — one per endpoint, called from .handle_api()


# ── Session helpers ────────────────────────────────────────────────────────────

#' @noRd
.flush_session <- function(state) {
  # Write the live state$dt/name/history/undo_stack back to sessions[[active_idx]]
  if (state$active_idx < 1L) return(invisible(NULL))
  state$sessions[[state$active_idx]] <- list(
    dt         = state$dt,
    name       = state$name,
    history    = state$history,
    undo_stack = state$undo_stack
  )
}

.activate_session <- function(state, idx) {
  s <- state$sessions[[idx]]
  state$dt         <- s$dt
  state$name       <- s$name
  state$history    <- s$history
  state$undo_stack <- s$undo_stack
  state$active_idx <- idx
}

.session_info <- function(state) {
  # returns list of session summaries including live current
  .flush_session(state)
  lapply(seq_along(state$sessions), function(i) {
    s <- state$sessions[[i]]
    list(
      idx    = i,
      name   = s$name %||% "untitled",
      nrow   = if (is.null(s$dt)) 0L else nrow(s$dt),
      ncol   = if (is.null(s$dt)) 0L else ncol(s$dt),
      active = identical(i, state$active_idx)
    )
  })
}

.push_new_session <- function(state) {
  # Save current live state into sessions list (if any data exists)
  if (!is.null(state$dt)) .flush_session(state)
  # Add blank slot; caller fills state$dt etc. then calls .commit_new_session()
}

.commit_new_session <- function(state) {
  # After load_file/load_env sets state$dt etc., call this to register new session
  new_sess <- list(
    dt         = state$dt,
    name       = state$name,
    history    = state$history,
    undo_stack = state$undo_stack
  )
  state$sessions   <- c(state$sessions, list(new_sess))
  state$active_idx <- length(state$sessions)
}

.initial_columns_payload <- function(dt) {
  if (is.null(dt)) return(NULL)
  .safe_dt_column_schema(dt)
}

.rcdf_cache_key <- function(file_path, key_path, password = NULL, return_meta = FALSE) {
  paste(
    normalizePath(file_path, winslash = "/", mustWork = FALSE),
    normalizePath(key_path, winslash = "/", mustWork = FALSE),
    password %||% "",
    if (isTRUE(return_meta)) "meta" else "nometa",
    sep = "|"
  )
}


# ── Session API ────────────────────────────────────────────────────────────────

.api_list_sessions <- function(state) {
  list(ok = TRUE, sessions = .session_info(state))
}

.api_switch_session <- function(params, state) {
  idx <- as.integer(params$idx %||% stop("idx required"))
  if (idx < 1L || idx > length(state$sessions))
    stop("Invalid session index.")
  if (idx == state$active_idx)
    return(list(ok = TRUE, sessions = .session_info(state),
                columns = .initial_columns_payload(state$dt),
                preview = .safe_dt_preview(state$dt),
                nrow    = nrow(state$dt), ncol = ncol(state$dt),
                name    = state$name, history = state$history))

  .flush_session(state)
  .activate_session(state, idx)

  list(
    ok      = TRUE,
    sessions = .session_info(state),
    columns = .initial_columns_payload(state$dt),
    preview = if (is.null(state$dt)) NULL else .safe_dt_preview(state$dt),
    nrow    = if (is.null(state$dt)) 0L   else nrow(state$dt),
    ncol    = if (is.null(state$dt)) 0L   else ncol(state$dt),
    name    = state$name %||% "",
    history = state$history
  )
}

.api_remove_session <- function(params, state) {
  idx <- as.integer(params$idx %||% stop("idx required"))
  n   <- length(state$sessions)
  if (n == 0L || idx < 1L || idx > n) stop("Invalid session index.")

  removing_active <- identical(idx, state$active_idx)

  # Remove from list
  state$sessions <- state$sessions[-idx]

  if (length(state$sessions) == 0L) {
    # No sessions left
    state$dt         <- NULL
    state$name       <- NULL
    state$history    <- character(0)
    state$undo_stack <- list()
    state$active_idx <- 0L
  } else if (removing_active) {
    # Activate whichever session lands at the same slot (or the last one)
    new_idx <- min(idx, length(state$sessions))
    .activate_session(state, new_idx)
  } else {
    # Adjust active_idx if we removed something before it
    if (idx < state$active_idx) state$active_idx <- state$active_idx - 1L
    # Re-sync live state into the (possibly renumbered) slot
    .flush_session(state)
  }

  list(
    ok       = TRUE,
    sessions = .session_info(state),
    columns  = .initial_columns_payload(state$dt),
    preview  = if (is.null(state$dt)) NULL else .safe_dt_preview(state$dt),
    nrow     = if (is.null(state$dt)) 0L   else nrow(state$dt),
    ncol     = if (is.null(state$dt)) 0L   else ncol(state$dt),
    name     = state$name %||% "",
    history  = state$history
  )
}


.api_scan_env <- function() {
  list(objects = .scan_r_env())
}


.api_load_env <- function(params, state) {
  nm      <- params$name    %||% stop("name required")
  element <- params$element        # NULL for direct objects, element name for list items

  obj <- tryCatch(get(nm, envir = .GlobalEnv),
                  error = function(e) stop("Object '", nm, "' not found."))

  if (!is.null(element)) {
    if (grepl("^\\[\\[[0-9]+\\]\\]$", element)) {
      idx <- as.integer(gsub("[^0-9]", "", element))
      obj <- obj[[idx]]
      code_src <- sprintf("%s[[%d]]", .code_name(nm), idx)
    } else {
      obj <- obj[[element]]
      code_src <- sprintf('%s[["%s"]]', .code_name(nm), element)
    }
    as_name  <- params$as %||% element
  } else {
    code_src <- .code_name(nm)
    as_name  <- params$as %||% "DT"
  }

  # Save current session before adding a new one
  .flush_session(state)
  state$dt         <- data.table::as.data.table(.strip_labelled(obj))
  state$name       <- as_name
  state$history    <- character(0)
  state$undo_stack <- list()
  code             <- sprintf('%s <- data.table::as.data.table(%s)', .code_name(state$name), code_src)
  .push_history(state, code)
  .commit_new_session(state)

  list(
    ok       = TRUE,
    code     = code,
    name     = state$name,
    history  = state$history,
    sessions = .session_info(state),
    columns  = .initial_columns_payload(state$dt),
    preview  = .safe_dt_preview(state$dt),
    nrow     = nrow(state$dt),
    ncol     = ncol(state$dt)
  )
}


.api_load_file <- function(params, state) {
  file_info <- .resolve_file_input(params)
  if (!is.null(file_info$cleanup)) {
    on.exit(unlink(file_info$cleanup), add = TRUE)
  }
  path <- file_info$path
  code_path <- file_info$code_path
  as   <- params$as   %||% "DT"
  ext  <- file_info$ext

  if (identical(ext, "rcdf")) {
    return(.api_load_rcdf_file(params, state, file_info))
  }

  result <- switch(ext,
    csv  = ,
    tsv  = {
      dt   <- data.table::fread(path)
      code <- sprintf('%s <- data.table::fread(%s)', .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    xlsx = ,
    xls  = {
      if (!requireNamespace("readxl", quietly = TRUE))
        stop("Package 'readxl' needed for Excel files. Install it with: install.packages('readxl')")
      df   <- readxl::read_excel(path, sheet = params$sheet %||% 1)
      dt   <- data.table::as.data.table(df)
      code <- sprintf('%s <- data.table::as.data.table(readxl::read_excel(%s))',
                      .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    rds  = {
      obj  <- readRDS(path)
      dt   <- data.table::as.data.table(obj)
      code <- sprintf('%s <- data.table::as.data.table(readRDS(%s))',
                      .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    rda  = ,
    rdata = {
      e    <- new.env(parent = emptyenv())
      load(path, envir = e)
      nm   <- ls(e)[1]
      dt   <- data.table::as.data.table(get(nm, envir = e))
      code <- sprintf('load(%s); %s <- data.table::as.data.table(%s)',
                      .str_lit(code_path), .code_name(as), .code_name(nm))
      list(dt = dt, code = code)
    },
    sav  = {
      if (!requireNamespace("haven", quietly = TRUE))
        stop("Package 'haven' needed for SPSS files. Install it with: install.packages('haven')")
      df   <- .strip_labelled(haven::read_sav(path))
      dt   <- data.table::as.data.table(df)
      code <- sprintf('%s <- data.table::as.data.table(haven::read_sav(%s))',
                      .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    dta  = {
      if (!requireNamespace("haven", quietly = TRUE))
        stop("Package 'haven' needed for Stata files. Install it with: install.packages('haven')")
      df   <- .strip_labelled(haven::read_dta(path))
      dt   <- data.table::as.data.table(df)
      code <- sprintf('%s <- data.table::as.data.table(haven::read_dta(%s))',
                      .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    stop("Unsupported file type: .", ext,
         ". Supported: csv, tsv, xlsx, xls, rds, rda, sav, dta, rcdf")
  )

  .flush_session(state)
  state$dt         <- result$dt
  state$name       <- as
  state$history    <- character(0)
  state$undo_stack <- list()
  .push_history(state, result$code)
  .commit_new_session(state)

  list(
    ok       = TRUE,
    code     = result$code,
    name     = state$name,
    history  = state$history,
    sessions = .session_info(state),
    columns  = .initial_columns_payload(state$dt),
    preview  = .safe_dt_preview(state$dt),
    nrow     = nrow(state$dt),
    ncol     = ncol(state$dt)
  )
}


.api_load_rcdf_file <- function(params, state, file_info) {
  .tv_require_namespace("rcdf", "RCDF import")

  key_info <- .resolve_sidecar_input(
    params,
    path_key = "decryption_key",
    file_name_key = "decryption_key_name",
    contents_key = "decryption_key_contents",
    cache_subdir = "keys"
  )
  if (is.null(key_info)) {
    stop("A decryption key is required for RCDF files.")
  }

  password <- params$password %||% NULL
  return_meta <- isTRUE(params$return_meta)
  object_name <- params$rcdf_object_name %||%
    make.names(tools::file_path_sans_ext(basename(file_info$code_path)))
  inspect <- .inspect_rcdf_tables(
    file_info$path,
    key_info$path,
    password,
    return_meta = return_meta
  )
  table_names <- vapply(inspect$tables, function(x) x$name, character(1))
  preferred_tables <- table_names[!grepl("^__", table_names)]
  selected_name <- params$table %||%
    if (length(preferred_tables)) preferred_tables[[1]] else table_names[[1]]
  .load_rcdf_tables_into_state(
    state = state,
    file_path = file_info$path,
    file_code_path = file_info$code_path,
    key_path = key_info$path,
    password = password,
    return_meta = return_meta,
    object_name = object_name,
    selected_tables = selected_name,
    as_name = params$as %||% "DT",
    inspect = inspect
  )
}


.api_inspect_rcdf <- function(params, state) {
  file_info <- .resolve_file_input(params)
  if (!identical(file_info$ext, "rcdf")) stop("Please choose an .rcdf file.")
  key_info <- .resolve_sidecar_input(
    params,
    path_key = "decryption_key",
    file_name_key = "decryption_key_name",
    contents_key = "decryption_key_contents",
    cache_subdir = "keys"
  )
  if (is.null(key_info)) stop("A decryption key is required for RCDF files.")
  password <- params$password %||% NULL
  return_meta <- isTRUE(params$return_meta)
  inspect <- .inspect_rcdf_tables(
    file_info$path,
    key_info$path,
    password,
    return_meta = return_meta
  )
  state$rcdf_cache <- list(
    key = .rcdf_cache_key(file_info$path, key_info$path, password, return_meta),
    inspect = inspect
  )
  list(
    ok = TRUE,
    file_path = file_info$path,
    file_code_path = file_info$code_path,
    key_path = key_info$path,
    return_meta = return_meta,
    rcdf_object_name = params$rcdf_object_name %||% make.names(tools::file_path_sans_ext(basename(file_info$code_path))),
    tables = inspect$tables
  )
}


.api_load_rcdf_tables <- function(params, state) {
  file_path <- params$file_path %||% stop("file_path required")
  file_code_path <- params$file_code_path %||% file_path
  key_path <- params$key_path %||% stop("key_path required")
  selected_tables <- as.character(unlist(params$tables %||% character(0)))
  if (!length(selected_tables)) stop("Choose at least one RCDF table.")
  password <- params$password %||% NULL
  return_meta <- isTRUE(params$return_meta)
  cache_key <- .rcdf_cache_key(file_path, key_path, password, return_meta)
  inspect <- if (!is.null(state$rcdf_cache) && identical(state$rcdf_cache$key, cache_key)) state$rcdf_cache$inspect else NULL
  .load_rcdf_tables_into_state(
    state = state,
    file_path = file_path,
    file_code_path = file_code_path,
    key_path = key_path,
    password = password,
    return_meta = return_meta,
    object_name = params$rcdf_object_name %||% make.names(tools::file_path_sans_ext(basename(file_code_path))),
    selected_tables = selected_tables,
    as_name = params$as %||% "DT",
    inspect = inspect
  )
}


.api_get_column_meta <- function(state) {
  list(
    ok = TRUE,
    columns = if (is.null(state$dt)) NULL else .safe_dt_column_meta(state$dt),
    nrow = if (is.null(state$dt)) 0L else nrow(state$dt),
    ncol = if (is.null(state$dt)) 0L else ncol(state$dt),
    name = state$name %||% ""
  )
}


.inspect_rcdf_tables <- function(file_path, key_path, password = NULL, return_meta = FALSE) {
  .tv_require_namespace("rcdf", "RCDF import")
  rcdf_obj <- rcdf::read_rcdf(
    path = file_path,
    decryption_key = key_path,
    password = password,
    return_meta = return_meta
  )
  table_names <- names(rcdf_obj)[vapply(
    rcdf_obj,
    function(x) is.data.frame(x) || data.table::is.data.table(x),
    logical(1)
  )]
  if (!length(table_names)) stop("No tabular datasets were found in the RCDF file.")
  tables <- lapply(table_names, function(table_name) {
    x <- rcdf_obj[[table_name]]
    list(
      name = table_name,
      nrow = nrow(x),
      ncol = ncol(x),
      class = class(x)[1]
    )
  })
  list(obj = rcdf_obj, tables = tables)
}


.load_rcdf_tables_into_state <- function(state,
                                         file_path,
                                         file_code_path,
                                         key_path,
                                         password = NULL,
                                         return_meta = FALSE,
                                         object_name,
                                         selected_tables,
                                         as_name = "DT",
                                         inspect = NULL) {
  if (is.null(inspect)) {
    inspect <- .inspect_rcdf_tables(
      file_path,
      key_path,
      password,
      return_meta = return_meta
    )
  }
  table_names <- vapply(inspect$tables, function(x) x$name, character(1))
  missing_tables <- setdiff(selected_tables, table_names)
  if (length(missing_tables)) {
    stop("RCDF table(s) not found: ", paste(missing_tables, collapse = ", "))
  }

  rcdf_code <- .tv_rcdf_code(
    path = file_code_path,
    decryption_key = key_path,
    password = password,
    object_name = object_name,
    return_meta = return_meta
  )

  .flush_session(state)
  start_idx <- length(state$sessions) + 1L
  new_sessions <- lapply(selected_tables, function(table_name) {
    session_name <- if (length(selected_tables) == 1L && nzchar(as_name)) as_name else table_name
    dt <- data.table::as.data.table(.strip_labelled(inspect$obj[[table_name]]))
    dt <- .tv_attach_rcdf_metadata(dt, inspect$obj, return_meta = return_meta)
    table_code <- sprintf(
      "%s <- data.table::as.data.table(%s[[%s]])",
      .code_name(session_name),
      .code_name(object_name),
      .str_lit(table_name)
    )
    list(
      dt = dt,
      name = session_name,
      history = c(rcdf_code, table_code),
      undo_stack = list()
    )
  })

  state$sessions <- c(state$sessions, new_sessions)
  .activate_session(state, start_idx)

  list(
    ok = TRUE,
    code = paste(state$history, collapse = "\n"),
    name = state$name,
    history = state$history,
    sessions = .session_info(state),
    columns = .initial_columns_payload(state$dt),
    preview = .safe_dt_preview(state$dt),
    nrow = nrow(state$dt),
    ncol = ncol(state$dt),
    imported_tables = vapply(new_sessions, function(x) x$name, character(1))
  )
}


.api_op_select    <- function(p, s) .op_select(p, s)
.api_op_filter    <- function(p, s) .op_filter(p, s)
.api_op_mutate    <- function(p, s) .op_mutate(p, s)
.api_op_summarise <- function(p, s) .op_summarise(p, s)
.api_op_arrange   <- function(p, s) .op_arrange(p, s)
.api_op_join      <- function(p, s) .op_join(p, s)
.api_op_combine   <- function(p, s) .op_combine(p, s)
.api_op_relocate  <- function(p, s) .op_relocate(p, s)
.api_op_reshape   <- function(p, s) .op_reshape(p, s)
.api_op_rename    <- function(p, s) .op_rename(p, s)
.api_op_dedupe    <- function(p, s) .op_dedupe(p, s)
.api_op_drop_na   <- function(p, s) .op_drop_na(p, s)
.api_op_slice     <- function(p, s) .op_slice(p, s)
.api_op_count     <- function(p, s) .op_count(p, s)
.api_op_fill_na   <- function(p, s) .op_fill_na(p, s)
.api_op_separate  <- function(p, s) .op_separate(p, s)
.api_op_unite     <- function(p, s) .op_unite(p, s)
.api_op_tabulate  <- function(p, s) .op_tabulate(p, s)
.api_op_crosstab  <- function(p, s) .op_crosstab(p, s)
.api_op_join_psgc <- function(p, s) .op_join_psgc(p, s)
.api_op_recode    <- function(p, s) .op_recode(p, s)
.api_op_factor    <- function(p, s) .op_factor(p, s)


.clone_preview_state <- function(state) {
  preview <- new.env(parent = emptyenv())
  preview$dt <- if (is.null(state$dt)) NULL else data.table::copy(state$dt)
  preview$name <- state$name
  preview$history <- character(0)
  preview$undo_stack <- list()
  preview$sessions <- lapply(state$sessions %||% list(), function(sess) {
    list(
      dt = if (is.null(sess$dt)) NULL else data.table::copy(sess$dt),
      name = sess$name,
      history = sess$history %||% character(0),
      undo_stack = sess$undo_stack %||% list()
    )
  })
  preview$active_idx <- state$active_idx %||% 0L
  preview
}


.summarise_preview <- function(before_nrow, before_ncol, result) {
  after_nrow <- as.integer(result$nrow %||% before_nrow)
  after_ncol <- as.integer(result$ncol %||% before_ncol)
  list(
    before_nrow = before_nrow,
    before_ncol = before_ncol,
    after_nrow = after_nrow,
    after_ncol = after_ncol,
    delta_nrow = after_nrow - before_nrow,
    delta_ncol = after_ncol - before_ncol,
    code = result$code %||% ""
  )
}


.reshape_preview_details <- function(before_cols, result) {
  after_cols <- vapply(result$columns %||% list(), function(col) col$name %||% "", character(1))
  after_cols <- after_cols[nzchar(after_cols)]
  list(
    resulting_columns = utils::head(after_cols, 8),
    added_columns = utils::head(setdiff(after_cols, before_cols), 6),
    removed_columns = utils::head(setdiff(before_cols, after_cols), 6)
  )
}


.join_key_vector <- function(dt, by_cols) {
  if (!length(by_cols)) return(character(0))
  key_parts <- lapply(by_cols, function(col) {
    vals <- dt[[col]]
    out <- as.character(vals)
    out[is.na(vals)] <- "<NA>"
    out
  })
  do.call(paste, c(key_parts, list(sep = "\r")))
}


.join_preview_details <- function(left_dt, right_dt, by_cols) {
  by_cols <- as.character(unlist(by_cols %||% character(0)))
  by_cols <- by_cols[nzchar(by_cols)]
  if (!length(by_cols)) return(list())
  if (!all(by_cols %in% names(left_dt))) {
    stop("Join key(s) not found in the current table: ", paste(setdiff(by_cols, names(left_dt)), collapse = ", "))
  }
  if (!all(by_cols %in% names(right_dt))) {
    stop("Join key(s) not found in the other table: ", paste(setdiff(by_cols, names(right_dt)), collapse = ", "))
  }

  left_keys <- .join_key_vector(left_dt, by_cols)
  right_keys <- .join_key_vector(right_dt, by_cols)
  left_unique <- unique(left_keys)
  right_unique <- unique(right_keys)
  matched_keys <- intersect(left_unique, right_unique)

  list(
    matched_keys = length(matched_keys),
    only_left_keys = length(setdiff(left_unique, right_unique)),
    only_right_keys = length(setdiff(right_unique, left_unique)),
    duplicate_keys_left = sum(duplicated(left_keys)),
    duplicate_keys_right = sum(duplicated(right_keys)),
    matched_rows_left = sum(left_keys %in% matched_keys),
    matched_rows_right = sum(right_keys %in% matched_keys),
    many_to_many = sum(duplicated(left_keys)) > 0L && sum(duplicated(right_keys)) > 0L
  )
}


.resolve_join_preview_right_dt <- function(op_params) {
  right_name <- op_params$right_name %||% "other"
  right_dt <- if (!is.null(op_params$right_dt)) {
    data.table::as.data.table(op_params$right_dt)
  } else {
    tryCatch(
      data.table::as.data.table(get(right_name, envir = .GlobalEnv)),
      error = function(e) stop("Object '", right_name, "' not found.")
    )
  }
  list(right_dt = right_dt, right_name = right_name)
}


.api_preview_op <- function(params, state) {
  op <- params$op %||% stop("op required")
  op_params <- params$params %||% list()
  if (is.null(state$dt)) stop("No data loaded.")

  preview <- .clone_preview_state(state)
  before_nrow <- nrow(preview$dt)
  before_ncol <- ncol(preview$dt)
  before_cols <- names(preview$dt)
  extra <- list()

  result <- if (identical(op, "join")) {
    left_dt <- data.table::copy(preview$dt)
    join_input <- .resolve_join_preview_right_dt(op_params)
    extra <- .join_preview_details(left_dt, join_input$right_dt, op_params$by)
    .op_join(c(op_params, list(right_dt = join_input$right_dt, right_name = join_input$right_name)), preview)
  } else {
    switch(op,
      filter = .op_filter(op_params, preview),
      drop_na = .op_drop_na(op_params, preview),
      separate = .op_separate(op_params, preview),
      unite = .op_unite(op_params, preview),
      reshape = {
        reshape_result <- .op_reshape(op_params, preview)
        extra <- .reshape_preview_details(before_cols, reshape_result)
        reshape_result
      },
      combine = .op_combine(op_params, preview),
      stop("Unsupported preview operation: ", op)
    )
  }

  c(list(ok = TRUE), .summarise_preview(before_nrow, before_ncol, result), extra)
}


.api_col_values <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data loaded."))
  col <- params$col %||% stop("col required")
  if (!col %in% names(state$dt)) stop("Column '", col, "' not found.")
  vec  <- state$dt[[col]]

  # value-label map from haven attributes (may be NULL)
  lbl_map <- attr(vec, "labels", exact = TRUE)  # named numeric/char vector

  plain <- .plain_vector(vec)
  vals  <- unique(plain[!is.na(plain)])
  vals  <- tryCatch(sort(vals), error = function(e) vals)
  vals  <- vapply(utils::head(vals, 200), .scalar_display, character(1))

  # build pre-filled suggestions: if a value has a known label, suggest it
  suggestions <- if (!is.null(lbl_map)) {
    lbl_names  <- vapply(as.list(unclass(lbl_map)), .scalar_display, character(1))
    lbl_labels <- names(lbl_map)                 # the human labels
    lookup     <- stats::setNames(lbl_labels, lbl_names)
    vapply(vals, function(v) lookup[v] %||% v, character(1))
  } else {
    vals
  }

  list(ok = TRUE, values = vals, suggestions = suggestions)
}


.api_get_data <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data loaded."))

  page     <- as.integer(params$page %||% 1L)
  per_page <- as.integer(params$per_page %||% 50L)
  search   <- params$search %||% ""
  sort_col <- params$sort_col
  sort_dir <- params$sort_dir %||% "asc"

  dt <- tryCatch(
    data.table::as.data.table(.strip_labelled(state$dt)),
    error = function(e) stop("Unable to render the active dataset: ", conditionMessage(e))
  )

  if (nchar(search)) {
    chr_cols <- names(dt)[sapply(dt, is.character)]
    if (length(chr_cols)) {
      mask <- Reduce(`|`, lapply(chr_cols, function(col) {
        grepl(search, dt[[col]], ignore.case = TRUE, fixed = TRUE)
      }))
      dt <- dt[mask]
    }
  }

  if (!is.null(sort_col) && sort_col %in% names(dt)) {
    dt <- .sort_dt(dt, sort_col, descending = identical(sort_dir, "desc"))
  }

  total  <- nrow(dt)
  start  <- (page - 1L) * per_page + 1L
  end    <- min(start + per_page - 1L, total)
  page_dt <- if (total == 0L) dt else dt[start:end, ]

  list(
    ok       = TRUE,
    total    = total,
    page     = page,
    per_page = per_page,
    rows     = lapply(seq_len(nrow(page_dt)), function(i) {
      row <- lapply(page_dt, function(col) {
        if (length(col) < i) return(NA)
        col[[i]]
      })
      names(row) <- names(page_dt)
      .safe_row_json(row)
    }),
    columns  = .safe_dt_column_schema(dt)
  )
}


.api_get_history <- function(state) {
  list(ok = TRUE, history = state$history)
}


.api_undo <- function(state) {
  if (!length(state$undo_stack)) {
    return(list(ok = FALSE, error = "Nothing to undo."))
  }
  snapshot <- state$undo_stack[[length(state$undo_stack)]]
  state$undo_stack <- utils::head(state$undo_stack, -1L)
  state$dt      <- snapshot$dt
  state$name    <- snapshot$name
  state$history <- snapshot$history

  list(
    ok      = TRUE,
    history = state$history,
    name    = state$name,
    columns = if (is.null(state$dt)) NULL else .safe_dt_column_meta(state$dt),
    preview = if (is.null(state$dt)) NULL else .safe_dt_preview(state$dt),
    nrow    = if (is.null(state$dt)) 0L else nrow(state$dt),
    ncol    = if (is.null(state$dt)) 0L else ncol(state$dt)
  )
}


.export_spec <- function(format, path, name) {
  format <- tolower(as.character(format %||% "csv"))
  supported <- c("csv", "xlsx", "rds", "sav", "dta")
  if (!format %in% supported) stop("Unsupported export format: ", format)

  ext_path <- tools::file_ext(path)
  if (!nzchar(ext_path)) {
    path <- paste0(path, ".", format)
  } else if (!identical(tolower(ext_path), format)) {
    path <- paste0(sub("\\.[^.]+$", "", path), ".", format)
  }

  full_path <- if (grepl("^(?:[A-Za-z]:|/|\\\\\\\\)", path)) {
    normalizePath(path, winslash = "/", mustWork = FALSE)
  } else {
    normalizePath(file.path(getwd(), path), winslash = "/", mustWork = FALSE)
  }

  dir_path <- dirname(full_path)
  package_needed <- switch(format,
    csv = NULL,
    rds = NULL,
    xlsx = "writexl",
    sav = "haven",
    dta = "haven",
    NULL
  )
  package_ok <- if (is.null(package_needed)) TRUE else requireNamespace(package_needed, quietly = TRUE)
  code <- switch(format,
    csv = sprintf('data.table::fwrite(%s, %s)', .code_name(name), .str_lit(full_path)),
    rds = sprintf('saveRDS(%s, %s)', .code_name(name), .str_lit(full_path)),
    xlsx = sprintf('writexl::write_xlsx(as.data.frame(%s), %s)', .code_name(name), .str_lit(full_path)),
    sav = sprintf('haven::write_sav(as.data.frame(%s), %s)', .code_name(name), .str_lit(full_path)),
    dta = sprintf('haven::write_dta(as.data.frame(%s), %s)', .code_name(name), .str_lit(full_path))
  )

  list(
    format = format,
    path = full_path,
    dir = dir_path,
    exists = file.exists(full_path),
    dir_exists = dir.exists(dir_path),
    package_needed = package_needed,
    package_ok = package_ok,
    code = code
  )
}

.api_export_preview <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data to export."))
  format <- params$format %||% "csv"
  path <- params$path %||% paste0(state$name, ".", format)
  spec <- .export_spec(format, path, state$name %||% "DT")
  list(
    ok = TRUE,
    format = spec$format,
    path = spec$path,
    dir = spec$dir,
    working_dir = normalizePath(getwd(), winslash = "/", mustWork = FALSE),
    exists = spec$exists,
    dir_exists = spec$dir_exists,
    package_needed = spec$package_needed,
    package_ok = spec$package_ok,
    code = spec$code
  )
}

.run_windows_folder_chooser <- function(script, start_dir) {
  ps <- Sys.which("powershell")
  if (!nzchar(ps)) ps <- Sys.which("powershell.exe")
  if (!nzchar(ps)) {
    return(list(path = NULL, error = "Windows PowerShell is not available for folder selection."))
  }

  out <- suppressWarnings(system2(
    ps,
    c("-NoProfile", "-STA", "-Command", script),
    stdout = TRUE,
    stderr = TRUE,
    env = sprintf("TV_EXPORT_START_DIR=%s", start_dir)
  ))
  status <- attr(out, "status")
  if (!is.null(status) && status != 0L) {
    detail <- trimws(paste(out, collapse = "\n"))
    detail <- detail[nzchar(detail)]
    msg <- "Windows folder chooser failed to open."
    if (length(detail)) msg <- paste(msg, detail[[1]])
    return(list(path = NULL, error = msg))
  }
  selected <- trimws(paste(out, collapse = "\n"))
  if (!nzchar(selected)) return(list(path = NULL, error = NULL))
  list(path = normalizePath(selected, winslash = "/", mustWork = FALSE), error = NULL)
}

.choose_export_folder_windows <- function(start_dir) {
  forms_script <- paste(
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = 'Choose export folder'",
    "$dialog.ShowNewFolderButton = $true",
    "$start = $env:TV_EXPORT_START_DIR",
    "if ($start -and (Test-Path -LiteralPath $start)) { $dialog.SelectedPath = $start }",
    "$result = $dialog.ShowDialog()",
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) { [Console]::Out.Write($dialog.SelectedPath) }",
    sep = "; "
  )
  forms_result <- .run_windows_folder_chooser(forms_script, start_dir)
  if (!is.null(forms_result$path) || is.null(forms_result$error)) return(forms_result)

  shell_script <- paste(
    "$shell = New-Object -ComObject Shell.Application",
    "$start = $env:TV_EXPORT_START_DIR",
    "$folder = $shell.BrowseForFolder(0, 'Choose export folder', 0, $start)",
    "if ($folder -and $folder.Self -and $folder.Self.Path) { [Console]::Out.Write($folder.Self.Path) }",
    sep = "; "
  )
  shell_result <- .run_windows_folder_chooser(shell_script, start_dir)
  if (!is.null(shell_result$path) || is.null(shell_result$error)) return(shell_result)

  list(
    path = NULL,
    error = paste(
      "Windows folder chooser could not open.",
      forms_result$error %||% "",
      shell_result$error %||% ""
    )
  )
}

.choose_export_folder_rstudio <- function(start_dir) {
  if (!requireNamespace("rstudioapi", quietly = TRUE)) {
    return(list(path = NULL, error = "RStudio folder chooser is not available."))
  }
  if (!isTRUE(rstudioapi::isAvailable())) {
    return(list(path = NULL, error = "RStudio folder chooser is not available in this session."))
  }

  selected <- tryCatch(
    rstudioapi::selectDirectory(
      caption = "Choose export folder",
      label = "Select",
      path = start_dir
    ),
    error = function(e) structure(list(message = conditionMessage(e)), class = "tv_error")
  )

  if (inherits(selected, "tv_error")) {
    return(list(path = NULL, error = paste("RStudio folder chooser failed.", selected$message)))
  }
  selected_chr <- if (is.null(selected)) NULL else as.character(selected)
  if (is.null(selected_chr) || !length(selected_chr) || is.na(selected_chr[[1]]) || !nzchar(selected_chr[[1]])) {
    return(list(path = NULL, error = NULL))
  }

  list(
    path = normalizePath(selected_chr[[1]], winslash = "/", mustWork = FALSE),
    error = NULL
  )
}

.api_choose_export_folder <- function(params, state) {
  start_dir <- params$start_dir %||% getwd()
  start_dir <- normalizePath(start_dir, winslash = "/", mustWork = FALSE)

  selected <- NULL
  chooser_error <- NULL
  rstudio_result <- .choose_export_folder_rstudio(start_dir)
  selected <- rstudio_result$path
  chooser_error <- rstudio_result$error
  if (identical(.Platform$OS.type, "windows")) {
    win_result <- .choose_export_folder_windows(start_dir)
    if (is.null(selected)) {
      selected <- win_result$path
      chooser_error <- chooser_error %||% win_result$error
    }
  }
  if (is.null(selected) && exists("choose.dir", envir = asNamespace("utils"), mode = "function")) {
    selected <- utils::choose.dir(default = start_dir, caption = "Choose export folder")
  } else if (is.null(selected) && capabilities("tcltk")) {
    if (!requireNamespace("tcltk", quietly = TRUE)) {
      stop(chooser_error %||% "Folder selection is not available in this R session. Enter the folder path manually.")
    }
    selected <- tcltk::tk_choose.dir(default = start_dir, caption = "Choose export folder")
  } else if (is.null(selected)) {
    stop(chooser_error %||% "Folder selection is not available in this R session. Enter the folder path manually.")
  }

  selected_chr <- if (is.null(selected)) NULL else as.character(selected)
  if (is.null(selected_chr) || !length(selected_chr) || is.na(selected_chr[[1]]) || !nzchar(selected_chr[[1]])) {
    return(list(ok = TRUE, cancelled = TRUE, path = start_dir, reason = "no_selection"))
  }

  list(
    ok = TRUE,
    cancelled = FALSE,
    path = normalizePath(selected_chr[[1]], winslash = "/", mustWork = FALSE)
  )
}

.api_export <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data to export."))

  format <- params$format %||% "csv"
  path <- params$path %||% paste0(state$name, ".", format)
  overwrite <- isTRUE(params$overwrite)
  spec <- .export_spec(format, path, state$name)

  if (!spec$dir_exists) {
    stop("The destination folder does not exist: ", spec$dir)
  }
  if (spec$exists && !overwrite) {
    stop("File already exists: ", spec$path, ". Choose a different filename or confirm overwrite.")
  }
  if (!spec$package_ok) {
    stop("Package '", spec$package_needed, "' needed for ", toupper(spec$format), " export. Install with: install.packages('", spec$package_needed, "')")
  }

  code <- switch(spec$format,
    csv  = {
      data.table::fwrite(state$dt, spec$path)
      spec$code
    },
    rds  = {
      saveRDS(state$dt, spec$path)
      spec$code
    },
    xlsx = {
      writexl::write_xlsx(as.data.frame(state$dt), spec$path)
      spec$code
    },
    sav = {
      haven::write_sav(as.data.frame(state$dt), spec$path)
      spec$code
    },
    dta = {
      haven::write_dta(as.data.frame(state$dt), spec$path)
      spec$code
    }
  )

  .push_history(state, code)
  list(ok = TRUE, code = code, path = spec$path, existed = spec$exists)
}


.api_save_to_env <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data to save."))
  nm <- params$name %||% stop("name required")
  if (!grepl("^[A-Za-z.][A-Za-z0-9._]*$", nm))
    stop("Invalid R object name: ", nm)
  assign(nm, data.table::copy(state$dt), envir = .GlobalEnv)
  code <- sprintf("%s <- data.table::copy(%s)", .code_name(nm), .code_name(state$name))
  .push_history(state, code)
  list(ok = TRUE, code = code, name = nm)
}


.api_get_settings <- function(state) {
  theme <- state$theme
  code_style <- tolower(as.character(state$code_style %||% "native"))
  if (!code_style %in% c("native", "tidyverse")) code_style <- "native"
  list(
    seed      = theme$seed %||% "#534AB7",
    dark      = isTRUE(theme$dark),
    perPage   = state$per_page %||% 50L,
    codeStyle = code_style
  )
}


.api_set_theme <- function(params, state) {
  seed     <- params$seed %||% "#534AB7"
  dark     <- isTRUE(params$dark)
  per_page <- as.integer(params$perPage %||% 50L)
  code_style <- tolower(as.character(params$codeStyle %||% "native"))
  if (!code_style %in% c("native", "tidyverse")) code_style <- "native"

  state$theme      <- m3_theme(seed, dark)
  state$per_page   <- per_page
  state$code_style <- code_style

  list(
    ok = TRUE,
    css = .theme_to_css(state$theme),
    dark = dark,
    seed = seed,
    perPage = per_page,
    codeStyle = code_style
  )
}


.resolve_file_input <- function(params) {
  path <- params$path
  if (!is.null(path) && nzchar(path) && file.exists(path)) {
    return(list(
      path = path,
      ext = tolower(tools::file_ext(path)),
      cleanup = NULL,
      code_path = normalizePath(path, winslash = "/", mustWork = TRUE)
    ))
  }

  file_name <- params$file_name %||% path %||% stop("path or file_name required")
  contents  <- params$contents %||% stop("No readable file contents were provided.")
  ext       <- tolower(tools::file_ext(file_name))
  cache_dir <- file.path(getwd(), ".tidyview-cache")
  dir.create(cache_dir, recursive = TRUE, showWarnings = FALSE)
  safe_name <- gsub("[^A-Za-z0-9._-]", "_", basename(file_name))
  persisted <- file.path(cache_dir, safe_name)
  writeBin(jsonlite::base64_dec(contents), persisted)
  list(
    path = persisted,
    ext = ext,
    cleanup = NULL,
    code_path = file.path(".tidyview-cache", safe_name)
  )
}


# ── Summary backends ──────────────────────────────────────────────────────────

.audit_summary <- function(dt, name, top_n = 3L) {
  n   <- nrow(dt)
  p   <- ncol(dt)
  top_n <- max(1L, as.integer(top_n))

  missing_cells    <- sum(vapply(dt, function(x) sum(is.na(x)), integer(1)))
  rows_with_miss   <- sum(!stats::complete.cases(dt))
  dup_rows         <- sum(duplicated(dt))
  cols_with_miss   <- sum(vapply(dt, anyNA, logical(1)))
  types            <- vapply(dt, .r_type_label, character(1))
  type_counts      <- as.list(table(types))
  const_cols       <- sum(vapply(dt, function(x) length(unique(x[!is.na(x)])) <= 1L, logical(1)))
  miss_pct_total   <- if (n * p == 0L) 0 else round(100 * missing_cells / (n * p), 1)

  overview <- list(
    nrow             = n,
    ncol             = p,
    rows_with_missing = rows_with_miss,
    columns_with_missing = cols_with_miss,
    duplicate_rows   = dup_rows,
    missing_cells    = missing_cells,
    missing_pct      = miss_pct_total,
    constant_columns = const_cols,
    all_missing_columns = sum(vapply(dt, function(x) all(is.na(.plain_vector(x))), logical(1))),
    type_counts      = type_counts
  )

  columns <- lapply(seq_along(dt), function(i) {
    col   <- dt[[i]]
    nm    <- names(dt)[i]
    lbl   <- attr(col, "label", exact = TRUE)
    type  <- .r_type_label(col)
    plain <- .plain_vector(col)
    miss_n  <- sum(is.na(plain))
    miss_pct <- if (n == 0L) 0 else round(100 * miss_n / n, 1)
    non_na  <- plain[!is.na(plain)]
    dist_n  <- length(unique(non_na))
    is_const <- dist_n <= 1L

    samp <- as.list(utils::head(vapply(utils::head(unique(non_na), top_n), .scalar_display, character(1)), top_n))

    freq_tab  <- sort(table(non_na), decreasing = TRUE)
    top_vals  <- as.list(vapply(names(utils::head(freq_tab, top_n)), function(v) {
      sprintf("%s (%d)", v, freq_tab[[v]])
    }, character(1)))

    min_val <- NULL; max_val <- NULL; summary_str <- NULL
    if (type %in% c("int", "dbl")) {
      nv <- suppressWarnings(as.numeric(non_na))
      nv <- nv[!is.na(nv)]
      if (length(nv)) {
        min_val     <- .scalar_display(min(nv))
        max_val     <- .scalar_display(max(nv))
        summary_str <- sprintf("mean %.3g, sd %.3g", mean(nv), stats::sd(nv))
      }
    }

    list(
      name        = nm,
      label       = if (!is.null(lbl)) as.character(lbl) else NULL,
      type        = type,
      missing_n   = miss_n,
      missing_pct = miss_pct,
      distinct_n  = dist_n,
      constant    = is_const,
      sample      = samp,
      top_values  = top_vals,
      min         = min_val,
      max         = max_val,
      summary     = summary_str
    )
  })

  if (length(columns)) {
    miss_n  <- vapply(columns, function(col) col$missing_n %||% 0, numeric(1))
    miss_pct <- vapply(columns, function(col) col$missing_pct %||% 0, numeric(1))
    is_const <- vapply(columns, function(col) isTRUE(col$constant), logical(1))
    names_v  <- vapply(columns, function(col) col$name %||% "", character(1))
    ord <- order(-miss_n, -miss_pct, -as.integer(is_const), names_v)
    top_missing_idx <- ord[miss_n[ord] > 0]
    top_missing_idx <- utils::head(top_missing_idx, 5L)
    constant_idx <- ord[is_const[ord]]
    constant_idx <- utils::head(constant_idx, 5L)
    all_missing_idx <- ord[miss_n[ord] >= n & n > 0]
    all_missing_idx <- utils::head(all_missing_idx, 5L)
  } else {
    top_missing_idx <- integer(0)
    constant_idx <- integer(0)
    all_missing_idx <- integer(0)
  }

  highlights <- list(
    top_missing_columns = lapply(top_missing_idx, function(i) {
      list(
        name = columns[[i]]$name,
        missing_n = columns[[i]]$missing_n,
        missing_pct = columns[[i]]$missing_pct
      )
    }),
    constant_columns = lapply(constant_idx, function(i) {
      list(
        name = columns[[i]]$name,
        missing_n = columns[[i]]$missing_n,
        missing_pct = columns[[i]]$missing_pct
      )
    }),
    all_missing_columns = lapply(all_missing_idx, function(i) {
      list(
        name = columns[[i]]$name,
        missing_n = columns[[i]]$missing_n,
        missing_pct = columns[[i]]$missing_pct
      )
    })
  )

  code <- sprintf("audit_result <- tv_audit(%s, top_n = %dL)", .code_name(name), top_n)
  list(ok = TRUE, overview = overview, columns = columns, highlights = highlights, code = code)
}


.missing_summary <- function(dt, name, group_by = NULL) {
  n <- nrow(dt)
  p <- ncol(dt)

  missing_cells    <- sum(vapply(dt, function(x) sum(is.na(x)), integer(1)))
  rows_with_miss   <- sum(!stats::complete.cases(dt))
  cols_with_miss   <- sum(vapply(dt, anyNA, logical(1)))
  miss_pct_total   <- if (n * p == 0L) 0 else round(100 * missing_cells / (n * p), 1)

  overview <- list(
    nrow                  = n,
    ncol                  = p,
    rows_with_missing     = rows_with_miss,
    rows_without_missing  = n - rows_with_miss,
    columns_with_missing  = cols_with_miss,
    missing_cells         = missing_cells,
    missing_pct           = miss_pct_total
  )

  columns <- lapply(seq_along(dt), function(i) {
    col   <- dt[[i]]
    nm    <- names(dt)[i]
    lbl   <- attr(col, "label", exact = TRUE)
    type  <- .r_type_label(col)
    plain <- .plain_vector(col)
    miss_n  <- sum(is.na(plain))
    miss_pct <- if (n == 0L) 0 else round(100 * miss_n / n, 1)
    non_na  <- plain[!is.na(plain)]
    dist_n  <- length(unique(non_na))
    samp    <- as.list(utils::head(vapply(utils::head(unique(non_na), 3L), .scalar_display, character(1)), 3L))
    list(
      name        = nm,
      label       = if (!is.null(lbl)) as.character(lbl) else NULL,
      type        = type,
      missing_n   = miss_n,
      missing_pct = miss_pct,
      distinct_n  = dist_n,
      summary     = sprintf("%d missing (%.1f%%)", miss_n, miss_pct),
      sample      = samp
    )
  })

  if (length(columns)) {
    miss_n  <- vapply(columns, function(col) col$missing_n %||% 0, numeric(1))
    miss_pct <- vapply(columns, function(col) col$missing_pct %||% 0, numeric(1))
    names_v  <- vapply(columns, function(col) col$name %||% "", character(1))
    ord_cols <- order(-miss_n, -miss_pct, names_v)
    columns <- columns[ord_cols]
  }

  group_summary <- list()
  if (!is.null(group_by) && nzchar(group_by) && group_by %in% names(dt)) {
    grp_plain <- .plain_vector(dt[[group_by]])
    grp_vals  <- unique(grp_plain)
    group_summary <- lapply(grp_vals, function(gv) {
      mask <- if (is.na(gv)) {
        is.na(grp_plain)
      } else {
        !is.na(grp_plain) & grp_plain == gv
      }
      sub_dt  <- dt[mask]
      sub_n   <- nrow(sub_dt)
      sub_miss_rows  <- sum(!stats::complete.cases(sub_dt))
      sub_miss_cells <- sum(vapply(sub_dt, function(x) sum(is.na(x)), integer(1)))
      list(
        group             = if (is.na(gv)) NULL else .scalar_display(gv),
        rows              = sub_n,
        rows_with_missing = sub_miss_rows,
        missing_row_pct   = if (sub_n == 0L) 0 else round(100 * sub_miss_rows / sub_n, 1),
        missing_cells     = sub_miss_cells,
        missing_cell_pct  = if (sub_n * p == 0L) 0 else round(100 * sub_miss_cells / (sub_n * p), 1)
      )
    })
    if (length(group_summary)) {
      grp_miss_cells <- vapply(group_summary, function(item) item$missing_cells %||% 0, numeric(1))
      grp_miss_pct <- vapply(group_summary, function(item) item$missing_row_pct %||% 0, numeric(1))
      grp_names <- vapply(group_summary, function(item) item$group %||% "", character(1))
      ord_groups <- order(-grp_miss_cells, -grp_miss_pct, grp_names)
      group_summary <- group_summary[ord_groups]
    }
  }

  highlights <- list(
    top_missing_columns = lapply(utils::head(columns, 5L), function(col) {
      list(
        name = col$name,
        missing_n = col$missing_n,
        missing_pct = col$missing_pct
      )
    }),
    top_groups = lapply(utils::head(group_summary, 5L), function(item) {
      list(
        group = item$group,
        rows = item$rows,
        rows_with_missing = item$rows_with_missing,
        missing_row_pct = item$missing_row_pct,
        missing_cells = item$missing_cells,
        missing_cell_pct = item$missing_cell_pct
      )
    })
  )

  code_args <- if (!is.null(group_by) && nzchar(group_by))
    sprintf(", group_by = %s", .str_lit(group_by)) else ""
  code <- sprintf("missing_result <- tv_missing_summary(%s%s)", .code_name(name), code_args)
  list(ok = TRUE, overview = overview, columns = columns, group_summary = group_summary, highlights = highlights, code = code)
}


.validate_summary <- function(dt, name, rules) {
  n <- nrow(dt)

  parse_allowed_values <- function(x) {
    if (is.null(x)) return(character(0))
    if (is.character(x) && length(x) == 1L) {
      vals <- unlist(strsplit(x, "[,\r\n]+", perl = TRUE), use.names = FALSE)
      vals <- trimws(vals)
      return(vals[nzchar(vals)])
    }
    vals <- as.character(unlist(x, recursive = TRUE, use.names = FALSE))
    vals <- trimws(vals)
    vals[nzchar(vals)]
  }

  is_date_like <- function(x) {
    inherits(x, "Date") || inherits(x, "IDate") || inherits(x, "POSIXct")
  }

  coerce_range_bound <- function(raw, template) {
    if (is.null(raw)) return(NULL)
    raw <- trimws(as.character(raw)[1] %||% "")
    if (!nzchar(raw)) return(NULL)

    if (inherits(template, "POSIXct")) {
      tz <- attr(template, "tzone", exact = TRUE)
      if (is.null(tz) || !length(tz) || !nzchar(tz[[1]])) tz <- "UTC"
      out <- suppressWarnings(as.POSIXct(raw, tz = tz[[1]]))
      return(if (is.na(out)) NULL else out)
    }
    if (inherits(template, "IDate")) {
      out <- suppressWarnings(data.table::as.IDate(raw))
      return(if (is.na(out)) NULL else out)
    }
    if (inherits(template, "Date")) {
      out <- suppressWarnings(as.Date(raw))
      return(if (is.na(out)) NULL else out)
    }

    out <- suppressWarnings(as.numeric(raw))
    if (is.na(out)) NULL else out
  }

  rule_results_raw <- lapply(rules, function(rule) {
    id     <- rule$id      %||% ""
    label  <- rule$label   %||% id
    type   <- rule$type    %||% "custom"
    col    <- rule$column  %||% rule$col %||% NULL
    if (identical(type, "not_missing")) type <- "not_null"
    if (identical(type, "allowed")) type <- "allowed_values"
    if (identical(type, "expr")) type <- "custom"

    tryCatch({
      mask <- switch(type,
        not_null = {
          if (is.null(col) || !col %in% names(dt)) stop("column required")
          !is.na(dt[[col]])
        },
        unique = {
          if (is.null(col) || !col %in% names(dt)) stop("column required")
          !duplicated(dt[[col]])
        },
        range = {
          if (is.null(col) || !col %in% names(dt)) stop("column required")
          m  <- rep(TRUE, n)
          v <- dt[[col]]
          if (inherits(v, "POSIXct")) {
            tz <- attr(v, "tzone", exact = TRUE)
            if (is.null(tz) || !length(tz) || !nzchar(tz[[1]])) tz <- "UTC"
            v_cmp <- as.POSIXct(v, tz = tz[[1]])
          } else if (inherits(v, "Date") || inherits(v, "IDate")) {
            v_cmp <- v
          } else {
            v_cmp <- suppressWarnings(as.numeric(v))
          }
          lo <- coerce_range_bound(rule$min, v)
          hi <- coerce_range_bound(rule$max, v)
          present <- !is.na(v_cmp)
          if (!is.null(lo)) m[present] <- m[present] & v_cmp[present] >= lo
          if (!is.null(hi)) m[present] <- m[present] & v_cmp[present] <= hi
          m
        },
        allowed_values = {
          if (is.null(col) || !col %in% names(dt)) stop("column required")
          allowed <- parse_allowed_values(rule$values)
          as.character(dt[[col]]) %in% allowed
        },
        regex = {
          if (is.null(col) || !col %in% names(dt)) stop("column required")
          pat <- rule$pattern %||% ""
          grepl(pat, as.character(dt[[col]]), ignore.case = isTRUE(rule$ignore_case))
        },
        not_future = {
          if (is.null(col) || !col %in% names(dt)) stop("column required")
          v <- dt[[col]]
          if (!is_date_like(v)) stop("date or datetime column required")
          m <- rep(TRUE, n)
          if (inherits(v, "POSIXct")) {
            tz <- attr(v, "tzone", exact = TRUE)
            if (is.null(tz) || !length(tz) || !nzchar(tz[[1]])) tz <- "UTC"
            v_cmp <- as.POSIXct(v, tz = tz[[1]])
            cutoff <- as.POSIXct(Sys.time(), tz = tz[[1]])
          } else if (inherits(v, "IDate")) {
            v_cmp <- v
            cutoff <- data.table::as.IDate(Sys.Date())
          } else {
            v_cmp <- as.Date(v)
            cutoff <- Sys.Date()
          }
          present <- !is.na(v_cmp)
          m[present] <- v_cmp[present] <= cutoff
          m
        },
        custom = {
          expr <- rule$expr %||% stop("expr required for custom rule")
          eval(parse(text = expr), envir = dt)
        },
        stop("unknown rule type: ", type)
      )
      mask <- as.logical(mask)
      mask[is.na(mask)] <- FALSE
      fail_idx <- which(!mask)
      fail_n <- length(fail_idx)
      pass_n <- sum(mask)
      fail_samp <- if (fail_n > 0 && !is.null(col) && col %in% names(dt)) {
        as.list(utils::head(vapply(dt[[col]][fail_idx], .scalar_display, character(1)), 5L))
      } else list()
      list(
        id = id, label = label, type = type, column = col,
        status = if (fail_n == 0L) "pass" else "fail",
        failing_n = fail_n, passing_n = pass_n,
        detail = sprintf("%d failing / %d passing", fail_n, pass_n),
        sample = fail_samp,
        fail_idx = fail_idx
      )
    }, error = function(e) {
      list(
        id = id, label = label, type = type, column = col,
        status = "error", failing_n = NA_integer_, passing_n = NA_integer_,
        detail = conditionMessage(e), sample = list(),
        fail_idx = integer(0)
      )
    })
  })

  issue_mask <- rep(FALSE, n)
  column_masks <- list()
  for (res in rule_results_raw) {
    fail_idx <- res$fail_idx %||% integer(0)
    if (!length(fail_idx)) next
    issue_mask[fail_idx] <- TRUE
    col <- res$column %||% ""
    if (nzchar(col)) {
      col_mask <- column_masks[[col]]
      if (is.null(col_mask)) col_mask <- rep(FALSE, n)
      col_mask[fail_idx] <- TRUE
      column_masks[[col]] <- col_mask
    }
  }

  column_issue_counts <- if (length(column_masks)) {
    counts <- vapply(column_masks, sum, integer(1))
    ord <- order(-counts, names(counts))
    lapply(seq_along(ord), function(i) {
      idx <- ord[[i]]
      list(column = names(counts)[[idx]], failing_rows = unname(counts[[idx]]))
    })
  } else {
    list()
  }

  rule_results <- lapply(rule_results_raw, function(res) {
    res$fail_idx <- NULL
    res
  })

  pass_rules <- sum(vapply(rule_results, function(r) identical(r$status, "pass"), logical(1)))
  fail_rules <- sum(vapply(rule_results, function(r) identical(r$status, "fail"), logical(1)))
  error_rules <- sum(vapply(rule_results, function(r) identical(r$status, "error"), logical(1)))
  rows_with_issues <- sum(issue_mask)
  rows_without_issues <- n - rows_with_issues

  overview <- list(
    nrow                = n,
    rule_count          = length(rules),
    passing_rules       = pass_rules,
    failing_rules       = fail_rules,
    error_rules         = error_rules,
    rows_with_issues    = rows_with_issues,
    rows_without_issues = rows_without_issues,
    columns_with_issues = column_issue_counts
  )

  code <- sprintf("validate_result <- tv_validate(%s, rules = rules_list)", .code_name(name))
  list(ok = TRUE, overview = overview, rules = rule_results, code = code)
}


.compare_key_string <- function(dt, by) {
  if (!length(by)) return(character(0))
  key_parts <- lapply(by, function(col) {
    vals <- dt[[col]]
    out <- as.character(vals)
    out[is.na(vals)] <- "<NA>"
    out
  })
  do.call(paste, c(key_parts, list(sep = "\r")))
}


.compare_cell_equal <- function(left, right) {
  if (length(left) == 1L && length(right) == 1L && !is.list(left) && !is.list(right)) {
    if (is.na(left) && is.na(right)) return(TRUE)
  }
  isTRUE(all.equal(left, right, check.attributes = FALSE))
}


.compare_cell_text <- function(value) {
  if (!length(value)) return("NULL")
  if (is.list(value)) {
    flat <- unlist(value, recursive = TRUE, use.names = FALSE)
    if (!length(flat)) return("[]")
    return(paste(as.character(flat), collapse = ", "))
  }
  if (length(value) == 1L) {
    if (is.na(value)) return("NA")
    return(as.character(value))
  }
  out <- as.character(value)
  out[is.na(value)] <- "NA"
  paste(out, collapse = ", ")
}


.compare_key_label <- function(dt, row_idx, by) {
  if (!length(by)) return("matched row")
  paste(vapply(by, function(col) {
    sprintf("%s=%s", col, .compare_cell_text(dt[[col]][[row_idx]]))
  }, character(1)), collapse = ", ")
}


.compare_summary <- function(left_dt, left_name, params, state) {
  ..tv_compare_key__ <- NULL
  # Resolve right-side dataset (supports GUI params or programmatic right_dt)
  if (!is.null(params$right_dt)) {
    right_dt   <- params$right_dt
    right_name <- params$right_name %||% "other"
  } else {
    source_type <- params$source_type %||% "session"
    if (identical(source_type, "session")) {
      idx <- as.integer(params$session_idx %||% stop("session_idx required"))
      if (idx < 1L || idx > length(state$sessions)) stop("Invalid session index.")
      right_dt   <- state$sessions[[idx]]$dt
      right_name <- state$sessions[[idx]]$name %||% paste0("session_", idx)
    } else {
      nm  <- params$name %||% stop("name required")
      obj <- tryCatch(get(nm, envir = .GlobalEnv),
                      error = function(e) stop("Object '", nm, "' not found."))
      el  <- params$element
      if (!is.null(el)) {
        obj <- if (grepl("^\\[\\[[0-9]+\\]\\]$", el)) {
          obj[[as.integer(gsub("[^0-9]", "", el))]]
        } else obj[[el]]
        right_name <- el
      } else {
        right_name <- nm
      }
      right_dt <- data.table::as.data.table(.strip_labelled(obj))
    }
  }

  lc <- names(left_dt);   rc <- names(right_dt)
  shared     <- intersect(lc, rc)
  left_only  <- setdiff(lc, rc)
  right_only <- setdiff(rc, lc)

  type_mismatches <- Filter(Negate(is.null), lapply(shared, function(col) {
    lt <- .r_type_label(left_dt[[col]])
    rt <- .r_type_label(right_dt[[col]])
    if (!identical(lt, rt)) list(column = col, left_type = lt, right_type = rt) else NULL
  }))

  by <- as.character(unlist(params$by %||% character(0)))
  by <- by[nzchar(by) & by %in% shared]

  key_summary <- NULL
  if (length(by)) {
    lk <- .compare_key_string(left_dt, by)
    rk <- .compare_key_string(right_dt, by)
    matched_keys <- intersect(unique(lk), unique(rk))
    duplicate_keys_left <- sum(duplicated(lk))
    duplicate_keys_right <- sum(duplicated(rk))
    key_summary <- list(
      matched_keys         = length(matched_keys),
      only_left_keys       = length(setdiff(unique(lk), unique(rk))),
      only_right_keys      = length(setdiff(unique(rk), unique(lk))),
      duplicate_keys_left  = duplicate_keys_left,
      duplicate_keys_right = duplicate_keys_right,
      matched_rows_left    = sum(lk %in% matched_keys),
      matched_rows_right   = sum(rk %in% matched_keys),
      compare_ready        = identical(duplicate_keys_left, 0L) && identical(duplicate_keys_right, 0L),
      changed_rows         = NULL,
      unchanged_rows       = NULL,
      changed_columns      = list(),
      changed_column_counts = list(),
      changed_examples     = list()
    )

    compare_cols <- setdiff(shared, by)
    if (isTRUE(key_summary$compare_ready)) {
      if (!length(compare_cols) || !length(matched_keys)) {
        key_summary$changed_rows <- 0L
        key_summary$unchanged_rows <- length(matched_keys)
      } else {
        left_idx <- lk %in% matched_keys
        right_idx <- rk %in% matched_keys

        left_match <- data.table::copy(left_dt[left_idx, c(by, compare_cols), with = FALSE])
        right_match <- data.table::copy(right_dt[right_idx, c(by, compare_cols), with = FALSE])
        left_match[, ..tv_compare_key__ := lk[left_idx]]
        right_match[, ..tv_compare_key__ := rk[right_idx]]

        merged <- merge(
          left_match,
          right_match,
          by = c("..tv_compare_key__", by),
          suffixes = c("_left", "_right"),
          sort = FALSE
        )

        changed_column_counts <- stats::setNames(integer(length(compare_cols)), compare_cols)
        changed_rows <- 0L
        changed_examples <- list()

        for (i in seq_len(nrow(merged))) {
          changed_cols <- character(0)
          change_parts <- character(0)
          for (col in compare_cols) {
            left_val <- merged[[paste0(col, "_left")]][[i]]
            right_val <- merged[[paste0(col, "_right")]][[i]]
            if (!.compare_cell_equal(left_val, right_val)) {
              changed_cols <- c(changed_cols, col)
              changed_column_counts[[col]] <- changed_column_counts[[col]] + 1L
              change_parts <- c(
                change_parts,
                sprintf("%s: %s -> %s", col, .compare_cell_text(left_val), .compare_cell_text(right_val))
              )
            }
          }
          if (length(changed_cols)) {
            changed_rows <- changed_rows + 1L
            if (length(changed_examples) < 5L) {
              changed_examples[[length(changed_examples) + 1L]] <- list(
                key = .compare_key_label(merged, i, by),
                changed_columns = as.list(changed_cols),
                summary = paste(change_parts, collapse = "; ")
              )
            }
          }
        }

        changed_cols_nonzero <- names(changed_column_counts)[changed_column_counts > 0L]
        key_summary$changed_rows <- changed_rows
        key_summary$unchanged_rows <- length(matched_keys) - changed_rows
        key_summary$changed_columns <- as.list(changed_cols_nonzero)
        key_summary$changed_column_counts <- lapply(changed_cols_nonzero, function(col) {
          list(column = col, count = unname(changed_column_counts[[col]]))
        })
        key_summary$changed_examples <- changed_examples
      }
    }
  }

  by_str <- if (length(by)) sprintf(", by = c(%s)", .code_chr_vec(by)) else ""
  code   <- sprintf("compare_result <- tv_compare(%s, %s%s)",
                    .code_name(left_name), .code_name(right_name), by_str)

  list(
    ok                 = TRUE,
    overview           = list(
      left_name            = left_name,
      right_name           = right_name,
      left_nrow            = nrow(left_dt),
      right_nrow           = nrow(right_dt),
      left_ncol            = ncol(left_dt),
      right_ncol           = ncol(right_dt),
      shared_columns_n     = length(shared),
      left_only_columns_n  = length(left_only),
      right_only_columns_n = length(right_only),
      type_mismatches_n    = length(type_mismatches)
    ),
    shared_columns     = as.list(shared),
    left_only_columns  = as.list(left_only),
    right_only_columns = as.list(right_only),
    type_mismatches    = type_mismatches,
    key_summary        = key_summary,
    code               = code
  )
}


# ── Summary API handlers ───────────────────────────────────────────────────────

.api_audit_summary <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data loaded."))
  top_n <- suppressWarnings(as.integer(params$top_n %||% 3L))
  if (is.na(top_n) || top_n < 1L) top_n <- 3L
  .audit_summary(state$dt, state$name %||% "DT", top_n)
}


.api_missing_summary <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data loaded."))
  group_by <- params$group_by %||% NULL
  if (!is.null(group_by) && !nzchar(trimws(group_by))) group_by <- NULL
  .missing_summary(state$dt, state$name %||% "DT", group_by)
}


.api_validate_summary <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data loaded."))
  rules <- params$rules %||% list()
  if (!is.list(rules)) rules <- list()
  .validate_summary(state$dt, state$name %||% "DT", rules)
}


.api_compare_summary <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data loaded."))
  .compare_summary(state$dt, state$name %||% "DT", params, state)
}


.resolve_sidecar_input <- function(params,
                                   path_key,
                                   file_name_key,
                                   contents_key,
                                   cache_subdir = NULL) {
  path <- params[[path_key]]
  if (!is.null(path) && nzchar(path) && file.exists(path)) {
    return(list(
      path = path,
      code_path = normalizePath(path, winslash = "/", mustWork = TRUE),
      cleanup = NULL
    ))
  }

  file_name <- params[[file_name_key]]
  contents <- params[[contents_key]]
  if (is.null(file_name) || is.null(contents)) return(NULL)

  cache_dir <- file.path(getwd(), ".tidyview-cache", cache_subdir %||% "")
  dir.create(cache_dir, recursive = TRUE, showWarnings = FALSE)
  safe_name <- gsub("[^A-Za-z0-9._-]", "_", basename(file_name))
  persisted <- file.path(cache_dir, safe_name)
  writeBin(jsonlite::base64_dec(contents), persisted)
  list(
    path = persisted,
    code_path = normalizePath(persisted, winslash = "/", mustWork = TRUE),
    cleanup = NULL
  )
}
