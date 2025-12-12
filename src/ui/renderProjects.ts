import chalk from "chalk"
import { VercelProject, VercelDeployment } from "../api/vercelApi.js"

export interface ProjectWithMetadata extends VercelProject {
  lastDeployment?: VercelDeployment | null
  deploymentLoading?: boolean
}

/**
 * Format a timestamp as a relative time string (e.g., "2d ago", "3h ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return `${years}y ago`
  if (months > 0) return `${months}mo ago`
  if (weeks > 0) return `${weeks}w ago`
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return "just now"
}

/**
 * Format deployment state with color
 */
function formatDeploymentState(state?: string): string {
  if (!state) return chalk.gray("never")

  switch (state) {
    case "READY":
      return chalk.green("ready")
    case "BUILDING":
      return chalk.yellow("building")
    case "ERROR":
      return chalk.red("error")
    case "CANCELED":
      return chalk.gray("canceled")
    case "QUEUED":
      return chalk.blue("queued")
    case "INITIALIZING":
      return chalk.cyan("initializing")
    default:
      return state.toLowerCase()
  }
}

/**
 * Create a formatted display string for a project option
 */
export function formatProjectOption(project: ProjectWithMetadata): string {
  const name = project.name
  const updated = formatRelativeTime(project.updatedAt)

  let deploymentInfo: string
  if (project.deploymentLoading) {
    deploymentInfo = chalk.blue("⋯ loading")
  } else if (project.lastDeployment) {
    const deployTime = formatRelativeTime(project.lastDeployment.createdAt)
    const deployState = formatDeploymentState(project.lastDeployment.state)
    deploymentInfo = `${deployTime} (${deployState})`
  } else {
    deploymentInfo = chalk.gray("never deployed")
  }

  return `${name.padEnd(30)} ${updated.padEnd(10)} ${deploymentInfo}`
}

/**
 * Display a header for the projects list
 */
export function renderProjectsHeader(): void {
  console.log("\n" + chalk.bold("Projects:"))
  console.log(
    chalk.gray(
      "Name".padEnd(30) + "Updated".padEnd(12) + "Last Deployment".padEnd(20)
    )
  )
  console.log(chalk.gray("-".repeat(62)))
}

/**
 * Display projects in a formatted list
 */
export function renderProjectsList(projects: ProjectWithMetadata[]): void {
  if (projects.length === 0) {
    console.log(chalk.yellow("No projects found."))
    return
  }

  renderProjectsHeader()
  projects.forEach((project) => {
    console.log(formatProjectOption(project))
  })
  console.log()
}
