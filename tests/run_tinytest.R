args <- commandArgs(trailingOnly = FALSE)
file_arg <- "--file="
script_arg <- args[grepl(file_arg, args)]
script_path <- if (length(script_arg)) {
  normalizePath(sub(file_arg, "", script_arg[1]), winslash = "/", mustWork = TRUE)
} else {
  candidates <- c("tests/run_tinytest.R", "run_tinytest.R")
  found <- candidates[file.exists(candidates)][1]
  if (is.na(found)) {
    stop("Could not locate tests/run_tinytest.R.", call. = FALSE)
  }
  normalizePath(found, winslash = "/", mustWork = TRUE)
}

pkg_root <- normalizePath(file.path(dirname(script_path), ".."), winslash = "/", mustWork = TRUE)
test_file <- file.path(pkg_root, "tests", "tinytest", "test_tidyview.R")

if (!requireNamespace("tinytest", quietly = TRUE)) {
  stop("Install tinytest first with install.packages('tinytest').", call. = FALSE)
}

message("Running tinytest from: ", test_file)
source(test_file, local = new.env(parent = globalenv()))
message("tinytest completed successfully.")
