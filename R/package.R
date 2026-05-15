#' tidyview: Guided Data Workflows With a Browser-Based R Interface
#'
#' `tidyview` helps analysts inspect, clean, validate, reshape, compare, and
#' export data through a browser-based interface while keeping the generated R
#' code visible and reusable. It is designed for people who want a more guided
#' workflow without losing transparency about what the package is doing.
#'
#' The main entry point is [tidygui()], which launches the local app and shows
#' generated paste-ready `data.table` code in a live script pane. The package
#' also includes programmatic helpers such as [tv_filter()], [tv_mutate()],
#' [tv_summarise()], [tv_compare()], [tv_validate()], [tv_tabulate()], and
#' [tv_crosstab()] for workflows that need direct code access.
#'
#' @details
#' `tidyview` uses a tidyverse-style interface language in the GUI, but
#' currently generates and executes `data.table`-based code in the script pane.
#' The package aims to be teachable and transparent: most workflows explain
#' what they will do before applying a change, and the generated code remains
#' visible throughout the session.
#'
#' For a typical session:
#' \enumerate{
#'   \item load data from the R environment or a supported file format
#'   \item inspect columns, missingness, and duplicates
#'   \item transform or validate the data with guided panels
#'   \item review the generated code
#'   \item export the result or continue working programmatically
#' }
#'
#' @section Getting started:
#' \itemize{
#'   \item Use [tidygui()] to launch the app with no data loaded yet.
#'   \item Pass a data frame or `data.table` to [tidygui()] to start with an
#'   existing dataset.
#'   \item Use the generated script pane to copy, review, and reuse the
#'   operations you perform in the interface.
#' }
#'
#' @section Common workflows:
#' \itemize{
#'   \item inspect column types, labels, duplicates, and missingness
#'   \item filter, select, arrange, and mutate with guided controls
#'   \item recode categories and validate business rules
#'   \item summarise, tabulate, and crosstab data
#'   \item join, compare, separate, unite, and reshape datasets
#'   \item add PSGC area names from bundled lookup data
#'   \item export transformed datasets with generated code and file previews
#' }
#'
#' @section Main functions:
#' \itemize{
#'   \item [tidygui()] launches the browser app
#'   \item [m3_theme()] customizes the app theme
#'   \item [tv_fread()] and [tv_load()] help bring data into workflow
#'   \item [tv_audit()] and [tv_missing_summary()] support data review
#'   \item [tv_validate()] adds explicit validation rules
#'   \item [tv_generate_frequency()] and [tv_generate_crosstab()] expose
#'   optional `tsg` integrations
#' }
#'
#' @section Optional integrations:
#' Some workflows use optional packages when available, including `readxl`,
#' `haven`, `rcdf`, `tsg`, `writexl`, and `rstudioapi`. PSGC area-name lookup
#' is bundled in the package and does not require a separate PSGC package.
#'
#' @section Generated code:
#' The interface uses tidyverse-style language in the GUI, but the script pane
#' currently generates and executes `data.table`-based code.
#'
#' @examples
#' \dontrun{
#' library(tidyview)
#'
#' # Launch the app with no data loaded yet
#' tidygui()
#'
#' # Launch the app with an existing data frame
#' tidygui(mtcars, name = "mtcars")
#'
#' # Programmatic helpers also return generated code
#' cars <- tv_filter(
#'   data.table::as.data.table(mtcars),
#'   list(list(col = "cyl", op = "==", val = "6"))
#' )
#' attr(cars, "tv_code")
#' }
#'
#' @seealso [tidygui()], [tv_filter()], [tv_mutate()], [tv_summarise()],
#'   [tv_compare()], [tv_validate()], [tv_audit()],
#'   [tv_missing_summary()], [tv_generate_frequency()],
#'   [tv_generate_crosstab()]
#'
#' @docType package
#' @name tidyview-package
#' @aliases tidyview
#' @import data.table
#' @keywords package
"_PACKAGE"

utils::globalVariables(c(
  ".",
  ".I",
  ".N",
  ".SD",
  ":=",
  "..tv_compare_key__",
  "..tv_psgc_join_code",
  "..tv_rowid__",
  "..tv_weight__",
  "Total",
  "area_code_old",
  "cum_pct",
  "n",
  "pct",
  "psgc_level",
  "value"
))
