#' Optional package integrations for tidyview
#'
#' These helpers expose higher-level workflows powered by `rcdf`, `tsg`, and
#' `phscs` when those packages are installed.

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


.tv_phscs_code <- function(level = NULL, harmonize = TRUE, minimal = TRUE, cols = NULL) {
  args <- character(0)
  if (!is.null(level) && nzchar(level)) args <- c(args, sprintf("level = %s", .str_lit(level)))
  if (!identical(harmonize, TRUE)) args <- c(args, sprintf("harmonize = %s", toupper(harmonize)))
  if (!identical(minimal, TRUE)) args <- c(args, sprintf("minimal = %s", toupper(minimal)))
  if (length(cols)) args <- c(args, sprintf("cols = c(%s)", .code_chr_vec(cols)))
  sprintf("phscs::get_psgc(%s)", paste(args, collapse = ", "))
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


.tv_join_psgc_impl <- function(data,
                               area_code = NULL,
                               level = "barangays",
                               harmonize = TRUE,
                               minimal = TRUE,
                               cols = NULL,
                               region_col = NULL,
                               province_col = NULL,
                               city_mun_col = NULL,
                               barangay_col = NULL) {
  .tv_require_namespace("phscs", "PSGC integration")

  dt <- .tv_as_data_table(data)
  area_cols <- .tv_infer_area_columns(dt)

  if (is.null(area_code) || !nzchar(area_code)) {
    region_col <- region_col %||% area_cols$region
    province_col <- province_col %||% area_cols$province
    city_mun_col <- city_mun_col %||% area_cols$city_mun
    barangay_col <- barangay_col %||% area_cols$barangay

    required_cols <- c(region_col, province_col, city_mun_col, barangay_col)
    if (any(vapply(required_cols, is.null, logical(1)))) {
      stop(
        "Provide `area_code` or the component columns `region_col`, `province_col`, ",
        "`city_mun_col`, and `barangay_col`."
      )
    }

    dt[, area_code := paste0(
      as.character(get(region_col)),
      as.character(get(province_col)),
      as.character(get(city_mun_col)),
      as.character(get(barangay_col))
    )]
  } else if (!area_code %in% names(dt)) {
    stop("Column '", area_code, "' not found.")
  }

  ref <- data.table::as.data.table(
    phscs::get_psgc(level = level, harmonize = harmonize, minimal = minimal, cols = cols)
  )

  by_col <- if (is.null(area_code) || !nzchar(area_code)) "area_code" else area_code
  merge(dt, ref, by.x = by_col, by.y = "area_code", all.x = TRUE, sort = FALSE)
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
#' @param ... Filter expressions forwarded to `phscs::get_psgc()`.
#' @param token Optional API token.
#' @param version Optional PSGC version.
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
  .tv_require_namespace("phscs", "PSGC integration")

  out <- phscs::get_psgc(
    ...,
    token = token,
    version = version,
    level = level,
    harmonize = harmonize,
    minimal = minimal,
    cols = cols
  )
  dt <- data.table::as.data.table(out)
  attr(dt, "tv_code") <- .tv_phscs_code(level = level, harmonize = harmonize, minimal = minimal, cols = cols)
  dt
}


#' Join PSGC area names into a dataset
#'
#' @param data A data frame or data.table.
#' @param area_code Existing area-code column. If `NULL`, tidyview builds one
#'   from `region_col`, `province_col`, `city_mun_col`, and `barangay_col`.
#' @param level PSGC level to retrieve.
#' @param harmonize Harmonize the PSGC reference data.
#' @param minimal Return the minimal PSGC reference data.
#' @param cols Optional additional PSGC columns.
#' @param region_col Region-code column.
#' @param province_col Province-code column.
#' @param city_mun_col City/municipality-code column.
#' @param barangay_col Barangay-code column.
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
                         as = deparse(substitute(data))) {
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
    barangay_col = barangay_col
  )

  code_lines <- character(0)
  if (is.null(area_code) || !nzchar(area_code)) {
    inferred <- .tv_infer_area_columns(data)
    region_col <- region_col %||% inferred$region
    province_col <- province_col %||% inferred$province
    city_mun_col <- city_mun_col %||% inferred$city_mun
    barangay_col <- barangay_col %||% inferred$barangay
    code_lines <- c(code_lines, sprintf(
      '%s[, area_code := paste0(as.character(%s), as.character(%s), as.character(%s), as.character(%s))]',
      .code_name(as),
      .code_name(region_col),
      .code_name(province_col),
      .code_name(city_mun_col),
      .code_name(barangay_col)
    ))
    area_code <- "area_code"
  }
  code_lines <- c(
    code_lines,
    sprintf("..tv_psgc <- %s", .tv_phscs_code(level = level, harmonize = harmonize, minimal = minimal, cols = cols)),
    sprintf(
      "%s <- merge(%s, ..tv_psgc, by.x = %s, by.y = \"area_code\", all.x = TRUE, sort = FALSE)",
      .code_name(as),
      .code_name(as),
      .str_lit(area_code)
    )
  )
  attr(joined, "tv_code") <- paste(code_lines, collapse = "\n")
  joined
}
