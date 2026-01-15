/**
 * UI styling constants and utilities for terminal rendering
 */

// Box-drawing characters for table borders
// Using + for corners as requested for a cleaner look
export const BOX = {
  corner: "+",        // All corners use +
  horizontal: "─",
  vertical: "│",
  cross: "+",         // Intersections also use +
}

// Selection indicators
export const INDICATORS = {
  cursor: "→",
  unselected: "△",
  selected: "▲",
}

// Default table width
export const TABLE_WIDTH = 100

/**
 * Get the table width for rendering
 * Currently returns a fixed width, but could be made dynamic
 */
export function getTableWidth(): number {
  return TABLE_WIDTH
}

/**
 * Detect if Nerd Font is likely available
 * Checks environment variables and common terminal indicators
 */
export function detectNerdFont(): boolean {
  // Check explicit env vars (user override)
  if (process.env.NERD_FONTS === "1") return true
  if (process.env.NERD_FONTS === "0") return false

  // Check common terminal indicators that typically have Nerd Fonts
  const term = process.env.TERM_PROGRAM || ""
  const nerdFontTerminals = ["WezTerm", "kitty", "Alacritty"]
  if (nerdFontTerminals.some((t) => term.toLowerCase().includes(t.toLowerCase()))) return true

  // Check for font-related env vars (common in dotfiles)
  if (process.env.NERD_FONT) return true

  return false
}

// Nerd Font icons (only used when enabled)
// Using Unicode private use area codepoints from Nerd Fonts
export const ICONS = {
  project: "\uf413",      // nf-oct-repo
  settings: "\uf013",     // nf-fa-cog
  browser: "\uf0ac",      // nf-fa-globe
  deployments: "\uf0e8",  // nf-fa-sitemap
  logs: "\uf15c",         // nf-fa-file_text
  search: "\uf002",       // nf-fa-search
  refresh: "\uf021",      // nf-fa-refresh
  delete: "\uf1f8",       // nf-fa-trash
}

/**
 * Determine if icons should be enabled based on CLI flags and auto-detection
 * @param cliIconsFlag - The value from CLI --icons/--no-icons flag (true, false, or undefined)
 */
export function getIconsEnabled(cliIconsFlag?: boolean): boolean {
  // CLI flag takes precedence
  if (cliIconsFlag === true) return true
  if (cliIconsFlag === false) return false

  // Fall back to auto-detection
  return detectNerdFont()
}

/**
 * Helper to create a horizontal border line (no corners)
 */
export function createHorizontalBorder(width: number = TABLE_WIDTH): string {
  return BOX.horizontal.repeat(width)
}

/**
 * Helper to create a top border with + corners
 */
export function createTopBorder(width: number = TABLE_WIDTH): string {
  return `${BOX.corner}${BOX.horizontal.repeat(width - 2)}${BOX.corner}`
}

/**
 * Helper to create a bottom border with + corners
 */
export function createBottomBorder(width: number = TABLE_WIDTH): string {
  return `${BOX.corner}${BOX.horizontal.repeat(width - 2)}${BOX.corner}`
}

/**
 * Helper to create a middle separator with + connectors
 */
export function createMiddleBorder(width: number = TABLE_WIDTH): string {
  return `${BOX.corner}${BOX.horizontal.repeat(width - 2)}${BOX.corner}`
}

/**
 * Helper to create a row with vertical borders on both sides
 * @param content - The content to wrap with borders
 * @param width - Total width including borders
 */
export function createBorderedRow(content: string, width: number = TABLE_WIDTH): string {
  // Calculate visible length (strip ANSI codes for length calculation)
  const visibleLength = content.replace(/\x1b\[[0-9;]*m/g, "").length
  const padding = Math.max(0, width - 2 - visibleLength)
  return `${BOX.vertical}${content}${" ".repeat(padding)}${BOX.vertical}`
}
