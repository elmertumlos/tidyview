#' API handlers — one per endpoint, called from .handle_api()


# ── Session helpers ────────────────────────────────────────────────────────────

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
                columns = .safe_dt_column_meta(state$dt),
                preview = .safe_dt_preview(state$dt),
                nrow    = nrow(state$dt), ncol = ncol(state$dt),
                name    = state$name, history = state$history))

  .flush_session(state)
  .activate_session(state, idx)

  list(
    ok      = TRUE,
    sessions = .session_info(state),
    columns = if (is.null(state$dt)) NULL else .safe_dt_column_meta(state$dt),
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
    columns  = if (is.null(state$dt)) NULL else .safe_dt_column_meta(state$dt),
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
    columns  = .safe_dt_column_meta(state$dt),
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
    columns  = .safe_dt_column_meta(state$dt),
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
    as_name = params$as %||% "DT"
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
  .load_rcdf_tables_into_state(
    state = state,
    file_path = file_path,
    file_code_path = file_code_path,
    key_path = key_path,
    password = params$password %||% NULL,
    return_meta = isTRUE(params$return_meta),
    object_name = params$rcdf_object_name %||% make.names(tools::file_path_sans_ext(basename(file_code_path))),
    selected_tables = selected_tables,
    as_name = params$as %||% "DT"
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
                                         as_name = "DT") {
  inspect <- .inspect_rcdf_tables(
    file_path,
    key_path,
    password,
    return_meta = return_meta
  )
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
    columns = .safe_dt_column_meta(state$dt),
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


.api_preview_op <- function(params, state) {
  op <- params$op %||% stop("op required")
  op_params <- params$params %||% list()
  if (is.null(state$dt)) stop("No data loaded.")

  preview <- .clone_preview_state(state)
  before_nrow <- nrow(preview$dt)
  before_ncol <- ncol(preview$dt)

  result <- switch(op,
    filter = .op_filter(op_params, preview),
    join = .op_join(op_params, preview),
    drop_na = .op_drop_na(op_params, preview),
    combine = .op_combine(op_params, preview),
    stop("Unsupported preview operation: ", op)
  )

  c(list(ok = TRUE), .summarise_preview(before_nrow, before_ncol, result))
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
  vals  <- vapply(head(vals, 200), .scalar_display, character(1))

  # build pre-filled suggestions: if a value has a known label, suggest it
  suggestions <- if (!is.null(lbl_map)) {
    lbl_names  <- vapply(as.list(unclass(lbl_map)), .scalar_display, character(1))
    lbl_labels <- names(lbl_map)                 # the human labels
    lookup     <- setNames(lbl_labels, lbl_names)
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
  state$undo_stack <- head(state$undo_stack, -1L)
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


.api_export <- function(params, state) {
  if (is.null(state$dt)) return(list(ok = FALSE, error = "No data to export."))

  format <- params$format %||% "csv"
  path   <- params$path   %||%
    file.path(getwd(), paste0(state$name, ".", format))

  code <- switch(format,
    csv  = {
      data.table::fwrite(state$dt, path)
      sprintf('data.table::fwrite(%s, %s)', .code_name(state$name), .str_lit(normalizePath(path, winslash = "/", mustWork = FALSE)))
    },
    rds  = {
      saveRDS(state$dt, path)
      sprintf('saveRDS(%s, %s)', .code_name(state$name), .str_lit(normalizePath(path, winslash = "/", mustWork = FALSE)))
    },
    xlsx = {
      if (!requireNamespace("writexl", quietly = TRUE))
        stop("Package 'writexl' needed for Excel export. Install with: install.packages('writexl')")
      writexl::write_xlsx(as.data.frame(state$dt), path)
      sprintf('writexl::write_xlsx(as.data.frame(%s), %s)', .code_name(state$name), .str_lit(normalizePath(path, winslash = "/", mustWork = FALSE)))
    },
    sav = {
      if (!requireNamespace("haven", quietly = TRUE))
        stop("Package 'haven' needed for SPSS export. Install with: install.packages('haven')")
      haven::write_sav(as.data.frame(state$dt), path)
      sprintf('haven::write_sav(as.data.frame(%s), %s)', .code_name(state$name), .str_lit(normalizePath(path, winslash = "/", mustWork = FALSE)))
    },
    dta = {
      if (!requireNamespace("haven", quietly = TRUE))
        stop("Package 'haven' needed for Stata export. Install with: install.packages('haven')")
      haven::write_dta(as.data.frame(state$dt), path)
      sprintf('haven::write_dta(as.data.frame(%s), %s)', .code_name(state$name), .str_lit(normalizePath(path, winslash = "/", mustWork = FALSE)))
    },
    stop("Unsupported export format: ", format)
  )

  .push_history(state, code)
  list(ok = TRUE, code = code, path = path)
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
  types            <- vapply(dt, .r_type_label, character(1))
  type_counts      <- as.list(table(types))
  const_cols       <- sum(vapply(dt, function(x) length(unique(x[!is.na(x)])) <= 1L, logical(1)))
  miss_pct_total   <- if (n * p == 0L) 0 else round(100 * missing_cells / (n * p), 1)

  overview <- list(
    nrow             = n,
    ncol             = p,
    rows_with_missing = rows_with_miss,
    duplicate_rows   = dup_rows,
    missing_cells    = missing_cells,
    missing_pct      = miss_pct_total,
    constant_columns = const_cols,
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

    samp <- as.list(head(vapply(head(unique(non_na), top_n), .scalar_display, character(1)), top_n))

    freq_tab  <- sort(table(non_na), decreasing = TRUE)
    top_vals  <- as.list(vapply(names(head(freq_tab, top_n)), function(v) {
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

  code <- sprintf("audit_result <- tv_audit(%s, top_n = %dL)", .code_name(name), top_n)
  list(ok = TRUE, overview = overview, columns = columns, code = code)
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
    samp    <- as.list(head(vapply(head(unique(non_na), 3L), .scalar_display, character(1)), 3L))
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

  group_summary <- list()
  if (!is.null(group_by) && nzchar(group_by) && group_by %in% names(dt)) {
    grp_plain <- .plain_vector(dt[[group_by]])
    grp_vals  <- unique(grp_plain[!is.na(grp_plain)])
    group_summary <- lapply(grp_vals, function(gv) {
      mask    <- !is.na(grp_plain) & grp_plain == gv
      sub_dt  <- dt[mask]
      sub_n   <- nrow(sub_dt)
      sub_miss_rows  <- sum(!stats::complete.cases(sub_dt))
      sub_miss_cells <- sum(vapply(sub_dt, function(x) sum(is.na(x)), integer(1)))
      list(
        group             = .scalar_display(gv),
        rows              = sub_n,
        rows_with_missing = sub_miss_rows,
        missing_row_pct   = if (sub_n == 0L) 0 else round(100 * sub_miss_rows / sub_n, 1),
        missing_cells     = sub_miss_cells
      )
    })
  }

  code_args <- if (!is.null(group_by) && nzchar(group_by))
    sprintf(", group_by = %s", .str_lit(group_by)) else ""
  code <- sprintf("missing_result <- tv_missing_summary(%s%s)", .code_name(name), code_args)
  list(ok = TRUE, overview = overview, columns = columns, group_summary = group_summary, code = code)
}


.validate_summary <- function(dt, name, rules) {
  n <- nrow(dt)

  rule_results <- lapply(rules, function(rule) {
    id     <- rule$id      %||% ""
    label  <- rule$label   %||% id
    type   <- rule$type    %||% "custom"
    col    <- rule$column  %||% rule$col %||% NULL
    if (identical(type, "not_missing")) type <- "not_null"
    if (identical(type, "allowed")) type <- "allowed_values"

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
          lo <- suppressWarnings(as.numeric(rule$min))
          hi <- suppressWarnings(as.numeric(rule$max))
          v  <- suppressWarnings(as.numeric(dt[[col]]))
          m  <- rep(TRUE, n)
          if (!is.na(lo)) m <- m & !is.na(v) & v >= lo
          if (!is.na(hi)) m <- m & !is.na(v) & v <= hi
          m
        },
        allowed_values = {
          if (is.null(col) || !col %in% names(dt)) stop("column required")
          allowed <- as.character(unlist(rule$values %||% character(0)))
          as.character(dt[[col]]) %in% allowed
        },
        regex = {
          if (is.null(col) || !col %in% names(dt)) stop("column required")
          pat <- rule$pattern %||% ""
          grepl(pat, as.character(dt[[col]]))
        },
        custom = {
          expr <- rule$expr %||% stop("expr required for custom rule")
          eval(parse(text = expr), envir = dt)
        },
        stop("unknown rule type: ", type)
      )
      mask <- as.logical(mask)
      mask[is.na(mask)] <- FALSE
      fail_n <- sum(!mask)
      pass_n <- sum(mask)
      fail_samp <- if (fail_n > 0 && !is.null(col) && col %in% names(dt)) {
        as.list(head(vapply(dt[[col]][!mask], .scalar_display, character(1)), 5L))
      } else list()
      list(
        id = id, label = label, type = type, column = col,
        status = if (fail_n == 0L) "pass" else "fail",
        failing_n = fail_n, passing_n = pass_n,
        detail = sprintf("%d failing / %d passing", fail_n, pass_n),
        sample = fail_samp
      )
    }, error = function(e) {
      list(
        id = id, label = label, type = type, column = col,
        status = "error", failing_n = NA_integer_, passing_n = NA_integer_,
        detail = conditionMessage(e), sample = list()
      )
    })
  })

  pass_rules <- sum(vapply(rule_results, function(r) identical(r$status, "pass"), logical(1)))
  fail_rules <- sum(vapply(rule_results, function(r) identical(r$status, "fail"), logical(1)))

  overview <- list(
    nrow              = n,
    rule_count        = length(rules),
    passing_rules     = pass_rules,
    failing_rules     = fail_rules,
    rows_with_issues  = NA_integer_,
    rows_without_issues = NA_integer_
  )

  code <- sprintf("validate_result <- tv_validate(%s, rules = rules_list)", .code_name(name))
  list(ok = TRUE, overview = overview, rules = rule_results, code = code)
}


.compare_summary <- function(left_dt, left_name, params, state) {
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
    key_sep <- "\r"
    lk <- do.call(paste, c(lapply(by, function(c) as.character(left_dt[[c]])),  list(sep = key_sep)))
    rk <- do.call(paste, c(lapply(by, function(c) as.character(right_dt[[c]])), list(sep = key_sep)))
    key_summary <- list(
      matched_keys      = length(intersect(unique(lk), unique(rk))),
      only_left_keys    = length(setdiff(unique(lk), unique(rk))),
      only_right_keys   = length(setdiff(unique(rk), unique(lk))),
      duplicate_keys_left  = sum(duplicated(lk)),
      duplicate_keys_right = sum(duplicated(rk)),
      changed_rows     = NULL,
      changed_columns  = list()
    )
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
