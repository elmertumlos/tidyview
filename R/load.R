#' Load a data source into a data.table for use with tidyview
#'
#' These helpers are the programmatic equivalents of the GUI import dialog.
#' They return a data.table and the generated R code string as an attribute.

#' @rdname tv_load
#' @param path Path to a CSV, TSV, Excel, RDS, RData, SAV, DTA, or RCDF file.
#' @param as   Name to assign in the generated code. Default `"DT"`.
#' @param table Optional table name to extract from an RCDF file.
#' @param decryption_key Optional private-key path for RCDF files.
#' @param password Optional private-key password for RCDF files.
#' @param ...  Additional arguments forwarded to the underlying reader.
#' @export
tv_fread <- function(path, as = "DT", table = NULL, decryption_key = NULL, password = NULL, ...) {
  ext <- tolower(tools::file_ext(path))
  code_path <- normalizePath(path, winslash = "/", mustWork = TRUE)
  result <- switch(ext,
    csv  = ,
    tsv  = {
      dt   <- data.table::fread(path, ...)
      code <- sprintf('%s <- data.table::fread(%s)', .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    xlsx = ,
    xls  = {
      if (!requireNamespace("readxl", quietly = TRUE))
        stop("Install readxl: install.packages('readxl')")
      dt   <- data.table::as.data.table(readxl::read_excel(path, ...))
      code <- sprintf('%s <- data.table::as.data.table(readxl::read_excel(%s))',
                      .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    rds  = {
      dt   <- data.table::as.data.table(.strip_labelled(readRDS(path)))
      code <- sprintf('%s <- data.table::as.data.table(readRDS(%s))',
                      .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    rda = ,
    rdata = {
      e  <- new.env(parent = emptyenv())
      load(path, envir = e)
      nm <- ls(e)[1]
      dt <- data.table::as.data.table(.strip_labelled(get(nm, envir = e)))
      code <- sprintf('load(%s); %s <- data.table::as.data.table(%s)',
                      .str_lit(code_path), .code_name(as), .code_name(nm))
      list(dt = dt, code = code)
    },
    sav  = {
      if (!requireNamespace("haven", quietly = TRUE))
        stop("Install haven: install.packages('haven')")
      dt   <- data.table::as.data.table(.strip_labelled(haven::read_sav(path, ...)))
      code <- sprintf('%s <- data.table::as.data.table(haven::read_sav(%s))',
                      .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    dta  = {
      if (!requireNamespace("haven", quietly = TRUE))
        stop("Install haven: install.packages('haven')")
      dt   <- data.table::as.data.table(.strip_labelled(haven::read_dta(path, ...)))
      code <- sprintf('%s <- data.table::as.data.table(haven::read_dta(%s))',
                      .code_name(as), .str_lit(code_path))
      list(dt = dt, code = code)
    },
    rcdf = {
      .tv_require_namespace("rcdf", "RCDF import")
      if (is.null(decryption_key) || !nzchar(decryption_key)) {
        stop("`decryption_key` is required for RCDF files.")
      }
      obj <- rcdf::read_rcdf(
        path = path,
        decryption_key = decryption_key,
        password = password
      )
      if (is.null(table)) {
        tables <- names(obj)[vapply(obj, function(x) is.data.frame(x) || data.table::is.data.table(x), logical(1))]
        if (!length(tables)) stop("No tabular objects were found in the RCDF file.")
        if (length(tables) > 1L) {
          stop("RCDF files can contain multiple tables. Supply `table = ...` or use tv_read_rcdf().")
        }
        table <- tables[[1]]
      }
      dt <- data.table::as.data.table(.strip_labelled(obj[[table]]))
      object_name <- paste0(as, "_rcdf")
      code <- paste(
        .tv_rcdf_code(path, decryption_key, password = password, object_name = object_name),
        sprintf('%s <- data.table::as.data.table(%s[[%s]])',
                .code_name(as), .code_name(object_name), .str_lit(table)),
        sep = "\n"
      )
      list(dt = dt, code = code)
    },
    stop("Unsupported extension: .", ext)
  )
  attr(result$dt, "tv_code") <- result$code
  result$dt
}


#' @rdname tv_load
#' @param x An R object (data.frame, matrix, list, etc.) to coerce.
#' @export
tv_from_env <- function(x, as = deparse(substitute(x))) {
  dt   <- data.table::as.data.table(x)
  expr_code <- paste(deparse(substitute(x)), collapse = "")
  code <- sprintf('%s <- data.table::as.data.table(%s)', .code_name(as), expr_code)
  attr(dt, "tv_code") <- code
  dt
}


#' @rdname tv_load
#' @export
tv_load <- function(path, as = "DT", ...) tv_fread(path, as = as, ...)
