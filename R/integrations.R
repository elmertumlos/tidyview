#' Optional package integrations for tidyview
#'
#' These helpers expose higher-level workflows powered by `rcdf`, `tsg`, and
#' a bundled PSGC reference dataset, with optional package integrations when
#' those packages are installed.

#' @noRd
.tv_require_namespace <- function(pkg, feature) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    stop(
      "Package '", pkg, "' is required for ", feature,
      ". Install it with install.packages('", pkg, "').",
      call. = FALSE
    )
  }
  invisible(TRUE)
}


.tv_as_data_table <- function(x) {
  if (data.table::is.data.table(x)) data.table::copy(x) else data.table::as.data.table(x)
}


.tv_rcdf_code <- function(path,
                          decryption_key,
                          password = NULL,
                          object_name = "rcdf_data",
                          return_meta = FALSE) {
  args <- c(
    sprintf("path = %s", .str_lit(normalizePath(path, winslash = "/", mustWork = TRUE))),
    sprintf("decryption_key = %s", .str_lit(normalizePath(decryption_key, winslash = "/", mustWork = TRUE)))
  )
  if (!is.null(password) && nzchar(password)) {
    args <- c(args, sprintf("password = %s", .str_lit(password)))
  }
  if (isTRUE(return_meta)) {
    args <- c(args, "return_meta = TRUE")
  }
  sprintf("%s <- rcdf::read_rcdf(%s)", .code_name(object_name), paste(args, collapse = ", "))
}


.tv_attach_rcdf_metadata <- function(x, rcdf_obj, return_meta = FALSE) {
  if (!isTRUE(return_meta)) return(x)
  meta <- attr(rcdf_obj, "metadata", exact = TRUE)
  if (!is.null(meta)) attr(x, "metadata") <- meta
  x
}


.tv_get_psgc_code <- function(level = NULL, harmonize = TRUE, minimal = TRUE, cols = NULL) {
  args <- character(0)
  if (!is.null(level) && nzchar(level)) args <- c(args, sprintf("level = %s", .str_lit(.tv_normalize_psgc_level(level))))
  if (!identical(harmonize, TRUE)) args <- c(args, sprintf("harmonize = %s", toupper(harmonize)))
  if (!identical(minimal, TRUE)) args <- c(args, sprintf("minimal = %s", toupper(minimal)))
  if (length(cols)) args <- c(args, sprintf("cols = c(%s)", .code_chr_vec(cols)))
  sprintf("tidyview::tv_get_psgc(%s)", paste(args, collapse = ", "))
}


.tv_psgc_bundled_path <- function() {
  ns_path <- tryCatch(getNamespaceInfo(asNamespace("tidyview"), "path"), error = function(e) "")
  candidates <- unique(Filter(
    nzchar,
    c(
      system.file("extdata", "psgc_reference.rds", package = "tidyview"),
      if (nzchar(ns_path)) file.path(ns_path, "extdata", "psgc_reference.rds"),
      if (nzchar(ns_path)) file.path(ns_path, "inst", "extdata", "psgc_reference.rds"),
      file.path(getwd(), "inst", "extdata", "psgc_reference.rds")
    )
  ))
  matches <- candidates[file.exists(candidates)]
  if (!length(matches)) {
    stop(
      "Bundled PSGC reference not found. Reinstall tidyview or restore inst/extdata/psgc_reference.rds.",
      call. = FALSE
    )
  }
  matches[[1]]
}


.tv_read_bundled_psgc <- function() {
  dt <- data.table::as.data.table(readRDS(.tv_psgc_bundled_path()))
  needed <- c("area_code", "area_name", "psgc_level")
  missing <- setdiff(needed, names(dt))
  if (length(missing)) {
    stop(
      "Bundled PSGC reference is missing required column(s): ",
      paste(missing, collapse = ", "),
      ".",
      call. = FALSE
    )
  }
  dt
}


.tv_subset_psgc <- function(dt, filters, env) {
  if (!length(filters)) return(dt)
  keep <- rep(TRUE, nrow(dt))
  for (expr in filters) {
    res <- eval(expr, envir = dt, enclos = env)
    if (!is.logical(res)) {
      stop("PSGC filter expressions must return TRUE/FALSE values.", call. = FALSE)
    }
    if (length(res) != nrow(dt)) {
      stop("PSGC filter expressions must return one logical value per row.", call. = FALSE)
    }
    keep <- keep & !is.na(res) & res
  }
  dt[keep]
}


.tv_infer_area_columns <- function(data) {
  nms <- names(data)
  list(
    region = if ("region_code" %in% nms) "region_code" else NULL,
    province = if ("province_code" %in% nms) "province_code" else NULL,
    city_mun = if ("city_mun_code" %in% nms) "city_mun_code" else NULL,
    barangay = if ("barangay_code" %in% nms) "barangay_code" else NULL
  )
}


.tv_normalize_psgc_level <- function(level = "barangays") {
  key <- tolower(trimws(level %||% "barangays"))
  switch(
    key,
    region = "regions",
    regions = "regions",
    province = "provinces",
    provinces = "provinces",
    municipality = "municipalities",
    municipalities = "municipalities",
    city_municipality = "municipalities",
    city_mun = "municipalities",
    barangay = "barangays",
    barangays = "barangays",
    stop("Unsupported PSGC level: ", level)
  )
}


.tv_psgc_component_columns <- function(level,
                                       region_col = NULL,
                                       province_col = NULL,
                                       city_mun_col = NULL,
                                       barangay_col = NULL) {
  normalized <- .tv_normalize_psgc_level(level)
  all_cols <- c(
    region_col = region_col,
    province_col = province_col,
    city_mun_col = city_mun_col,
    barangay_col = barangay_col
  )
  needed <- switch(
    normalized,
    regions = c("region_col"),
    provinces = c("region_col", "province_col"),
    municipalities = c("region_col", "province_col", "city_mun_col"),
    barangays = c("region_col", "province_col", "city_mun_col", "barangay_col")
  )
  missing <- needed[vapply(all_cols[needed], function(x) is.null(x) || !nzchar(x), logical(1))]
  if (length(missing)) {
    stop(
      "Provide ",
      paste(sprintf("`%s`", missing), collapse = ", "),
      " when `level = ", normalized, "`."
    )
  }
  unname(all_cols[needed])
}


.tv_psgc_expected_code_length <- function(level) {
  10L
}


.tv_psgc_significant_length <- function(level) {
  switch(
    .tv_normalize_psgc_level(level),
    regions = 2L,
    provinces = 5L,
    municipalities = 7L,
    barangays = 10L
  )
}


.tv_psgc_level_label <- function(level) {
  switch(
    .tv_normalize_psgc_level(level),
    regions = "region",
    provinces = "province",
    municipalities = "municipality",
    barangays = "barangay"
  )
}


.tv_validate_psgc_name_col <- function(name_col, existing_names) {
  if (is.null(name_col) || !nzchar(name_col) || identical(name_col, "area_name")) return(invisible(NULL))
  if (name_col %in% existing_names) {
    stop("Column '", name_col, "' already exists. Choose a different output name.")
  }
  invisible(NULL)
}


.tv_psgc_normalize_area_code <- function(x, level) {
  vals <- as.character(x)
  out <- vals
  keep <- !is.na(vals) & nzchar(vals)
  if (!any(keep)) return(out)

  sig_len <- .tv_psgc_significant_length(level)
  bad <- keep & nchar(vals) < sig_len
  if (any(bad)) {
    examples <- paste(utils::head(unique(vals[bad]), 3), collapse = ", ")
    stop(
      "Code value(s) do not contain enough digits for ", .tv_psgc_level_label(level),
      " lookup. Expected at least ", sig_len, " digit(s). Example value(s): ", examples, "."
    )
  }

  shortened <- substr(vals[keep], 1L, sig_len)
  out[keep] <- sprintf("%-*s", 10L, shortened)
  out[keep] <- gsub(" ", "0", out[keep], fixed = TRUE)
  out
}


.tv_validate_existing_psgc_code <- function(dt, area_code, level) {
  vals <- as.character(dt[[area_code]])
  vals <- vals[!is.na(vals) & nzchar(vals)]
  if (!length(vals)) return(invisible(NULL))
  lengths <- unique(nchar(vals))
  min_needed <- .tv_psgc_significant_length(level)
  if (all(lengths >= min_needed & lengths <= 10L)) return(invisible(NULL))

  examples <- paste(utils::head(unique(vals), 3), collapse = ", ")
  stop(
    "Column '", area_code, "' does not look like a usable PSGC ", .tv_psgc_level_label(level),
    " code. Expected at least ", min_needed, " digit(s) and at most 10 digit(s), but found length(s): ",
    paste(lengths, collapse = ", "),
    ". Example value(s): ", examples,
    ". Use `build area_code` with the component codes instead."
  )
}


.tv_join_psgc_impl <- function(data,
                               area_code = NULL,
                               level = "barangays",
                               harmonize = TRUE,
                               minimal = TRUE,
                               cols = NULL,
                               region_col = NULL,
                               province_col = NULL,
                               city_mun_col = NULL,
                               barangay_col = NULL,
                               name_col = NULL,
                               keep_helper_cols = FALSE) {
  ..tv_psgc_join_code <- area_code_old <- NULL
  dt <- .tv_as_data_table(data)
  original_names <- names(dt)
  level <- .tv_normalize_psgc_level(level)
  area_code_col <- area_code
  area_cols <- .tv_infer_area_columns(dt)
  .tv_validate_psgc_name_col(name_col, original_names)

  if (is.null(area_code_col) || !nzchar(area_code_col)) {
    region_col <- region_col %||% area_cols$region
    province_col <- province_col %||% area_cols$province
    city_mun_col <- city_mun_col %||% area_cols$city_mun
    barangay_col <- barangay_col %||% area_cols$barangay

    build_cols <- .tv_psgc_component_columns(
      level = level,
      region_col = region_col,
      province_col = province_col,
      city_mun_col = city_mun_col,
      barangay_col = barangay_col
    )
    dt[, ..tv_psgc_join_code := .tv_psgc_normalize_area_code(
      do.call(paste0, lapply(build_cols, function(col) as.character(get(col)))),
      level = level
    )]
  } else if (!area_code_col %in% names(dt)) {
    stop("Column '", area_code_col, "' not found.")
  } else {
    .tv_validate_existing_psgc_code(dt, area_code_col, level)
    dt[, ..tv_psgc_join_code := .tv_psgc_normalize_area_code(get(area_code_col), level = level)]
  }

  ref <- tv_get_psgc(level = level, harmonize = harmonize, minimal = minimal, cols = cols)

  if (is.null(area_code_col) || !nzchar(area_code_col)) {
    joined <- merge(dt, ref, by.x = "..tv_psgc_join_code", by.y = "area_code", all.x = TRUE, sort = FALSE)
  } else {
    joined <- merge(dt, ref, by.x = "..tv_psgc_join_code", by.y = "area_code", all.x = TRUE, sort = FALSE)
  }

  if (isTRUE(keep_helper_cols)) {
    if ("..tv_psgc_join_code" %in% names(joined)) {
      data.table::setnames(joined, "..tv_psgc_join_code", "area_code")
    }
  } else {
    if ("..tv_psgc_join_code" %in% names(joined)) joined[, ..tv_psgc_join_code := NULL]
    if ("area_code_old" %in% names(joined)) joined[, area_code_old := NULL]
  }

  if (!is.null(name_col) && nzchar(name_col) && !identical(name_col, "area_name")) {
    if (!"area_name" %in% names(joined)) {
      stop("PSGC join did not return an 'area_name' column to rename.")
    }
    data.table::setnames(joined, "area_name", name_col)
  }
  joined
}


#' Read an RCDF file
#'
#' This helper requires the optional `rcdf` package. `tidyview` itself can run
#' without `rcdf` installed; only RCDF import needs it.
#'
#' @param path Path to an `.rcdf` file.
#' @param decryption_key Path to the decryption key used to open the RCDF file.
#'   In the current tidyview workflow, this is typically a PEM private-key
#'   file path.
#' @param password Optional password for the private-key file.
#' @param return_meta If `TRUE`, include RCDF metadata in the returned object.
#' @param table Optional table name to extract from the RCDF object.
#' @param as Name to use for the RCDF object in generated code.
#' @export
tv_read_rcdf <- function(path,
                         decryption_key,
                         password = NULL,
                         return_meta = FALSE,
                         table = NULL,
                         as = "rcdf_data") {
  .tv_require_namespace("rcdf", "RCDF import")

  obj <- rcdf::read_rcdf(
    path = path,
    decryption_key = decryption_key,
    password = password,
    return_meta = return_meta
  )
  code <- .tv_rcdf_code(
    path,
    decryption_key,
    password = password,
    object_name = as,
    return_meta = return_meta
  )

  if (!is.null(table)) {
    if (!table %in% names(obj)) stop("Table '", table, "' not found in RCDF object.")
    dt <- data.table::as.data.table(.strip_labelled(obj[[table]]))
    dt <- .tv_attach_rcdf_metadata(dt, obj, return_meta = return_meta)
    attr(dt, "tv_code") <- paste(
      code,
      sprintf("%s <- data.table::as.data.table(%s[[%s]])",
              .code_name(table), .code_name(as), .str_lit(table)),
      sep = "\n"
    )
    return(dt)
  }

  tables <- obj
  for (nm in names(tables)) {
    if (is.data.frame(tables[[nm]]) || data.table::is.data.table(tables[[nm]])) {
      tables[[nm]] <- data.table::as.data.table(.strip_labelled(tables[[nm]]))
      tables[[nm]] <- .tv_attach_rcdf_metadata(tables[[nm]], obj, return_meta = return_meta)
    }
  }
  attr(tables, "tv_code") <- code
  tables
}


#' Generate a frequency table with `tsg`
#'
#' @param data A data frame or data.table.
#' @param column Column name to tabulate.
#' @param sort_value Sort by value.
#' @param sort_except Optional character vector of columns exempt from sorting.
#' @param convert_factor Convert labelled outputs to factors.
#' @param top_n Keep only the top `n` categories.
#' @param top_n_only If `TRUE`, drops lumped categories when `top_n` is used.
#' @param add_total Add a total row.
#' @param include_na Include missing values.
#' @param position_total Position of the total row.
#' @param output_name Object name used in generated code for the result.
#' @param as Name to use in generated code.
#' @export
tv_generate_frequency <- function(data,
                                  column,
                                  sort_value = TRUE,
                                  sort_except = NULL,
                                  convert_factor = FALSE,
                                  top_n = NULL,
                                  top_n_only = FALSE,
                                  add_total = TRUE,
                                  include_na = TRUE,
                                  position_total = c("bottom", "top"),
                                  output_name = "result",
                                  as = deparse(substitute(data))) {
  .tv_require_namespace("tsg", "frequency tables")

  position_total <- match.arg(position_total)
  dt <- data.table::as.data.table(data)

  expr <- substitute(
    tsg::generate_frequency(
      .data,
      .column,
      sort_value = .sort_value,
      sort_except = .sort_except,
      convert_factor = .convert_factor,
      top_n = .top_n,
      top_n_only = .top_n_only,
      add_total = .add_total,
      include_na = .include_na,
      position_total = .position_total
    ),
    list(
      .data = quote(work_df),
      .column = as.name(column),
      .sort_value = sort_value,
      .sort_except = sort_except,
      .convert_factor = convert_factor,
      .top_n = top_n,
      .top_n_only = top_n_only,
      .add_total = add_total,
      .include_na = include_na,
      .position_total = position_total
    )
  )

  work_df <- as.data.frame(dt)
  out <- eval(expr, envir = environment())
  out_dt <- data.table::as.data.table(out)

  args <- c(
    .code_name(column),
    sprintf("sort_value = %s", toupper(sort_value)),
    if (!is.null(sort_except)) sprintf("sort_except = c(%s)", .code_chr_vec(sort_except)),
    sprintf("convert_factor = %s", toupper(convert_factor)),
    if (!is.null(top_n)) sprintf("top_n = %s", as.integer(top_n)),
    if (isTRUE(top_n_only)) "top_n_only = TRUE",
    sprintf("add_total = %s", toupper(add_total)),
    sprintf("include_na = %s", toupper(include_na)),
    sprintf("position_total = %s", .str_lit(position_total))
  )
  code <- sprintf(
    "%s <- tsg::generate_frequency(%s, %s)",
    .code_name(output_name),
    .code_name(as),
    paste(Filter(Negate(is.null), args), collapse = ", ")
  )
  attr(out_dt, "tv_code") <- code
  out_dt
}


#' Generate a cross-tabulation with `tsg`
#'
#' @param data A data frame or data.table.
#' @param row_var Row variable.
#' @param col_var Column variable.
#' @param add_total Add totals.
#' @param add_total_row Add a total row.
#' @param add_total_column Add a total column.
#' @param add_percent Add percent columns.
#' @param percent_by_column Calculate percentages by column.
#' @param convert_factor Convert labelled outputs to factors.
#' @param include_na Include missing values.
#' @param position_total Position of totals.
#' @param output_name Object name used in generated code for the result.
#' @param as Name to use in generated code.
#' @export
tv_generate_crosstab <- function(data,
                                 row_var,
                                 col_var,
                                 add_total = TRUE,
                                 add_total_row = TRUE,
                                 add_total_column = TRUE,
                                 add_percent = TRUE,
                                 percent_by_column = FALSE,
                                 convert_factor = FALSE,
                                 include_na = TRUE,
                                 position_total = c("bottom", "top"),
                                 output_name = "result",
                                 as = deparse(substitute(data))) {
  .tv_require_namespace("tsg", "cross-tabulations")

  position_total <- match.arg(position_total)
  dt <- data.table::as.data.table(data)

  expr <- substitute(
    tsg::generate_crosstab(
      .data,
      .row_var,
      .col_var,
      add_total = .add_total,
      add_total_row = .add_total_row,
      add_total_column = .add_total_column,
      add_percent = .add_percent,
      percent_by_column = .percent_by_column,
      convert_factor = .convert_factor,
      include_na = .include_na,
      position_total = .position_total
    ),
    list(
      .data = quote(work_df),
      .row_var = as.name(row_var),
      .col_var = as.name(col_var),
      .add_total = add_total,
      .add_total_row = add_total_row,
      .add_total_column = add_total_column,
      .add_percent = add_percent,
      .percent_by_column = percent_by_column,
      .convert_factor = convert_factor,
      .include_na = include_na,
      .position_total = position_total
    )
  )

  work_df <- as.data.frame(dt)
  out <- eval(expr, envir = environment())
  out_dt <- data.table::as.data.table(out)

  code <- sprintf(
    paste0(
      "%s <- tsg::generate_crosstab(",
      "%s, %s, %s, add_total = %s, add_total_row = %s, ",
      "add_total_column = %s, add_percent = %s, percent_by_column = %s, ",
      "convert_factor = %s, include_na = %s, position_total = %s)"
    ),
    .code_name(output_name),
    .code_name(as),
    .code_name(row_var),
    .code_name(col_var),
    toupper(add_total),
    toupper(add_total_row),
    toupper(add_total_column),
    toupper(add_percent),
    toupper(percent_by_column),
    toupper(convert_factor),
    toupper(include_na),
    .str_lit(position_total)
  )
  attr(out_dt, "tv_code") <- code
  out_dt
}


#' Retrieve PSGC reference data
#'
#' @param ... Optional filter expressions evaluated against the bundled PSGC
#'   reference, such as `area_name == "Abra"` or `grepl("City", area_name)`.
#' @param token Ignored for the bundled PSGC snapshot. Present for API
#'   compatibility.
#' @param version Ignored for the bundled PSGC snapshot. Present for API
#'   compatibility.
#' @param level PSGC level.
#' @param harmonize Harmonize the returned data.
#' @param minimal Return a simplified dataset.
#' @param cols Optional extra columns when `minimal = FALSE`.
#' @export
tv_get_psgc <- function(...,
                        token = NULL,
                        version = NULL,
                        level = NULL,
                        harmonize = TRUE,
                        minimal = TRUE,
                        cols = NULL) {
  psgc_level <- NULL
  filter_exprs <- as.list(substitute(list(...)))[-1L]
  level <- if (is.null(level)) NULL else .tv_normalize_psgc_level(level)

  if (!identical(harmonize, TRUE)) {
    stop("The bundled PSGC snapshot only supports `harmonize = TRUE`.", call. = FALSE)
  }

  dt <- .tv_read_bundled_psgc()
  if (!is.null(level)) {
    dt <- dt[psgc_level == level]
  }
  dt <- .tv_subset_psgc(dt, filter_exprs, parent.frame())

  available_cols <- names(dt)
  if (length(cols)) {
    missing_cols <- setdiff(cols, available_cols)
    if (length(missing_cols)) {
      stop(
        "Bundled PSGC snapshot does not include column(s): ",
        paste(missing_cols, collapse = ", "),
        ".",
        call. = FALSE
      )
    }
  }

  if (isTRUE(minimal)) {
    keep_cols <- c("area_code", "area_code_old", "area_name")
    if (is.null(level)) keep_cols <- c(keep_cols, "psgc_level")
    if (length(cols)) keep_cols <- unique(c(keep_cols, cols))
    dt <- dt[, intersect(keep_cols, available_cols), with = FALSE]
  } else if (length(cols)) {
    dt <- dt[, unique(c(available_cols, cols)), with = FALSE]
  }

  attr(dt, "tv_code") <- .tv_get_psgc_code(level = level, harmonize = harmonize, minimal = minimal, cols = cols)
  dt
}


#' Join PSGC area names into a dataset
#'
#' @param data A data frame or data.table.
#' @param area_code Existing area-code column. If `NULL`, tidyview builds one
#'   from the PSGC component columns needed for the selected `level`.
#' @param level PSGC level to retrieve.
#' @param harmonize Harmonize the PSGC reference data.
#' @param minimal Return the minimal PSGC reference data.
#' @param cols Optional additional PSGC columns.
#' @param region_col Region-code column.
#' @param province_col Province-code column.
#' @param city_mun_col City/municipality-code column.
#' @param barangay_col Barangay-code column.
#' @param name_col Optional output name for the joined PSGC area-name column.
#' @param keep_helper_cols Keep helper PSGC columns such as the normalized
#'   joined `area_code` and `area_code_old`. Defaults to `FALSE`.
#' @param as Name to use in generated code.
#' @export
tv_join_psgc <- function(data,
                         area_code = NULL,
                         level = "barangays",
                         harmonize = TRUE,
                         minimal = TRUE,
                         cols = NULL,
                         region_col = NULL,
                         province_col = NULL,
                         city_mun_col = NULL,
                         barangay_col = NULL,
                         name_col = NULL,
                         keep_helper_cols = FALSE,
                         as = deparse(substitute(data))) {
  level <- .tv_normalize_psgc_level(level)
  joined <- .tv_join_psgc_impl(
    data = data,
    area_code = area_code,
    level = level,
    harmonize = harmonize,
    minimal = minimal,
    cols = cols,
    region_col = region_col,
    province_col = province_col,
    city_mun_col = city_mun_col,
    barangay_col = barangay_col,
    name_col = name_col,
    keep_helper_cols = keep_helper_cols
  )

  code_lines <- character(0)
  if (is.null(area_code) || !nzchar(area_code)) {
    inferred <- .tv_infer_area_columns(data)
    region_col <- region_col %||% inferred$region
    province_col <- province_col %||% inferred$province
    city_mun_col <- city_mun_col %||% inferred$city_mun
    barangay_col <- barangay_col %||% inferred$barangay
    build_cols <- .tv_psgc_component_columns(
      level = level,
      region_col = region_col,
      province_col = province_col,
      city_mun_col = city_mun_col,
      barangay_col = barangay_col
    )
    code_lines <- c(code_lines, sprintf(
      '%s[, ..tv_psgc_join_code := %s]',
      .code_name(as),
      paste0(
        'gsub(" ", "0", sprintf("%-10s", paste0(',
        paste(sprintf("as.character(%s)", vapply(build_cols, .code_name, character(1))), collapse = ", "),
        ')), fixed = TRUE)'
      )
    ))
    area_code <- "..tv_psgc_join_code"
  } else {
    code_lines <- c(code_lines, sprintf(
      '%s[, ..tv_psgc_join_code := gsub(" ", "0", sprintf("%%-10s", substr(as.character(%s), 1, %s)), fixed = TRUE)]',
      .code_name(as),
      .code_name(area_code),
      .tv_psgc_significant_length(level)
    ))
    area_code <- "..tv_psgc_join_code"
  }
  code_lines <- c(
    code_lines,
    sprintf("..tv_psgc <- %s", .tv_get_psgc_code(level = level, harmonize = harmonize, minimal = minimal, cols = cols)),
    sprintf(
      "%s <- merge(%s, ..tv_psgc, by.x = %s, by.y = \"area_code\", all.x = TRUE, sort = FALSE)",
      .code_name(as),
      .code_name(as),
      .str_lit(area_code)
    )
  )
  if (!is.null(name_col) && nzchar(name_col) && !identical(name_col, "area_name")) {
    code_lines <- c(code_lines, sprintf('data.table::setnames(%s, "area_name", %s)', .code_name(as), .str_lit(name_col)))
  }
  if (isTRUE(keep_helper_cols)) {
    if (identical(area_code, "..tv_psgc_join_code")) {
      code_lines <- c(code_lines, sprintf('data.table::setnames(%s, "..tv_psgc_join_code", "area_code")', .code_name(as)))
    }
  } else {
    code_lines <- c(code_lines, sprintf('%s[, area_code_old := NULL]', .code_name(as)))
    code_lines <- c(code_lines, sprintf('%s[, ..tv_psgc_join_code := NULL]', .code_name(as)))
  }
  attr(joined, "tv_code") <- paste(code_lines, collapse = "\n")
  joined
}
