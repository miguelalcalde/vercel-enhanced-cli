/**
 * Loads Vercel token from environment variable or provided token.
 * @param providedToken - Optional token provided via CLI flag
 * @returns The token string or null if not found
 */
export function loadVercelToken(providedToken?: string): string | null {
  // Use provided token first (from CLI flag)
  if (providedToken) {
    return providedToken
  }

  // Check environment variable
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
        "  - Command line: vercli projects --token YOUR_TOKEN\n" +
        "  - Environment variable: export VERCEL_TOKEN=YOUR_TOKEN"
    )
  }
  return token
}
