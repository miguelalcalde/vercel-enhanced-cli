import * as fs from "fs"
import * as path from "path"

/**
 * Get the path to the error log file (in workspace root where CLI is executed)
 */
export function getErrorLogPath(): string {
  return path.resolve(process.cwd(), ".vcli-errors.log")
}

/**
 * Log an error to the error log file
 * @param error - The error object or message
 * @param context - Additional context about where/why the error occurred
 */
export function logError(
  error: Error | string,
  context?: {
    operation?: string
    projectName?: string
    projectId?: string
    teamId?: string | null
    [key: string]: unknown
  }
): void {
  try {
    const errorLogPath = getErrorLogPath()
    const timestamp = new Date().toISOString()
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    const logEntry = {
      timestamp,
      error: errorMessage,
      stack: errorStack,
      context: context || {},
    }

    const logLine = JSON.stringify(logEntry) + "\n"

    // Append to error log file (create if doesn't exist)
    fs.appendFileSync(errorLogPath, logLine, { encoding: "utf8" })
  } catch (logError) {
    // If we can't write to the log file, at least try to show it
    console.error("Failed to write to error log:", logError)
    console.error("Original error:", error)
  }
}

/**
 * Clear the error log file
 */
export function clearErrorLog(): void {
  try {
    const errorLogPath = getErrorLogPath()
    if (fs.existsSync(errorLogPath)) {
      fs.unlinkSync(errorLogPath)
    }
  } catch (error) {
    // Ignore errors when clearing
  }
}
