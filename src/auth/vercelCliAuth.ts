import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const VERCEL_CLI_DIR = join(homedir(), "Library", "Application Support", "com.vercel.cli")
const AUTH_FILE = join(VERCEL_CLI_DIR, "auth.json")
const CONFIG_FILE = join(VERCEL_CLI_DIR, "config.json")

interface AuthJson {
  token?: string
}

interface ConfigJson {
  currentTeam?: string | null
  collectMetrics?: boolean
  telemetry?: {
    enabled?: boolean
  }
  [key: string]: unknown
}

/**
 * Reads the Vercel token from auth.json file
 * @returns The token string or null if not found
 */
function readTokenFromAuthFile(): string | null {
  try {
    const content = readFileSync(AUTH_FILE, "utf-8")
    const auth: AuthJson = JSON.parse(content)
    return auth.token || null
  } catch (error) {
    // File doesn't exist or can't be read - that's okay, we'll try other sources
    return null
  }
}

/**
 * Reads the current team from config.json file
 * @returns The team ID string, null for personal account, or undefined if not set
 */
export function readCurrentTeam(): string | null | undefined {
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8")
    const config: ConfigJson = JSON.parse(content)
    return config.currentTeam
  } catch (error) {
    // File doesn't exist or can't be read - return undefined to indicate not set
    return undefined
  }
}

/**
 * Writes the current team to config.json file, preserving other fields
 * @param teamId - The team ID string, or null for personal account
 */
export function writeCurrentTeam(teamId: string | null): void {
  try {
    // Ensure directory exists
    mkdirSync(VERCEL_CLI_DIR, { recursive: true })

    // Read existing config if it exists
    let config: ConfigJson = {}
    try {
      const content = readFileSync(CONFIG_FILE, "utf-8")
      config = JSON.parse(content)
    } catch {
      // File doesn't exist, start with default structure
      config = {
        collectMetrics: true,
        telemetry: {
          enabled: true,
        },
      }
    }

    // Update currentTeam field
    config.currentTeam = teamId

    // Write back to file with proper formatting
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8")
  } catch (error) {
    // Log error but don't throw - this is not critical for operation
    console.error(
      `Warning: Could not save current team to config.json: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/**
 * Loads Vercel token from auth.json, environment variable, or provided token.
 * Priority: CLI flag > auth.json > environment variable
 * @param providedToken - Optional token provided via CLI flag
 * @returns The token string or null if not found
 */
export function loadVercelToken(providedToken?: string): string | null {
  // Use provided token first (from CLI flag) - highest priority
  if (providedToken) {
    return providedToken
  }

  // Check auth.json file (Vercel CLI default location)
  const tokenFromFile = readTokenFromAuthFile()
  if (tokenFromFile) {
    return tokenFromFile
  }

  // Check environment variable as fallback
  if (process.env.VERCEL_TOKEN) {
    return process.env.VERCEL_TOKEN
  }

  return null
}

/**
 * Validates that a token exists and provides helpful error message if not.
 * @param providedToken - Optional token provided via CLI flag
 * @throws Error with helpful message if token is missing
 */
export function requireVercelToken(providedToken?: string): string {
  const token = loadVercelToken(providedToken)
  if (!token) {
    throw new Error(
      "Vercel authentication token not found.\n" +
        "Please provide a token using:\n" +
        "  - Command line: vercli --token YOUR_TOKEN\n" +
        "  - Environment variable: export VERCEL_TOKEN=YOUR_TOKEN\n" +
        "  - Or run 'vercel login' to set up authentication"
    )
  }
  return token
}
