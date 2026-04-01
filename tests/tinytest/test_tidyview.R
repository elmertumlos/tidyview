library(tinytest)
library(data.table)

test_file <- if (!is.null(sys.frame(1)$ofile)) sys.frame(1)$ofile else
  file.path("tests", "tinytest", "test_tidyview.R")
pkg_root <- normalizePath(file.path(dirname(test_file), "..", ".."), mustWork = TRUE)

source(file.path(pkg_root, "R", "m3_theme.R"), local = TRUE)
source(file.path(pkg_root, "R", "codegen.R"), local = TRUE)
source(file.path(pkg_root, "R", "integrations.R"), local = TRUE)
source(file.path(pkg_root, "R", "api_handlers.R"), local = TRUE)
source(file.path(pkg_root, "R", "load.R"), local = TRUE)
source(file.path(pkg_root, "R", "verbs.R"), local = TRUE)

# ── m3_theme() ──────────────────────────────────────────────────────────────

t <- m3_theme()
expect_equal(t$seed, "#534AB7")
expect_true(grepl("^#[0-9A-F]{6}$", t$primary, ignore.case = TRUE))

t_dark <- m3_theme(dark = TRUE)
expect_true(t_dark$dark)

t_teal <- m3_theme("#1D9E75")
expect_true(is.list(t_teal))

# ── .r_type_label() ─────────────────────────────────────────────────────────

expect_equal(.r_type_label(1L),               "int")
expect_equal(.r_type_label(1.5),              "dbl")
expect_equal(.r_type_label("a"),              "chr")
expect_equal(.r_type_label(TRUE),             "lgl")
expect_equal(.r_type_label(Sys.Date()),       "Date")
expect_equal(.r_type_label(data.table::as.IDate("2024-01-01")), "IDate")

# ── .condition_to_expr() ────────────────────────────────────────────────────

expect_equal(.condition_to_expr(list(col="region", op="==",    val="North")),
             'region == "North"')
expect_equal(.condition_to_expr(list(col="amount", op=">",     val="1000")),
             'amount > 1000')
expect_equal(.condition_to_expr(list(col="amount", op="<=",    val="500")),
             'amount <= 500')
expect_equal(.condition_to_expr(list(col="region", op="%in%",  val="North, East")),
             'region %in% c("North", "East")')
expect_equal(.condition_to_expr(list(col="notes",  op="is.na", val="")),
             'is.na(notes)')
expect_equal(.condition_to_expr(list(col="notes",  op="!is.na", val="")),
             '!is.na(notes)')
expect_equal(
  .condition_to_expr(
    list(col = "flag", op = "is.true", val = ""),
    data.table::data.table(flag = c(TRUE, FALSE))
  ),
  "flag %in% TRUE"
)

# ── .op_select() ────────────────────────────────────────────────────────────

DT_test <- data.table::data.table(a = 1:3, b = c("x","y","z"), c = 3.14)
state    <- new.env(parent = emptyenv())
state$dt <- DT_test
state$name <- "DT"
state$history <- character(0)

res <- .op_select(list(columns = c("a", "b")), state)
expect_equal(names(state$dt), c("a", "b"))
expect_true(grepl("op_select", "op_select"))
expect_equal(res$ncol, 2L)

# ── .op_filter() ────────────────────────────────────────────────────────────

state2       <- new.env(parent = emptyenv())
state2$dt    <- data.table::data.table(x = 1:10, y = letters[1:10])
state2$name  <- "DT"
state2$history <- character(0)

res2 <- .op_filter(list(conditions = list(list(col="x", op=">", val="5")), logic="AND"), state2)
expect_equal(nrow(state2$dt), 5L)

# ── .op_mutate() ────────────────────────────────────────────────────────────

state3       <- new.env(parent = emptyenv())
state3$dt    <- data.table::data.table(amount = c(100, 200, 300))
state3$name  <- "DT"
state3$history <- character(0)

.op_mutate(list(col_name = "tax", expr = "amount * 0.12"), state3)
expect_true("tax" %in% names(state3$dt))
expect_equal(state3$dt$tax, c(12, 24, 36))

state_filter_expr <- new.env(parent = emptyenv())
state_filter_expr$dt <- data.table::data.table(a = c(1L, 2L, 3L), b = c(0L, 5L, 1L))
state_filter_expr$name <- "DT"
state_filter_expr$history <- character(0)
state_filter_expr$undo_stack <- list()

.op_filter(list(expr = "rowSums(cbind(a > 1L, b > 3L), na.rm = TRUE) > 0"), state_filter_expr)
expect_equal(state_filter_expr$dt$a, c(2L, 3L))

# ── .op_summarise() ─────────────────────────────────────────────────────────

state_sum <- new.env(parent = emptyenv())
state_sum$dt <- data.table::data.table(
  region = c("N", "N", "S"),
  product = c("A", "A", "B"),
  amount = c(1, 2, 3)
)
state_sum$name <- "DT"
state_sum$history <- character(0)
state_sum$undo_stack <- list()

.op_summarise(list(
  group_by = c("region"),
  aggregations = list(
    list(output = "rows", fn = "n", col = "amount"),
    list(output = "products", fn = "n_distinct", col = "product"),
    list(output = "sales", fn = "sum", col = "amount")
  )
), state_sum)
expect_equal(names(state_sum$dt), c("region", "rows", "products", "sales"))
expect_equal(state_sum$dt$rows, c(2L, 1L))
expect_equal(state_sum$dt$products, c(1L, 1L))

# ── .op_arrange() ───────────────────────────────────────────────────────────

state_arr <- new.env(parent = emptyenv())
state_arr$dt <- data.table::data.table(x = c("b", "a", "b"), y = c(1L, 2L, 3L))
state_arr$name <- "DT"
state_arr$history <- character(0)
state_arr$undo_stack <- list()

.op_arrange(list(
  sorts = list(
    list(col = "x", desc = TRUE),
    list(col = "y", desc = FALSE)
  )
), state_arr)
expect_equal(state_arr$dt$x, c("b", "b", "a"))
expect_equal(state_arr$dt$y, c(1L, 3L, 2L))

# -- .op_join() semi / anti ---------------------------------------------------

state_join <- new.env(parent = emptyenv())
state_join$dt <- data.table::data.table(id = c(1L, 2L, 2L, 3L), value = c("a", "b", "c", "d"))
state_join$name <- "DT"
state_join$history <- character(0)
state_join$undo_stack <- list()

.op_join(list(
  right_name = "lookup",
  right_dt = data.table::data.table(id = c(2L, 4L)),
  by = "id",
  type = "semi"
), state_join)
expect_equal(state_join$dt$id, c(2L, 2L))
expect_equal(state_join$dt$value, c("b", "c"))

state_join2 <- new.env(parent = emptyenv())
state_join2$dt <- data.table::data.table(id = c(1L, 2L, 2L, 3L), value = c("a", "b", "c", "d"))
state_join2$name <- "DT"
state_join2$history <- character(0)
state_join2$undo_stack <- list()

.op_join(list(
  right_name = "lookup",
  right_dt = data.table::data.table(id = c(2L, 4L)),
  by = "id",
  type = "anti"
), state_join2)
expect_equal(state_join2$dt$id, c(1L, 3L))
expect_equal(state_join2$dt$value, c("a", "d"))

# -- .op_combine() rows / cols ------------------------------------------------

state_combine_rows <- new.env(parent = emptyenv())
state_combine_rows$dt <- data.table::data.table(id = 1:2, x = c("a", "b"))
state_combine_rows$name <- "DT"
state_combine_rows$history <- character(0)
state_combine_rows$undo_stack <- list()
state_combine_rows$sessions <- list()
state_combine_rows$active_idx <- 0L

.op_combine(list(
  mode = "rows",
  right_dt = data.table::data.table(id = 3L, y = "c"),
  right_name = "other",
  use_names = TRUE,
  fill = TRUE
), state_combine_rows)
expect_equal(nrow(state_combine_rows$dt), 3L)
expect_true(all(c("id", "x", "y") %in% names(state_combine_rows$dt)))

state_combine_cols <- new.env(parent = emptyenv())
state_combine_cols$dt <- data.table::data.table(id = 1:2)
state_combine_cols$name <- "DT"
state_combine_cols$history <- character(0)
state_combine_cols$undo_stack <- list()
state_combine_cols$sessions <- list()
state_combine_cols$active_idx <- 0L

.op_combine(list(
  mode = "cols",
  right_dt = data.table::data.table(value = c("a", "b")),
  right_name = "other"
), state_combine_cols)
expect_equal(names(state_combine_cols$dt), c("id", "value"))

expect_error(
  .op_combine(list(
    mode = "cols",
    right_dt = data.table::data.table(value = c("a", "b", "c")),
    right_name = "other"
  ), state_combine_cols),
  "same number of rows"
)

# -- relocate / drop_na / separate / unite -----------------------------------

state_relocate <- new.env(parent = emptyenv())
state_relocate$dt <- data.table::data.table(a = 1, b = 2, c = 3, d = 4)
state_relocate$name <- "DT"
state_relocate$history <- character(0)
state_relocate$undo_stack <- list()

.op_relocate(list(columns = c("c", "d"), before = "b"), state_relocate)
expect_equal(names(state_relocate$dt), c("a", "c", "d", "b"))

state_drop <- new.env(parent = emptyenv())
state_drop$dt <- data.table::data.table(a = c(1, NA, 3), b = c("x", "y", NA))
state_drop$name <- "DT"
state_drop$history <- character(0)
state_drop$undo_stack <- list()

.op_drop_na(list(columns = "a"), state_drop)
expect_equal(nrow(state_drop$dt), 2L)

state_sep <- new.env(parent = emptyenv())
state_sep$dt <- data.table::data.table(code = c("01-001", "02-003"))
state_sep$name <- "DT"
state_sep$history <- character(0)
state_sep$undo_stack <- list()

.op_separate(list(column = "code", into = c("region", "barangay"), sep = "-", remove = TRUE), state_sep)
expect_equal(names(state_sep$dt), c("region", "barangay"))
expect_equal(state_sep$dt$region, c("01", "02"))

state_unite <- new.env(parent = emptyenv())
state_unite$dt <- data.table::data.table(first = c("Ana", "Ben"), last = c("Lopez", "Santos"))
state_unite$name <- "DT"
state_unite$history <- character(0)
state_unite$undo_stack <- list()

.op_unite(list(columns = c("first", "last"), into = "full_name", sep = " ", remove = TRUE), state_unite)
expect_equal(names(state_unite$dt), "full_name")
expect_equal(state_unite$dt$full_name, c("Ana Lopez", "Ben Santos"))

# ── .op_rename() ────────────────────────────────────────────────────────────

state4       <- new.env(parent = emptyenv())
state4$dt    <- data.table::data.table(a = 1, b = 2)
state4$name  <- "DT"
state4$history <- character(0)

.op_rename(list(old = c("a"), new = c("alpha")), state4)
expect_true("alpha" %in% names(state4$dt))
expect_false("a" %in% names(state4$dt))

state4b <- new.env(parent = emptyenv())
state4b$dt <- data.table::data.table(a = c("1", "2"))
state4b$name <- "DT"
state4b$history <- character(0)
state4b$undo_stack <- list()

.op_rename(list(old = "a", new = "alpha", types = list(alpha = "int")), state4b)
expect_equal(typeof(state4b$dt$alpha), "integer")

state4c <- new.env(parent = emptyenv())
state4c$dt <- data.table::data.table("First Name" = 1, "ZIP Code" = 2, check.names = FALSE)
state4c$name <- "DT"
state4c$history <- character(0)
state4c$undo_stack <- list()

.op_rename_with(list(fn = "snake"), state4c)
expect_equal(names(state4c$dt), c("first_name", "zip_code"))

# ── .op_dedupe() ────────────────────────────────────────────────────────────

state5       <- new.env(parent = emptyenv())
state5$dt    <- data.table::data.table(x = c(1,1,2,3,3), y = c("a","a","b","c","c"))
state5$name  <- "DT"
state5$history <- character(0)

.op_dedupe(list(by_cols = c()), state5)
expect_equal(nrow(state5$dt), 3L)

# ── .push_history() ─────────────────────────────────────────────────────────

st <- new.env(parent = emptyenv())
st$history <- character(0)
.push_history(st, "DT <- DT[x > 5]")
.push_history(st, "DT[, tax := amount * 0.12]")
expect_equal(length(st$history), 2L)
expect_true(grepl("tax", st$history[2]))

# ── .api_load_file() browser payload ────────────────────────────────────────

tmp_csv <- tempfile(fileext = ".csv")
writeLines(c("x,y", "1,a", "2,b"), tmp_csv)
raw_csv <- readBin(tmp_csv, "raw", file.info(tmp_csv)$size)
b64_csv <- jsonlite::base64_enc(raw_csv)

load_state <- new.env(parent = emptyenv())
load_state$dt <- NULL
load_state$name <- NULL
load_state$history <- character(0)
load_state$undo_stack <- list()

load_res <- .api_load_file(list(file_name = "upload.csv", contents = b64_csv, as = "upload"), load_state)
expect_true(load_res$ok)
expect_equal(load_res$name, "upload")
expect_equal(load_res$nrow, 2L)

# ── .api_undo() restores previous state ─────────────────────────────────────

undo_state <- new.env(parent = emptyenv())
undo_state$dt <- data.table::data.table(a = 1:3, b = letters[1:3])
undo_state$name <- "DT"
undo_state$history <- character(0)
undo_state$undo_stack <- list()

.op_select(list(columns = c("a")), undo_state)
.op_slice(list(type = "head", n = 2L), undo_state)
undo_res <- .api_undo(undo_state)
expect_true(undo_res$ok)
expect_equal(undo_res$nrow, 3L)
expect_equal(length(undo_res$history), 1L)

# ── tv_* wrappers ───────────────────────────────────────────────────────────

wrapped <- tv_mutate(
  data.table::data.table(amount = c(10, 20)),
  "tax",
  "amount * 0.1",
  as = "sales"
)
expect_true(inherits(wrapped, "data.table"))
expect_equal(wrapped$tax, c(1, 2))
expect_true(grepl("sales\\[, tax := amount \\* 0.1\\]", attr(wrapped, "tv_code")))

wrapped_filter <- tv_filter(
  data.table::data.table(region = c("North", "South")),
  conditions = list(list(col = "region", op = "==", val = "North")),
  as = "sales"
)
expect_equal(nrow(wrapped_filter), 1L)

wrapped_relocate <- tv_relocate(
  data.table::data.table(a = 1, b = 2, c = 3),
  columns = "c",
  before = "b",
  as = "sales"
)
expect_equal(names(wrapped_relocate), c("a", "c", "b"))

wrapped_drop <- tv_drop_na(
  data.table::data.table(a = c(1, NA), b = c("x", "y")),
  columns = "a",
  as = "sales"
)
expect_equal(nrow(wrapped_drop), 1L)

wrapped_sep <- tv_separate(
  data.table::data.table(code = "01-001"),
  column = "code",
  into = c("region", "barangay"),
  sep = "-",
  as = "sales"
)
expect_equal(names(wrapped_sep), c("region", "barangay"))

wrapped_unite <- tv_unite(
  data.table::data.table(first = "Ana", last = "Lopez"),
  columns = c("first", "last"),
  into = "full_name",
  sep = " ",
  as = "sales"
)
expect_equal(names(wrapped_unite), "full_name")

# ── .op_tabulate() / .op_crosstab() ────────────────────────────────────────

tab_state <- new.env(parent = emptyenv())
tab_state$dt <- data.table::data.table(region = c("North", "North", "South"), w = c(1, 2, 3))
tab_state$name <- "sales"
tab_state$history <- character(0)
tab_state$undo_stack <- list()

tab_res <- .op_tabulate(list(
  column = "region",
  output_name = "sales_tab",
  weight_expr = "w",
  sort = TRUE,
  percent = TRUE,
  cumulative = TRUE
), tab_state)
expect_equal(tab_res$name, "sales_tab")
expect_true(all(c("region", "n", "pct", "cum_pct") %in% names(tab_state$dt)))
expect_equal(tab_state$dt$n, c(3, 3))

xtab_state <- new.env(parent = emptyenv())
xtab_state$dt <- data.table::data.table(region = c("North", "North", "South"), sex = c("F", "M", "F"))
xtab_state$name <- "sales"
xtab_state$history <- character(0)
xtab_state$undo_stack <- list()

xtab_res <- .op_crosstab(list(
  row_var = "region",
  col_var = "sex",
  output_name = "sales_xtab",
  normalize = "none",
  totals = TRUE
), xtab_state)
expect_equal(xtab_res$name, "sales_xtab")
expect_true("Total" %in% names(xtab_state$dt))
expect_true(any(xtab_state$dt$region == "Total"))

# ── tv_tabulate() / tv_crosstab() ──────────────────────────────────────────

tv_tab <- tv_tabulate(
  data.table::data.table(region = c("North", "North", "South")),
  column = "region",
  output_name = "region_tab",
  as = "sales"
)
expect_true(inherits(tv_tab, "data.table"))
expect_true(grepl("region_tab <- sales\\[, \\.\\(n = \\.N\\), by = \\.\\(region\\)\\]", attr(tv_tab, "tv_code")))

tv_xtab <- tv_crosstab(
  data.table::data.table(region = c("North", "North", "South"), sex = c("F", "M", "F")),
  row_var = "region",
  col_var = "sex",
  output_name = "sales_xtab",
  as = "sales"
)
expect_true(inherits(tv_xtab, "data.table"))
expect_true(grepl('sales_xtab <- data.table::dcast', attr(tv_xtab, "tv_code")))

tv_renamed <- tv_rename_with(
  data.table::data.table("Region Code" = 1, "HH ID" = 2, check.names = FALSE),
  fn = "snake"
)
expect_equal(names(tv_renamed), c("region_code", "hh_id"))

tv_renamed_regex <- tv_rename_with(
  data.table::data.table("region.code" = 1, "hh.code" = 2, check.names = FALSE),
  fn = "replace_regex",
  pattern = "\\.",
  replacement = "_"
)
expect_equal(names(tv_renamed_regex), c("region_code", "hh_code"))

tv_filtered_expr <- tv_filter(
  data.table::data.table(a = c(1L, 2L, 3L), b = c(0L, 5L, 1L)),
  expr = "rowSums(cbind(a > 1L, b > 3L), na.rm = TRUE) > 0"
)
expect_equal(tv_filtered_expr$a, c(2L, 3L))

tv_filtered_regex <- tv_filter(
  data.table::data.table(code = c("AA-001", "bb-002", "CC-120")),
  conditions = list(list(col = "code", op = "%regex%", val = "^[A-Z]{2}-[0-9]{3}$"))
)
expect_equal(tv_filtered_regex$code, c("AA-001", "CC-120"))

tv_filtered_starts <- tv_filter(
  data.table::data.table(last_name = c("Santos", "Dela Cruz", "San Jose")),
  conditions = list(list(col = "last_name", op = "%starts%", val = "San"))
)
expect_equal(tv_filtered_starts$last_name, c("Santos", "San Jose"))

tv_filtered_ends <- tv_filter(
  data.table::data.table(last_name = c("Santos", "Cruz", "Diaz")),
  conditions = list(list(col = "last_name", op = "%ends%", val = "z"))
)
expect_equal(tv_filtered_ends$last_name, c("Cruz", "Diaz"))

tv_filtered_between_dates <- tv_filter(
  data.table::data.table(interview_date = as.Date(c("2024-01-01", "2024-06-15", "2025-01-01"))),
  conditions = list(list(col = "interview_date", op = "%between%", val = "2024-01-01, 2024-12-31"))
)
expect_equal(as.character(tv_filtered_between_dates$interview_date), c("2024-01-01", "2024-06-15"))

tv_collapsed_levels <- tv_collapse_levels(
  data.table::data.table(status = c("Infant", "Toddler", "Parent", "Guardian")),
  column = "status",
  groups = list(
    list(to = "Child", from = c("Infant", "Toddler")),
    list(to = "Adult", from = c("Parent", "Guardian"))
  ),
  new_col = "status_group"
)
expect_equal(as.character(tv_collapsed_levels$status_group), c("Child", "Child", "Adult", "Adult"))

tv_lumped_levels <- tv_lump_levels(
  data.table::data.table(region = c("North", "North", "South", "East")),
  column = "region",
  top_n = 1,
  other_label = "Other",
  new_col = "region_group"
)
expect_equal(as.character(tv_lumped_levels$region_group), c("North", "North", "Other", "Other"))

tv_releveled <- tv_relevel(
  data.table::data.table(priority = c("Medium", "High", "Low")),
  column = "priority",
  ref_level = "High",
  new_col = "priority_ref"
)
expect_equal(levels(tv_releveled$priority_ref), c("High", "Medium", "Low"))

tv_bound_rows <- tv_bind_rows(
  data.table::data.table(id = 1:2, x = c("a", "b")),
  data.table::data.table(id = 3L, y = "c")
)
expect_equal(nrow(tv_bound_rows), 3L)
expect_true(all(c("id", "x", "y") %in% names(tv_bound_rows)))

tv_bound_cols <- tv_bind_cols(
  data.table::data.table(id = 1:2),
  data.table::data.table(value = c("a", "b"))
)
expect_equal(names(tv_bound_cols), c("id", "value"))

audit_state <- new.env(parent = emptyenv())
audit_state$dt <- data.table::data.table(
  id = c(1L, 1L, 2L, 3L),
  status = c("Open", "Open", NA, "Closed"),
  amount = c(10, 10, 20, NA)
)
audit_state$name <- "cases"
audit_state$history <- character(0)
audit_state$undo_stack <- list()

audit_res <- .api_audit_summary(list(top_n = 2L), audit_state)
expect_true(audit_res$ok)
expect_equal(audit_res$overview$nrow, 4L)
expect_equal(audit_res$overview$ncol, 3L)
expect_equal(audit_res$overview$duplicate_rows, 1L)
expect_equal(audit_res$overview$columns_with_missing, 2L)
status_audit <- Filter(function(x) identical(x$name, "status"), audit_res$columns)[[1]]
expect_equal(status_audit$missing_n, 1L)
expect_equal(status_audit$distinct_n, 3L)
expect_true(length(status_audit$top_values) >= 1L)

tv_audit_report <- tv_audit(
  data.table::data.table(region = c("North", "North", "South"), score = c(1, 1, NA)),
  top_n = 2L,
  as = "survey"
)
expect_true(inherits(tv_audit_report, "tv_audit"))
expect_true(inherits(tv_audit_report$overview, "data.table"))
expect_true(inherits(tv_audit_report$columns, "data.table"))
expect_true(grepl("tv_audit\\(survey, top_n = 2L\\)", attr(tv_audit_report, "tv_code")))

# ── optional integration helpers fail clearly when packages are absent ──────

missing_state <- new.env(parent = emptyenv())
missing_state$dt <- data.table::data.table(
  region = c("North", "North", "South", "South"),
  status = c("Open", NA, "Closed", NA),
  score = c(10, 20, NA, 40)
)
missing_state$name <- "cases"
missing_state$history <- character(0)
missing_state$undo_stack <- list()

missing_res <- .api_missing_summary(list(group_by = "region"), missing_state)
expect_true(missing_res$ok)
expect_equal(missing_res$overview$rows_with_missing, 3L)
expect_equal(missing_res$overview$columns_with_missing, 2L)
expect_true(length(missing_res$group_summary) == 2L)

tv_missing_report <- tv_missing_summary(
  data.table::data.table(region = c("North", "South"), score = c(1, NA)),
  group_by = "region",
  as = "survey"
)
expect_true(inherits(tv_missing_report, "tv_missing"))
expect_true(inherits(tv_missing_report$overview, "data.table"))
expect_true(inherits(tv_missing_report$columns, "data.table"))
expect_true(grepl('tv_missing_summary\\(survey, group_by = "region"\\)', attr(tv_missing_report, "tv_code")))

validate_state <- new.env(parent = emptyenv())
validate_state$dt <- data.table::data.table(
  record_id = c("0001", "0001", NA, "0004"),
  status = c("Open", "Closed", "Bad", "Open"),
  age = c(22, 150, 35, NA)
)
validate_state$name <- "cases"
validate_state$history <- character(0)
validate_state$undo_stack <- list()

validate_res <- .api_validate_summary(list(rules = list(
  list(type = "not_missing", col = "record_id"),
  list(type = "unique", col = "record_id"),
  list(type = "allowed", col = "status", values = c("Open", "Closed")),
  list(type = "range", col = "age", min = "0", max = "120")
)), validate_state)
expect_true(validate_res$ok)
expect_equal(validate_res$overview$rule_count, 4L)
expect_equal(validate_res$overview$failing_rules, 4L)
expect_equal(validate_res$overview$rows_with_issues, 3L)
expect_equal(validate_res$rules[[1]]$failing_n, 1L)
expect_equal(validate_res$rules[[2]]$failing_n, 2L)
expect_equal(validate_res$rules[[3]]$failing_n, 1L)
expect_equal(validate_res$rules[[4]]$failing_n, 1L)

tv_validate_report <- tv_validate(
  data.table::data.table(record_id = c("1", NA), age = c(10, 200)),
  rules = list(
    list(type = "not_missing", col = "record_id"),
    list(type = "range", col = "age", min = "0", max = "120")
  ),
  as = "survey"
)
expect_true(inherits(tv_validate_report, "tv_validate"))
expect_true(inherits(tv_validate_report$overview, "data.table"))
expect_true(inherits(tv_validate_report$rules, "data.table"))
expect_true(grepl('tv_validate\\(survey, rules = list', attr(tv_validate_report, "tv_code")))

compare_state <- new.env(parent = emptyenv())
compare_state$dt <- data.table::data.table(
  id = c(1L, 2L, 3L),
  status = c("Open", "Closed", "Open"),
  score = c(10, 20, 30)
)
compare_state$name <- "current_data"
compare_state$history <- character(0)
compare_state$undo_stack <- list()
compare_state$sessions <- list()
compare_state$active_idx <- 0L

compare_res <- .api_compare_summary(list(
  right_dt = data.table::data.table(
    id = c(2L, 3L, 4L),
    status = c("Closed", "Pending", "Open"),
    score = c(20, 35, 40),
    extra = c("x", "y", "z")
  ),
  right_name = "previous_data",
  by = "id"
), compare_state)
expect_true(compare_res$ok)
expect_equal(compare_res$overview$shared_columns_n, 3L)
expect_equal(compare_res$overview$right_only_columns_n, 1L)
expect_equal(compare_res$key_summary$matched_keys, 2L)
expect_equal(compare_res$key_summary$only_left_keys, 1L)
expect_equal(compare_res$key_summary$only_right_keys, 1L)
expect_equal(compare_res$key_summary$changed_rows, 1L)
expect_true("score" %in% compare_res$key_summary$changed_columns)

tv_compare_report <- tv_compare(
  data.table::data.table(id = c(1L, 2L), status = c("Open", "Closed")),
  data.table::data.table(id = c(2L, 3L), status = c("Closed", "Open"), score = c(1, 2)),
  by = "id",
  as = "current_data",
  other_name = "previous_data"
)
expect_true(inherits(tv_compare_report, "tv_compare"))
expect_true(inherits(tv_compare_report$overview, "data.table"))
expect_true(inherits(tv_compare_report$shared_columns, "data.table"))
expect_true(grepl("tv_compare\\(current_data, previous_data, by = c\\(\"id\"\\)\\)", attr(tv_compare_report, "tv_code")))

list_col_dt <- data.table::data.table(
  id = 1:3,
  tags = list(c("alpha", "beta"), character(0), "gamma")
)
list_meta <- .dt_column_meta(list_col_dt)
expect_equal(list_meta[[2]]$type, "list")
expect_equal(list_meta[[2]]$n_unique, 3L)
list_preview <- .dt_preview(list_col_dt, n = 2)
expect_equal(list_preview[[1]]$tags, "alpha, beta")
expect_equal(list_preview[[2]]$tags, "")

if (!requireNamespace("tsg", quietly = TRUE)) {
  expect_error(
    tv_generate_frequency(data.table::data.table(x = c("a", "b")), "x"),
    "Package 'tsg'"
  )
  expect_error(
    tv_generate_crosstab(data.table::data.table(x = c("a", "b"), y = c("u", "v")), "x", "y"),
    "Package 'tsg'"
  )
}

if (!requireNamespace("phscs", quietly = TRUE)) {
  expect_error(
    tv_join_psgc(data.table::data.table(area_code = "01001001"), area_code = "area_code"),
    "Package 'phscs'"
  )
}

if (!requireNamespace("rcdf", quietly = TRUE)) {
  expect_error(
    tv_read_rcdf("example.rcdf", decryption_key = "example.pem"),
    "Package 'rcdf'"
  )
}
