# tidyview news

## tidyview 0.3.0

- started the `0.3.0` development cycle
- carried forward the guided workflow, safety, and list-column stability improvements completed in `0.2.0`
- added recipe-style helpers in `mutate` for unit conversions, text cleanup, and date helpers
- added guided cleanup recipes in `recode` for yes/no standardization, allowed-label cleanup, and grouped recodes
- added stronger previews for `separate / unite`, including row and column impact before apply
- added richer `join` diagnostics for unmatched keys, duplicate keys, row expansion, and many-to-many risk
- added stronger `compare` reporting for changed matched rows, changed columns, and readable change examples
- added `summarise` missing-value controls with `ignore missing values` and per-rule `ignore NA` support
- added small helper text guidance in `summarise`, `join`, and `compare`
- expanded `validate` with quick templates for required fields, unique IDs, allowed values, numeric ranges, date ranges, and future-date checks
- improved validation summaries with passed rows, failed rows, and columns with the most issues
- expanded regression coverage for compare, summarise `na.rm`, validation recipes, regex case handling, and date validation

## tidyview 0.2.0

- refreshed the core workflow panels with clearer, more guided labels and copy
- added stronger impact previews and warnings for actions such as `recode`, `join`, and `drop_na`
- improved stability for list-column datasets such as `dplyr::starwars`
- fixed `mutate` and `drop_na` workflows that previously failed on list-columns
- expanded regression coverage for recode behavior and list-column operations
- updated the README, launcher documentation, and getting-started vignette to match the guided interface
