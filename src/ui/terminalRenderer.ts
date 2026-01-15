import ansiEscapes from "ansi-escapes"

/**
 * Terminal rendering utilities using ansi-escapes for cleaner cursor control
 */

/**
 * Clear the entire screen and move cursor to top-left
 * Use this for initial screen setup or major UI transitions
 */
export function clearScreen(): void {
  process.stdout.write(ansiEscapes.clearScreen)
  process.stdout.write(ansiEscapes.cursorTo(0, 0))
}

/**
 * Move cursor to top-left without clearing screen
 * Use this for incremental updates where content is overwritten
 */
export function moveToTop(): void {
  process.stdout.write(ansiEscapes.cursorTo(0, 0))
}

/**
 * Hide the cursor
 * Useful during interactive rendering to prevent cursor flicker
 */
export function hideCursor(): void {
  process.stdout.write(ansiEscapes.cursorHide)
}

/**
 * Show the cursor
 * Restore cursor visibility when done rendering
 */
export function showCursor(): void {
  process.stdout.write(ansiEscapes.cursorShow)
}

/**
 * Erase from current cursor position to end of screen
 * Use this to clean up remaining content when new content is shorter
 */
export function eraseDown(): void {
  process.stdout.write(ansiEscapes.eraseDown)
}

/**
 * Erase the current line
 */
export function eraseLine(): void {
  process.stdout.write(ansiEscapes.eraseLine)
}

/**
 * Initialize screen for rendering: clear and hide cursor
 * Call this once at the start of an interactive session
 */
export function initializeScreen(): void {
  clearScreen()
  hideCursor()
}

/**
 * Restore screen state: show cursor
 * Call this when exiting an interactive session
 */
export function restoreScreen(): void {
  showCursor()
}
