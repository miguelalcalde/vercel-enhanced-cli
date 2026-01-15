import chalk from "chalk";
import { VercelProject, VercelDeployment } from "../api/vercelApi.js";
import { createHorizontalBorder } from "./styles.js";

export interface ProjectWithMetadata extends VercelProject {
  lastDeployment?: VercelDeployment | null;
  deploymentLoading?: boolean;
}

/**
 * Format a timestamp as a relative time string (e.g., "2d ago", "3h ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

/**
 * Format deployment state with color
 */
function formatDeploymentState(state?: string): string {
  if (!state) return chalk.gray("never");

  switch (state) {
    case "READY":
      return chalk.green("ready");
    case "BUILDING":
      return chalk.yellow("building");
    case "ERROR":
      return chalk.red("error");
    case "CANCELED":
      return chalk.gray("canceled");
    case "QUEUED":
      return chalk.blue("queued");
    case "INITIALIZING":
      return chalk.cyan("initializing");
    default:
      return state.toLowerCase();
  }
}

/**
 * Create a formatted display string for a project option
 */
export function formatProjectOption(project: ProjectWithMetadata): string {
  const name = project.name.padEnd(35);
  const created = formatRelativeTime(project.createdAt).padEnd(10);
  const updated = formatRelativeTime(project.updatedAt).padEnd(10);

  let deploymentInfo: string;
  let creator: string;
  if (project.deploymentLoading) {
    deploymentInfo = chalk.blue("⋯ loading").padEnd(20);
    creator = chalk.blue("⋯").padEnd(15);
  } else if (project.lastDeployment) {
    const deployTime = formatRelativeTime(project.lastDeployment.createdAt);
    const deployState = formatDeploymentState(project.lastDeployment.state);
    deploymentInfo = `${deployTime} (${deployState})`.padEnd(20);
    // Get creator info - use username, email, or uid in that order
    const creatorInfo = project.lastDeployment.creator;
    if (creatorInfo) {
      creator = (
        creatorInfo.username ||
        creatorInfo.email ||
        creatorInfo.uid ||
        "unknown"
      ).padEnd(15);
    } else {
      creator = chalk.gray("unknown").padEnd(15);
    }
  } else {
    deploymentInfo = chalk.gray("never deployed").padEnd(20);
    creator = chalk.gray("-").padEnd(15);
  }

  return `${name} ${created} ${updated} ${deploymentInfo} ${creator}`;
}

/**
 * Display a header for the projects list
 */
export function renderProjectsHeader(): void {
  console.log("\n" + chalk.bold("Projects:"));
  console.log(
    chalk.gray(
      "Name".padEnd(35) +
        "Created".padEnd(10) +
        "Updated".padEnd(10) +
        "Last Deploy".padEnd(20) +
        "Deploy Creator".padEnd(15),
    ),
  );
  console.log(chalk.gray(createHorizontalBorder(90)));
}

/**
 * Display projects in a formatted list
 */
export function renderProjectsList(projects: ProjectWithMetadata[]): void {
  if (projects.length === 0) {
    console.log(chalk.yellow("No projects found."));
    return;
  }

  renderProjectsHeader();
  projects.forEach((project) => {
    console.log(formatProjectOption(project));
  });
  console.log();
}
