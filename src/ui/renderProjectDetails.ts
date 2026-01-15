import chalk from "chalk"
import { VercelProjectDetails, VercelDomain } from "../api/vercelApi.js"

/**
 * Format Git repository information for display
 */
export function formatGitRepository(
  link: VercelProjectDetails["link"]
): string {
  if (!link) {
    return chalk.gray("Not connected")
  }

  const repoName = `${link.org}/${link.repoName}`
  const branch = link.productionBranch || "main"
  const provider =
    link.type === "github"
      ? "GitHub"
      : link.type === "gitlab"
      ? "GitLab"
      : link.type

  return `${chalk.blue(repoName)} ${chalk.gray(
    `(${branch} branch)`
  )}\n  Connected via ${provider}`
}

/**
 * Format framework and build settings for display
 */
export function formatFrameworkInfo(details: VercelProjectDetails): string {
  const framework = details.framework
    ? details.framework.charAt(0).toUpperCase() + details.framework.slice(1)
    : chalk.gray("Auto-detected")

  const buildCommand = formatBuildCommand(details.buildCommand)
  const devCommand = formatBuildCommand(details.devCommand)
  const installCommand = formatBuildCommand(details.installCommand)
  const outputDirectory = details.outputDirectory || chalk.gray("Default")
  const rootDirectory = details.rootDirectory || chalk.gray("Repository root")

  return `Framework: ${framework}
Build: ${buildCommand}
Dev: ${devCommand}
Install: ${installCommand}
Output: ${outputDirectory}
Root: ${rootDirectory}`
}

/**
 * Format build command or show "Auto-detected" placeholder
 */
export function formatBuildCommand(command: string | null | undefined): string {
  return command || chalk.gray("Auto-detected")
}

/**
 * Format domains list with verified status and type indicators
 */
export function formatDomainsList(domains: VercelDomain[]): string {
  if (domains.length === 0) {
    return chalk.gray("No domains configured")
  }

  return domains
    .map((domain) => {
      const verifiedIcon = domain.verified
        ? chalk.green("✓")
        : chalk.yellow("⚠")
      const verifiedText = domain.verified ? "" : chalk.yellow(" (Unverified)")

      // Determine domain type (production vs preview)
      const isProduction =
        !domain.gitBranch ||
        domain.gitBranch === "main" ||
        domain.gitBranch === "master"
      const typeBadge = isProduction
        ? chalk.blue("Production")
        : chalk.gray(`Preview (${domain.gitBranch})`)

      // Show redirect info if configured
      let redirectInfo = ""
      if (domain.redirect) {
        redirectInfo = chalk.gray(` → ${domain.redirect}`)
      }

      return `  ${verifiedIcon} ${chalk.bold(
        domain.name
      )}${redirectInfo}${verifiedText} ${chalk.gray(`(${typeBadge})`)}`
    })
    .join("\n")
}

/**
 * Format time ago from timestamp
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) {
    return "just now"
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`
  } else {
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`
  }
}
