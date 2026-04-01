#' Create a Material Design 3 colour theme
#'
#' Generates M3 colour role tokens from a single seed hex colour.
#' The resulting object is passed to [tidygui()] to style the GUI.
#'
#' @param seed Character. A hex colour string, e.g. `"#534AB7"`.
#'   Defaults to tidyview's signature purple.
#' @param dark Logical. Generate a dark-mode theme. Default FALSE.
#'
#' @return A named list of CSS custom property values.
#'
#' @examples
#' m3_theme()
#' m3_theme("#1D9E75")         # teal seed
#' m3_theme("#D85A30", dark = TRUE)
#'
#' @export
m3_theme <- function(seed = "#534AB7", dark = FALSE) {
  hex <- .parse_hex(seed)
  pal <- .tonal_palette(hex)

  if (!dark) {
    list(
      seed                   = seed,
      dark                   = FALSE,
      primary                = pal$p40,
      on_primary             = "#FFFFFF",
      primary_container      = pal$p90,
      on_primary_container   = pal$p10,
      secondary              = pal$s40,
      on_secondary           = "#FFFFFF",
      secondary_container    = pal$s90,
      on_secondary_container = pal$s10,
      tertiary               = pal$t40,
      on_tertiary            = "#FFFFFF",
      tertiary_container     = pal$t90,
      on_tertiary_container  = pal$t10,
      surface                = pal$n99,
      on_surface             = pal$n10,
      surface_variant        = pal$nv90,
      on_surface_variant     = pal$nv30,
      outline                = pal$nv50,
      outline_variant        = pal$nv80,
      background             = pal$n99,
      on_background          = pal$n10,
      error                  = "#BA1A1A",
      on_error               = "#FFFFFF",
      error_container        = "#FFDAD6",
      on_error_container     = "#410002"
    )
  } else {
    list(
      seed                   = seed,
      dark                   = TRUE,
      primary                = pal$p80,
      on_primary             = pal$p20,
      primary_container      = pal$p30,
      on_primary_container   = pal$p90,
      secondary              = pal$s80,
      on_secondary           = pal$s20,
      secondary_container    = pal$s30,
      on_secondary_container = pal$s90,
      tertiary               = pal$t80,
      on_tertiary            = pal$t20,
      tertiary_container     = pal$t30,
      on_tertiary_container  = pal$t90,
      surface                = pal$n10,
      on_surface             = pal$n90,
      surface_variant        = pal$nv30,
      on_surface_variant     = pal$nv80,
      outline                = pal$nv60,
      outline_variant        = pal$nv30,
      background             = pal$n10,
      on_background          = pal$n90,
      error                  = "#FFB4AB",
      on_error               = "#690005",
      error_container        = "#93000A",
      on_error_container     = "#FFDAD6"
    )
  }
}


.theme_to_css <- function(theme) {
  vars <- c(
    paste0("  --md-primary: ",                theme$primary),
    paste0("  --md-on-primary: ",             theme$on_primary),
    paste0("  --md-primary-container: ",      theme$primary_container),
    paste0("  --md-on-primary-container: ",   theme$on_primary_container),
    paste0("  --md-secondary: ",              theme$secondary),
    paste0("  --md-on-secondary: ",           theme$on_secondary),
    paste0("  --md-secondary-container: ",    theme$secondary_container),
    paste0("  --md-on-secondary-container: ", theme$on_secondary_container),
    paste0("  --md-surface: ",                theme$surface),
    paste0("  --md-on-surface: ",             theme$on_surface),
    paste0("  --md-surface-variant: ",        theme$surface_variant),
    paste0("  --md-on-surface-variant: ",     theme$on_surface_variant),
    paste0("  --md-outline: ",                theme$outline),
    paste0("  --md-outline-variant: ",        theme$outline_variant),
    paste0("  --md-background: ",             theme$background),
    paste0("  --md-on-background: ",          theme$on_background),
    paste0("  --md-error: ",                  theme$error),
    paste0("  --md-on-error: ",               theme$on_error)
  )
  paste0(":root {\n", paste(vars, collapse = ";\n"), "\n}")
}


.parse_hex <- function(hex) {
  hex <- gsub("^#", "", hex)
  if (nchar(hex) == 3L) {
    hex <- paste0(rep(strsplit(hex, "")[[1]], each = 2), collapse = "")
  }
  r <- strtoi(substr(hex, 1, 2), 16L) / 255
  g <- strtoi(substr(hex, 3, 4), 16L) / 255
  b <- strtoi(substr(hex, 5, 6), 16L) / 255
  list(r = r, g = g, b = b)
}


.tonal_palette <- function(rgb) {
  h_s_l <- .rgb_to_hsl(rgb$r, rgb$g, rgb$b)
  h <- h_s_l$h
  s <- h_s_l$s

  make_stop <- function(l) .hsl_to_hex(h, s * 0.8, l)

  list(
    p10 = make_stop(0.10), p20 = make_stop(0.20), p30 = make_stop(0.30),
    p40 = make_stop(0.40), p80 = make_stop(0.80), p90 = make_stop(0.90),
    s10 = .hsl_to_hex((h + 30) %% 360, s * 0.5, 0.10),
    s20 = .hsl_to_hex((h + 30) %% 360, s * 0.5, 0.20),
    s30 = .hsl_to_hex((h + 30) %% 360, s * 0.5, 0.30),
    s40 = .hsl_to_hex((h + 30) %% 360, s * 0.5, 0.40),
    s80 = .hsl_to_hex((h + 30) %% 360, s * 0.5, 0.80),
    s90 = .hsl_to_hex((h + 30) %% 360, s * 0.5, 0.90),
    t10 = .hsl_to_hex((h + 60) %% 360, s * 0.6, 0.10),
    t20 = .hsl_to_hex((h + 60) %% 360, s * 0.6, 0.20),
    t30 = .hsl_to_hex((h + 60) %% 360, s * 0.6, 0.30),
    t40 = .hsl_to_hex((h + 60) %% 360, s * 0.6, 0.40),
    t80 = .hsl_to_hex((h + 60) %% 360, s * 0.6, 0.80),
    t90 = .hsl_to_hex((h + 60) %% 360, s * 0.6, 0.90),
    n10  = "#1C1B1F", n90 = "#E6E1E5", n99 = "#FFFBFE",
    nv30 = "#49454E", nv50 = "#79747E", nv60 = "#948F99",
    nv80 = "#CAC4D0", nv90 = "#E7E0EC"
  )
}


.rgb_to_hsl <- function(r, g, b) {
  mx <- max(r, g, b); mn <- min(r, g, b)
  l  <- (mx + mn) / 2
  if (mx == mn) return(list(h = 0, s = 0, l = l))
  d <- mx - mn
  s <- if (l > 0.5) d / (2 - mx - mn) else d / (mx + mn)
  h <- if      (mx == r) ((g - b) / d + if (g < b) 6 else 0) / 6
       else if (mx == g) ((b - r) / d + 2) / 6
       else               ((r - g) / d + 4) / 6
  list(h = h * 360, s = s, l = l)
}


.hsl_to_hex <- function(h, s, l) {
  h <- h / 360
  if (s == 0) {
    v <- round(l * 255)
    return(sprintf("#%02X%02X%02X", v, v, v))
  }
  q <- if (l < 0.5) l * (1 + s) else l + s - l * s
  p <- 2 * l - q
  hue2rgb <- function(t) {
    if (t < 0) t <- t + 1
    if (t > 1) t <- t - 1
    if (t < 1/6) return(p + (q - p) * 6 * t)
    if (t < 1/2) return(q)
    if (t < 2/3) return(p + (q - p) * (2/3 - t) * 6)
    p
  }
  r <- round(hue2rgb(h + 1/3) * 255)
  g <- round(hue2rgb(h)       * 255)
  b <- round(hue2rgb(h - 1/3) * 255)
  sprintf("#%02X%02X%02X", r, g, b)
}
