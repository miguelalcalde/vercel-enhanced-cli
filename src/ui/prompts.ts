import { select, confirm, checkbox } from "@inquirer/prompts"
import chalk from "chalk"
import * as readline from "readline"
import open from "open"
import { ProjectWithMetadata } from "./renderProjects.js"
import { VercelDomain } from "../api/vercelApi.js"
import {
  initializeScreen,
  moveToTop,
  restoreScreen,
  clearScreen,
  eraseDown,
  hideCursor,
  eraseLine,
} from "./terminalRenderer.js"
import { getCached, setCache, invalidateCachePrefix } from "../utils/cache.js"
import {
  INDICATORS,
  BOX,
  ICONS,
  getIconsEnabled,
  getTableWidth,
  TABLE_WIDTH,
  createHorizontalBorder,
  createTopBorder,
  createBottomBorder,
  createMiddleBorder,
  createBorderedRow,
} from "./styles.js"

/** Cache key prefix for detail view data */
const CACHE_KEY_DETAIL_VIEW = "detail-view:"

/**
 * Data fetched for detail view
 */
export interface DetailViewData {
  domains: VercelDomain[]
  commitMessage?: string
  loading: boolean
}

/**
 * Callback to fetch detail view data for a project
 */
export type FetchDetailDataCallback = (
  projectId: string
) => Promise<{ domains: VercelDomain[]; commitMessage?: string }>

export interface TeamOption {
  name: string
  value: string | null // null for personal account
}

/**
 * Prompt user to select a team (or Personal account)
 */
export async function promptTeam(teams: TeamOption[]): Promise<string | null> {
  const choices = [
    { name: chalk.bold("Personal"), value: null },
    ...teams.map((team) => ({
      name: team.name,
      value: team.value,
    })),
  ]

  const selected = await select({
    message: "Select team scope:",
    choices,
  })

  return selected
}

/**
 * Settings menu for managing CLI preferences
 * @param teams - Available teams to choose from
 * @param currentTeamId - Currently selected team ID (or null for personal)
 * @returns Selected team ID (or null for personal), or null if cancelled
 */
export async function promptSettingsMenu(
  teams: TeamOption[],
  currentTeamId: string | null
): Promise<string | null | undefined> {
  // Clear screen
  clearScreen()

  const currentTeamName =
    currentTeamId === null
      ? "Personal"
      : teams.find((t) => t.value === currentTeamId)?.name || "Unknown"

  // Top border
  console.log(chalk.gray(createTopBorder()))
  // Title row
  console.log(createBorderedRow(chalk.bold.cyan("Settings")))
  // Middle separator
  console.log(chalk.gray(createMiddleBorder()))
  // Menu options
  const teamOption =
    chalk.cyan("  t") +
    " - Change team (Current: " +
    chalk.bold(currentTeamName) +
    ")"
  console.log(createBorderedRow(teamOption))
  console.log(createBorderedRow(chalk.gray("  ESC - Back to projects")))
  // Bottom border
  console.log(chalk.gray(createBottomBorder()))

  return new Promise((resolve, reject) => {
    const wasRawMode = process.stdin.isRaw
    let escapeSequence = ""

    if (!wasRawMode) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    const handleData = (chunk: Buffer) => {
      const data = chunk.toString("utf8")
      const fullData = escapeSequence + data

      // Handle arrow keys (ignore them in settings menu)
      if (
        fullData.length >= 3 &&
        fullData[0] === "\x1b" &&
        fullData[1] === "["
      ) {
        if (
          fullData.length >= 3 &&
          (fullData[2] === "A" || fullData[2] === "B")
        ) {
          escapeSequence = ""
          return // Ignore arrow keys
        } else if (fullData.length === 2) {
          escapeSequence = fullData
          return
        } else {
          escapeSequence = ""
        }
      } else if (fullData.length === 1 && fullData[0] === "\x1b") {
        escapeSequence = fullData
        return
      } else if (escapeSequence.length > 0) {
        escapeSequence = ""
      }

      // Handle Ctrl+C
      if (data === "\x03" || (data.length === 1 && data.charCodeAt(0) === 3)) {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        restoreScreen()
        process.stdout.write("\n")
        resolve(undefined) // Cancelled
        return
      }

      // Handle ESC to go back
      if (data === "\x1b" && escapeSequence === "") {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        clearScreen()
        restoreScreen()
        resolve(undefined) // Back to projects
        return
      }

      // Handle 't' to change team
      if (data === "t") {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        clearScreen()
        restoreScreen()
        // Signal to change team - will be handled by caller
        resolve(null) // Signal to change team
        return
      }
    }

    process.stdin.on("data", handleData)

    // Cleanup on error
    process.stdin.on("error", (err) => {
      process.stdin.removeListener("data", handleData)
      process.stdin.setRawMode(wasRawMode || false)
      process.stdin.pause()
      reject(err)
    })
  })
}

export interface ProjectOption {
  name: string
  value: string
  description?: string
}

/**
 * Prompt user to select a single project (for opening)
 */
export async function promptProject(
  projects: ProjectOption[]
): Promise<string> {
  const selected = await select({
    message: "Select a project to open:",
    choices: projects.map((p) => ({
      name: p.name,
      value: p.value,
      description: p.description,
    })),
  })

  return selected
}

/**
 * Custom checkbox prompt with immediate action shortcuts (d delete, o open)
 * Returns the selected project IDs and the action to perform
 * @param pageSize - Number of projects to show per page (default: 10)
 */
export async function promptProjectsWithActions(
  projects: ProjectOption[],
  pageSize: number = 10
): Promise<{
  projectIds: string[]
  action:
    | "open"
    | "open-settings"
    | "open-deployments"
    | "open-logs"
    | "delete"
    | null
}> {
  if (!process.stdin.isTTY) {
    // Fallback to regular checkbox if not TTY
    const selected = await checkbox({
      message: "Select projects:",
      choices: projects.map((p) => ({
        name: p.name,
        value: p.value,
        description: p.description,
      })),
      pageSize,
    })
    return {
      projectIds: selected,
      action: selected.length > 0 ? "delete" : null,
    }
  }

  return new Promise((resolve, reject) => {
    const selected = new Set<string>()
    let cursorIndex = 0
    let startIndex = 0 // For pagination
    const wasRawMode = process.stdin.isRaw
    let escapeSequence = ""
    let lastRenderedLineCount = 0
    let isInitialized = false

    // Ensure raw mode
    if (!wasRawMode) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    const render = () => {
      // Initialize screen once at start
      if (!isInitialized) {
        initializeScreen()
        isInitialized = true
      } else {
        // Just move cursor to top for subsequent renders
        moveToTop()
      }

      let currentLine = 1

      // Top border of the table
      eraseLine()
      process.stdout.write(chalk.gray(createTopBorder()) + "\n")
      currentLine++

      // Table header row with vertical borders
      eraseLine()
      const headerContent =
        "    " +
        "Name".padEnd(35) +
        "Created".padEnd(10) +
        "Updated".padEnd(10) +
        "Last Deploy".padEnd(20) +
        "Deploy Creator".padEnd(15)
      process.stdout.write(chalk.gray(createBorderedRow(headerContent)) + "\n")
      currentLine++

      // Middle separator between header and content
      eraseLine()
      process.stdout.write(chalk.gray(createMiddleBorder()) + "\n")
      currentLine++

      const endIndex = Math.min(startIndex + pageSize, projects.length)
      const visibleProjects = projects.slice(startIndex, endIndex)

      for (let i = 0; i < visibleProjects.length; i++) {
        const projectIndex = startIndex + i
        const project = projects[projectIndex]
        const isSelected = selected.has(project.value)
        const isCursor = projectIndex === cursorIndex

        const prefix = isCursor ? chalk.cyan(`${INDICATORS.cursor} `) : "  "
        const checkbox = isSelected
          ? chalk.white(INDICATORS.selected)
          : INDICATORS.unselected
        const name = isCursor
          ? chalk.cyan(project.name)
          : isSelected
          ? chalk.bold(project.name)
          : project.name

        // Create row content and wrap with borders
        const rowContent = `${prefix}${checkbox} ${name}`
        eraseLine()
        process.stdout.write(createBorderedRow(rowContent) + "\n")
        currentLine++
      }

      // Bottom border of the table
      eraseLine()
      process.stdout.write(chalk.gray(createBottomBorder()) + "\n")
      currentLine++

      if (projects.length > pageSize) {
        eraseLine()
        process.stdout.write(
          chalk.gray(
            `Page ${Math.floor(startIndex / pageSize) + 1} of ${Math.ceil(
              projects.length / pageSize
            )}\n`
          )
        )
        currentLine++
      }

      if (selected.size > 0) {
        eraseLine()
        process.stdout.write(
          chalk.green(`${selected.size} project(s) selected\n`)
        )
        currentLine++
      }

      // Footer with navigation hints
      eraseLine()
      process.stdout.write("\n")
      eraseLine()
      process.stdout.write(
        chalk.gray(
          "↑↓ navigate  space select  a all  i invert  d delete  o open\n"
        )
      )
      currentLine += 2

      // Erase remaining lines if content shrunk
      if (currentLine < lastRenderedLineCount) {
        eraseDown()
      }
      lastRenderedLineCount = currentLine
    }

    const handleData = (chunk: Buffer) => {
      const data = chunk.toString("utf8")

      // Combine with any existing escape sequence
      const fullData = escapeSequence + data

      // Check for complete arrow key sequences
      // Arrow keys come as: \x1b[A (up) or \x1b[B (down) - 3 characters total
      // They may arrive as single chunk "\x1b[A" or as separate chunks "\x1b", "[", "A"
      if (
        fullData.length >= 3 &&
        fullData[0] === "\x1b" &&
        fullData[1] === "["
      ) {
        if (fullData.length >= 3 && fullData[2] === "A") {
          // Up arrow - complete sequence
          escapeSequence = ""
          cursorIndex = Math.max(0, cursorIndex - 1)
          if (cursorIndex < startIndex) {
            startIndex = Math.max(0, startIndex - pageSize)
          }
          render()
          return
        } else if (fullData.length >= 3 && fullData[2] === "B") {
          // Down arrow - complete sequence
          escapeSequence = ""
          cursorIndex = Math.min(projects.length - 1, cursorIndex + 1)
          if (cursorIndex >= startIndex + pageSize) {
            startIndex = Math.min(
              projects.length - pageSize,
              startIndex + pageSize
            )
          }
          render()
          return
        } else if (fullData.length === 2) {
          // Still building - have "\x1b[" but waiting for A/B
          escapeSequence = fullData
          return
        } else {
          // Invalid sequence, reset
          escapeSequence = ""
        }
      } else if (fullData.length === 1 && fullData[0] === "\x1b") {
        // Just started escape sequence
        escapeSequence = fullData
        return
      } else if (escapeSequence.length > 0) {
        // Had escape sequence but this doesn't match, reset
        escapeSequence = ""
      }

      // Handle Ctrl+C
      if (data === "\x03" || (data.length === 1 && data.charCodeAt(0) === 3)) {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\n")
        resolve({ projectIds: [], action: null })
        return
      }

      // Handle 'd' for delete - immediately trigger if projects selected
      if (data === "d" && selected.size > 0) {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        clearScreen()
        restoreScreen()
        resolve({
          projectIds: Array.from(selected),
          action: "delete",
        })
        return
      }

      // Handle 'o' for open - use cursor position if nothing selected
      if (data === "o") {
        const projectToOpen =
          selected.size > 0
            ? Array.from(selected)
            : [projects[cursorIndex].value]

        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        clearScreen()
        restoreScreen()
        resolve({
          projectIds: projectToOpen,
          action: "open",
        })
        return
      }

      // Handle space to toggle selection
      if (data === " ") {
        const project = projects[cursorIndex]
        if (selected.has(project.value)) {
          selected.delete(project.value)
        } else {
          selected.add(project.value)
        }
        render()
        return
      }

      // Handle 'a' to select all
      if (data === "a") {
        projects.forEach((p) => selected.add(p.value))
        render()
        return
      }

      // Handle 'i' to invert selection
      if (data === "i") {
        projects.forEach((p) => {
          if (selected.has(p.value)) {
            selected.delete(p.value)
          } else {
            selected.add(p.value)
          }
        })
        render()
        return
      }

      // Reset escape sequence if not part of one (and not already handled)
      if (escapeSequence.length > 0 && !escapeSequence.startsWith("\x1b")) {
        escapeSequence = ""
      }
    }

    // Set up data listener for raw stdin
    process.stdin.on("data", handleData)

    // Initial render
    render()

    // Cleanup on error
    process.stdin.on("error", (err) => {
      process.stdin.removeListener("data", handleData)
      process.stdin.setRawMode(wasRawMode || false)
      process.stdin.pause()
      restoreScreen()
      reject(err)
    })
  })
}

/**
 * Custom checkbox prompt with dynamic updates support
 * Allows external updates to the project list while preserving user interaction state
 * @param initialProjects - Initial project options to display
 * @param pageSize - Number of projects to show per page (default: 10)
 * @param onUpdate - Callback function that receives an update registration function
 * @param allProjectsWithMetadata - Optional full project metadata for search filtering
 * @param formatProjectOptionFn - Optional function to format projects (needed for search filtering)
 * @param teams - Available teams for settings menu
 * @param currentTeamId - Currently selected team ID
 * @param scopeSlug - Scope slug for URL generation
 * @param fetchDetailData - Callback to fetch detail view data (domains, commit message)
 * @param iconsFlag - CLI flag for icons (true=force enable, false=force disable, undefined=auto-detect)
 * @returns Selected project IDs and action to perform
 */
export async function promptProjectsWithDynamicUpdates(
  initialProjects: ProjectOption[],
  pageSize: number = 10,
  onUpdate: (callback: (projects: ProjectOption[]) => void) => void,
  allProjectsWithMetadata?: ProjectWithMetadata[],
  formatProjectOptionFn?: (project: ProjectWithMetadata) => string,
  teams?: TeamOption[],
  currentTeamId?: string | null,
  scopeSlug?: string,
  fetchDetailData?: FetchDetailDataCallback,
  iconsFlag?: boolean
): Promise<{
  projectIds: string[]
  action:
    | "open"
    | "open-settings"
    | "open-deployments"
    | "open-logs"
    | "delete"
    | "change-team"
    | "refresh"
    | null
}> {
  // Check terminal capabilities
  const supportsAnsiEscapes = process.stdout.isTTY && !process.env.CI
  const supportsCursorMovement =
    supportsAnsiEscapes && process.platform !== "win32"

  if (!supportsCursorMovement || !process.stdin.isTTY) {
    // Fallback to regular checkbox if not TTY or doesn't support dynamic updates
    const selected = await checkbox({
      message: "Select projects:",
      choices: initialProjects.map((p) => ({
        name: p.name,
        value: p.value,
        description: p.description,
      })),
      pageSize,
    })
    return {
      projectIds: selected,
      action: selected.length > 0 ? "delete" : null,
    }
  }

  return new Promise((resolve, reject) => {
    // Use a mutable reference to projects array
    let projects = [...initialProjects]
    const selected = new Set<string>()
    let cursorIndex = 0
    let startIndex = 0 // For pagination
    const wasRawMode = process.stdin.isRaw
    let escapeSequence = ""

    // Search state - search is always active (search-first interaction model)
    let searchQuery = "" // Current search/filter query (instantly applied)
    const allProjects = allProjectsWithMetadata || []
    const formatProject =
      formatProjectOptionFn || ((p: ProjectWithMetadata) => p.name)

    // Detail view state (replaces old open menu)
    let isDetailViewActive = false
    let detailViewActionIndex = 0 // 0=Open, 1=Settings, 2=Deployments, 3=Logs
    let detailViewData: DetailViewData | null = null
    let detailViewProjectId: string | null = null

    // Settings menu state
    let isSettingsMenuActive = false

    // Rendering state tracking
    let lastRenderedLineCount = 0
    let isInitialized = false
    let lastViewState: "projects" | "settings" | "detail" = "projects"

    // Icons enabled state (resolved once at start)
    const iconsEnabled = getIconsEnabled(iconsFlag)

    // Ensure raw mode
    if (!wasRawMode) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    /**
     * Format deployment state with color and icon
     */
    const formatState = (state?: string): string => {
      if (!state) return chalk.gray("○ unknown")
      switch (state) {
        case "READY":
          return chalk.green("● READY")
        case "BUILDING":
          return chalk.yellow("◐ BUILDING")
        case "ERROR":
          return chalk.red("● ERROR")
        case "QUEUED":
          return chalk.blue("○ QUEUED")
        case "CANCELED":
          return chalk.gray("○ CANCELED")
        case "INITIALIZING":
          return chalk.cyan("◐ INITIALIZING")
        default:
          return chalk.gray(`○ ${state}`)
      }
    }

    /**
     * Format relative time
     */
    const formatRelativeTime = (timestamp: number): string => {
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

    const render = () => {
      // Determine current view state
      const currentViewState: "projects" | "settings" | "detail" =
        isSettingsMenuActive
          ? "settings"
          : isDetailViewActive
          ? "detail"
          : "projects"

      // For menu transitions, clear screen completely
      // For same view updates, use cursor positioning
      if (!isInitialized || currentViewState !== lastViewState) {
        clearScreen()
        hideCursor()
        isInitialized = true
        lastViewState = currentViewState
      } else {
        // Just move cursor to top for incremental updates
        moveToTop()
      }

      let currentLine = 1

      // Show settings menu if active
      if (isSettingsMenuActive) {
        const currentTeamName =
          currentTeamId === null || currentTeamId === undefined
            ? "Personal"
            : teams?.find((t) => t.value === currentTeamId)?.name || "Unknown"

        // Top border
        eraseLine()
        process.stdout.write(chalk.gray(createTopBorder()) + "\n")
        currentLine++

        // Settings title row
        eraseLine()
        const settingsTitle = iconsEnabled
          ? `${ICONS.settings} Settings`
          : "Settings"
        process.stdout.write(
          createBorderedRow(chalk.bold.cyan(settingsTitle)) + "\n"
        )
        currentLine++

        // Middle separator
        eraseLine()
        process.stdout.write(chalk.gray(createMiddleBorder()) + "\n")
        currentLine++

        // Menu options
        eraseLine()
        const teamOption =
          chalk.cyan("  1") +
          " - Change team (Current: " +
          chalk.bold(currentTeamName) +
          ")"
        process.stdout.write(createBorderedRow(teamOption) + "\n")
        currentLine++

        eraseLine()
        process.stdout.write(
          createBorderedRow(chalk.gray("  ESC - Back to projects")) + "\n"
        )
        currentLine++

        // Bottom border
        eraseLine()
        process.stdout.write(chalk.gray(createBottomBorder()) + "\n")
        currentLine++

        // Erase remaining lines if content shrunk
        if (currentLine < lastRenderedLineCount) {
          eraseDown()
        }
        lastRenderedLineCount = currentLine
        return
      }

      // Show enhanced detail view if active
      if (isDetailViewActive) {
        // Get the project metadata
        const projectMeta = allProjects.find(
          (p) => p.id === detailViewProjectId
        )
        const projectName =
          projectMeta?.name ||
          projects.find((p) => p.value === detailViewProjectId)?.description ||
          "Project"
        const state = projectMeta?.lastDeployment?.state
        const branch = (projectMeta?.link as any)?.productionBranch || "main"
        const createdAt = projectMeta?.createdAt
        const creator = projectMeta?.lastDeployment?.creator
        const creatorName = creator?.username || creator?.email || "unknown"
        const repoOrg = projectMeta?.link?.org || projectMeta?.link?.repoOwner
        const repoName =
          projectMeta?.link?.repoName ||
          (projectMeta?.link?.repo
            ? projectMeta.link.repo.split("/").pop()
            : null)

        const detailWidth = 80

        // Header with project name and state
        eraseLine()
        process.stdout.write(chalk.gray(createTopBorder(detailWidth)) + "\n")
        currentLine++
        eraseLine()
        const stateStr = formatState(state)
        const headerLine =
          `  ${chalk.bold.white(projectName)}`.padEnd(60) + stateStr
        process.stdout.write(createBorderedRow(headerLine, detailWidth) + "\n")
        currentLine++
        eraseLine()
        process.stdout.write(chalk.gray(createMiddleBorder(detailWidth)) + "\n")
        currentLine++

        // Loading state
        if (detailViewData?.loading) {
          eraseLine()
          process.stdout.write(
            createBorderedRow(
              chalk.blue("  Loading project details..."),
              detailWidth
            ) + "\n"
          )
          currentLine++
        } else {
          // URLs (domains)
          eraseLine()
          if (detailViewData?.domains && detailViewData.domains.length > 0) {
            process.stdout.write(
              createBorderedRow(
                chalk.gray("  URLs         ") +
                  chalk.cyan(`https://${detailViewData.domains[0].name}`),
                detailWidth
              ) + "\n"
            )
            currentLine++
            // Show additional domains
            for (
              let i = 1;
              i < Math.min(detailViewData.domains.length, 3);
              i++
            ) {
              eraseLine()
              process.stdout.write(
                createBorderedRow(
                  chalk.gray("               ") +
                    chalk.cyan(`https://${detailViewData.domains[i].name}`),
                  detailWidth
                ) + "\n"
              )
              currentLine++
            }
            if (detailViewData.domains.length > 3) {
              eraseLine()
              process.stdout.write(
                createBorderedRow(
                  chalk.gray(
                    `               ... and ${
                      detailViewData.domains.length - 3
                    } more`
                  ),
                  detailWidth
                ) + "\n"
              )
              currentLine++
            }
          } else {
            process.stdout.write(
              createBorderedRow(
                chalk.gray("  URLs         ") +
                  chalk.gray("No domains configured"),
                detailWidth
              ) + "\n"
            )
            currentLine++
          }

          // Branch
          eraseLine()
          process.stdout.write(
            createBorderedRow(
              chalk.gray("  Branch       ") + chalk.white(branch),
              detailWidth
            ) + "\n"
          )
          currentLine++

          // Commit message
          eraseLine()
          if (detailViewData?.commitMessage) {
            const truncatedCommit =
              detailViewData.commitMessage.length > 50
                ? detailViewData.commitMessage.substring(0, 47) + "..."
                : detailViewData.commitMessage
            process.stdout.write(
              createBorderedRow(
                chalk.gray("  Commit       ") +
                  chalk.white(`"${truncatedCommit}"`),
                detailWidth
              ) + "\n"
            )
          } else {
            process.stdout.write(
              createBorderedRow(
                chalk.gray("  Commit       ") + chalk.gray("No commit info"),
                detailWidth
              ) + "\n"
            )
          }
          currentLine++

          // Created info
          eraseLine()
          if (createdAt) {
            process.stdout.write(
              createBorderedRow(
                chalk.gray("  Created      ") +
                  chalk.white(
                    `${formatRelativeTime(createdAt)} by @${creatorName}`
                  ),
                detailWidth
              ) + "\n"
            )
          } else {
            process.stdout.write(
              createBorderedRow(
                chalk.gray("  Created      ") + chalk.gray("Unknown"),
                detailWidth
              ) + "\n"
            )
          }
          currentLine++

          // Repository
          eraseLine()
          if (repoOrg && repoName) {
            process.stdout.write(
              createBorderedRow(
                chalk.gray("  Repository   ") +
                  chalk.blue(`https://github.com/${repoOrg}/${repoName}`),
                detailWidth
              ) + "\n"
            )
          } else {
            process.stdout.write(
              createBorderedRow(
                chalk.gray("  Repository   ") + chalk.gray("Not connected"),
                detailWidth
              ) + "\n"
            )
          }
          currentLine++
        }

        // Separator
        eraseLine()
        process.stdout.write(chalk.gray(createMiddleBorder(detailWidth)) + "\n")
        currentLine++

        // Action bar with TAB navigation
        const actionsWithIcons = iconsEnabled
          ? [
              `${ICONS.browser} Open Project`,
              `${ICONS.settings} Settings`,
              `${ICONS.deployments} Deployments`,
              `${ICONS.logs} Logs`,
            ]
          : ["Open Project", "Settings", "Deployments", "Logs"]
        const actionBar = actionsWithIcons
          .map((action, i) => {
            if (i === detailViewActionIndex) {
              return chalk.bgCyan.black(` ${action} `)
            }
            return chalk.gray(action)
          })
          .join("  ")

        eraseLine()
        process.stdout.write(
          createBorderedRow(`  ${actionBar}`, detailWidth) + "\n"
        )
        currentLine++

        eraseLine()
        process.stdout.write(chalk.gray(createBottomBorder(detailWidth)) + "\n")
        currentLine++

        // Navigation hints below the detail view
        eraseLine()
        process.stdout.write("\n")
        eraseLine()
        process.stdout.write(
          chalk.gray("TAB cycle | ENTER action | ←/ESC back\n")
        )
        currentLine += 2

        // Erase remaining lines if content shrunk
        if (currentLine < lastRenderedLineCount) {
          eraseDown()
        }
        lastRenderedLineCount = currentLine
        return
      }

      // Always show search input area (search-first interaction model)
      eraseLine()
      const searchPrefix = iconsEnabled ? `${ICONS.search} ` : ""
      if (searchQuery) {
        process.stdout.write(
          chalk.bold.cyan(`${searchPrefix}Search: ${searchQuery}`) +
            chalk.gray(
              ` (${projects.length} match${projects.length !== 1 ? "es" : ""})`
            ) +
            chalk.inverse(" ") +
            "\n"
        )
      } else {
        process.stdout.write(
          chalk.gray(`${searchPrefix}Type to search...`) +
            chalk.inverse(" ") +
            "\n"
        )
      }
      currentLine++

      // Top border of the table
      eraseLine()
      process.stdout.write(chalk.gray(createTopBorder()) + "\n")
      currentLine++

      // Table header row with vertical borders
      eraseLine()
      const headerContent =
        "    " +
        "Name".padEnd(35) +
        "Created".padEnd(10) +
        "Updated".padEnd(10) +
        "Last Deploy".padEnd(20) +
        "Deploy Creator".padEnd(15)
      process.stdout.write(chalk.gray(createBorderedRow(headerContent)) + "\n")
      currentLine++

      // Middle separator between header and content
      eraseLine()
      process.stdout.write(chalk.gray(createMiddleBorder()) + "\n")
      currentLine++

      const endIndex = Math.min(startIndex + pageSize, projects.length)
      const visibleProjects = projects.slice(startIndex, endIndex)

      for (let i = 0; i < visibleProjects.length; i++) {
        const projectIndex = startIndex + i
        const project = projects[projectIndex]
        const isSelected = selected.has(project.value)
        const isCursor = projectIndex === cursorIndex

        const prefix = isCursor ? chalk.cyan(`${INDICATORS.cursor} `) : "  "
        const checkbox = isSelected
          ? chalk.white(INDICATORS.selected)
          : INDICATORS.unselected
        const name = isCursor
          ? chalk.cyan(project.name)
          : isSelected
          ? chalk.bold(project.name)
          : project.name

        // Create row content and wrap with borders
        const rowContent = `${prefix}${checkbox} ${name}`
        eraseLine()
        process.stdout.write(createBorderedRow(rowContent) + "\n")
        currentLine++
      }

      // Bottom border of the table
      eraseLine()
      process.stdout.write(chalk.gray(createBottomBorder()) + "\n")
      currentLine++

      if (projects.length > pageSize) {
        eraseLine()
        process.stdout.write(
          chalk.gray(
            `Page ${Math.floor(startIndex / pageSize) + 1} of ${Math.ceil(
              projects.length / pageSize
            )}\n`
          )
        )
        currentLine++
      }

      if (selected.size > 0) {
        eraseLine()
        process.stdout.write(
          chalk.green(`${selected.size} project(s) selected\n`)
        )
        currentLine++
      }

      // Footer with navigation hints (search-first interaction model)
      eraseLine()
      let footerHints: string
      if (iconsEnabled) {
        footerHints =
          `${ICONS.search} Type to search | ↑↓ navigate | → details | ← back | ENTER select\n` +
          `^A invert | ${ICONS.delete} ^D delete | ${ICONS.refresh} ^R refresh | ${ICONS.settings} ^S settings\n`
      } else {
        footerHints =
          "Type to search | ↑↓ navigate | → details | ← back | ENTER select\n" +
          "^A invert | ^D delete | ^R refresh | ^S settings\n"
      }
      process.stdout.write(chalk.gray(footerHints))
      currentLine += 2

      // Erase remaining lines if content shrunk
      if (currentLine < lastRenderedLineCount) {
        eraseDown()
      }
      lastRenderedLineCount = currentLine
    }

    /**
     * Filter projects based on search query
     */
    const filterProjects = (query: string): ProjectOption[] => {
      if (!query.trim() || allProjects.length === 0) {
        return initialProjects
      }

      const searchTerm = query.toLowerCase().trim()
      const filtered = allProjects.filter((project) => {
        // Search by project name
        const nameMatch = project.name.toLowerCase().includes(searchTerm)

        // Search by deployment state (READY, BUILDING, ERROR, CANCELED, QUEUED, INITIALIZING)
        let stateMatch = false
        if (project.lastDeployment?.state) {
          stateMatch = project.lastDeployment.state.toLowerCase().includes(searchTerm)
        } else {
          // Match "never" for projects without deployments
          stateMatch = "never".includes(searchTerm)
        }

        // Search by creator name (username, email, or uid)
        let creatorMatch = false
        if (project.lastDeployment?.creator) {
          const creator = project.lastDeployment.creator
          const creatorName =
            creator.username?.toLowerCase() ||
            creator.email?.toLowerCase() ||
            creator.uid?.toLowerCase() ||
            ""
          creatorMatch = creatorName.includes(searchTerm)
        }

        return nameMatch || stateMatch || creatorMatch
      })

      // Convert filtered projects back to ProjectOption format
      return filtered.map((project) => ({
        name: formatProject(project),
        value: project.id,
        description: project.name,
      }))
    }

    // Update function that can be called externally
    const updateProjects = (newProjects: ProjectOption[]) => {
      // Don't update if we have an active search filter (search filtering takes precedence)
      if (searchQuery) {
        return
      }

      // Preserve cursor position relative to project ID if possible
      const currentProjectId =
        projects.length > 0 && cursorIndex < projects.length
          ? projects[cursorIndex].value
          : null

      const prevStartIndex = startIndex
      projects = [...newProjects]

      // Try to restore cursor position to same project ID
      if (currentProjectId) {
        const newIndex = projects.findIndex((p) => p.value === currentProjectId)
        if (newIndex !== -1) {
          cursorIndex = newIndex
        } else {
          // Project not found, clamp cursor to valid range
          cursorIndex = Math.min(cursorIndex, projects.length - 1)
        }
      } else {
        cursorIndex = Math.min(cursorIndex, projects.length - 1)
      }

      // Ensure cursor is within visible page
      if (cursorIndex < startIndex) {
        startIndex = Math.max(0, cursorIndex)
      } else if (cursorIndex >= startIndex + pageSize) {
        startIndex = Math.max(0, cursorIndex - pageSize + 1)
      }

      // Re-render with updated data
      render()

      // Prefetch if visible projects may have changed
      if (startIndex !== prevStartIndex) {
        prefetchVisibleProjects()
      }
    }

    /**
     * Apply search filter and update displayed projects
     */
    const applySearchFilter = () => {
      const filtered = filterProjects(searchQuery)

      // Preserve cursor position relative to project ID if possible
      const currentProjectId =
        projects.length > 0 && cursorIndex < projects.length
          ? projects[cursorIndex].value
          : null

      projects = filtered

      // Try to restore cursor position to same project ID
      if (currentProjectId && projects.length > 0) {
        const newIndex = projects.findIndex((p) => p.value === currentProjectId)
        if (newIndex !== -1) {
          cursorIndex = newIndex
        } else {
          // Project not found, reset to top
          cursorIndex = 0
        }
      } else {
        cursorIndex = 0
      }

      // Reset pagination
      startIndex = 0

      // Re-render
      render()

      // Prefetch detail data for newly visible projects
      prefetchVisibleProjects()
    }

    // Register the update callback
    onUpdate(updateProjects)

    // Track which projects have prefetch in-flight to avoid duplicate requests
    const prefetchInFlight = new Set<string>()

    /**
     * Prefetch detail data for visible projects (optimistic loading)
     * Called after initial render and when visible projects change
     */
    const prefetchVisibleProjects = () => {
      if (!fetchDetailData) return

      const endIndex = Math.min(startIndex + pageSize, projects.length)
      const visibleProjectIds = projects
        .slice(startIndex, endIndex)
        .map((p) => p.value)

      for (const projectId of visibleProjectIds) {
        const cacheKey = `${CACHE_KEY_DETAIL_VIEW}${projectId}`

        // Skip if already cached or prefetch in-flight
        if (getCached(cacheKey) || prefetchInFlight.has(projectId)) {
          continue
        }

        // Mark as in-flight
        prefetchInFlight.add(projectId)

        // Fetch and cache in background (fire and forget)
        fetchDetailData(projectId)
          .then((data) => {
            setCache(cacheKey, data)
          })
          .catch(() => {
            // Silently ignore prefetch errors
          })
          .finally(() => {
            prefetchInFlight.delete(projectId)
          })
      }
    }

    // Start prefetching for initial visible projects
    prefetchVisibleProjects()

    const handleData = (chunk: Buffer) => {
      const data = chunk.toString("utf8")

      // Combine with any existing escape sequence
      const fullData = escapeSequence + data

      // Check for complete arrow key sequences
      if (
        fullData.length >= 3 &&
        fullData[0] === "\x1b" &&
        fullData[1] === "["
      ) {
        // Handle LEFT ARROW - go back (in detail view or clear search)
        if (fullData.length >= 3 && fullData[2] === "D") {
          escapeSequence = ""
          if (isDetailViewActive) {
            // Exit detail view
            isDetailViewActive = false
            detailViewData = null
            detailViewProjectId = null
            detailViewActionIndex = 0
            render()
            return
          } else if (!isSettingsMenuActive && searchQuery) {
            // Clear search filter
            searchQuery = ""
            projects = [...initialProjects]
            cursorIndex = 0
            startIndex = 0
            render()
            // Prefetch for restored project list
            prefetchVisibleProjects()
            return
          }
          return
        }

        // Handle RIGHT ARROW - enter detail view (only in project list)
        if (fullData.length >= 3 && fullData[2] === "C") {
          escapeSequence = ""
          if (
            !isDetailViewActive &&
            !isSettingsMenuActive &&
            projects.length > 0 &&
            cursorIndex < projects.length
          ) {
            // Enter detail view for project at cursor
            const projectId = projects[cursorIndex].value
            isDetailViewActive = true
            detailViewProjectId = projectId
            detailViewActionIndex = 0
            detailViewData = { domains: [], loading: true }
            render()

            // Check cache first, then fetch detail data asynchronously
            const cacheKey = `${CACHE_KEY_DETAIL_VIEW}${projectId}`
            const cachedData = getCached<{
              domains: VercelDomain[]
              commitMessage?: string
            }>(cacheKey)

            if (cachedData) {
              // Use cached data
              detailViewData = {
                domains: cachedData.domains,
                commitMessage: cachedData.commitMessage,
                loading: false,
              }
              render()
            } else if (fetchDetailData) {
              fetchDetailData(projectId)
                .then((data) => {
                  // Store in cache
                  setCache(cacheKey, data)
                  detailViewData = {
                    domains: data.domains,
                    commitMessage: data.commitMessage,
                    loading: false,
                  }
                  render()
                })
                .catch(() => {
                  detailViewData = { domains: [], loading: false }
                  render()
                })
            } else {
              // No fetch callback, just show basic info
              detailViewData = { domains: [], loading: false }
              render()
            }
            return
          }
          return
        }

        // Ignore other arrow keys when in menus/detail view
        if (isDetailViewActive || isSettingsMenuActive) {
          escapeSequence = ""
          return
        }

        // Check for Home: \x1b[H or \x1b[1~
        if (
          (fullData.length >= 3 && fullData[2] === "H") ||
          (fullData.length >= 5 && fullData[2] === "1" && fullData[3] === "~")
        ) {
          // Home - go back one full page
          escapeSequence = ""
          const prevStartIndex = startIndex
          startIndex = Math.max(0, startIndex - pageSize)
          cursorIndex = Math.min(startIndex + pageSize - 1, projects.length - 1)
          render()
          // Prefetch if page changed
          if (startIndex !== prevStartIndex) {
            prefetchVisibleProjects()
          }
          return
        }
        // Check for End: \x1b[F or \x1b[4~
        else if (
          (fullData.length >= 3 && fullData[2] === "F") ||
          (fullData.length >= 5 && fullData[2] === "4" && fullData[3] === "~")
        ) {
          // End - go forward one full page
          escapeSequence = ""
          const prevStartIndex = startIndex
          startIndex = Math.min(
            projects.length - pageSize,
            startIndex + pageSize
          )
          cursorIndex = Math.min(startIndex + pageSize - 1, projects.length - 1)
          render()
          // Prefetch if page changed
          if (startIndex !== prevStartIndex) {
            prefetchVisibleProjects()
          }
          return
        }
        // Check for UP arrow
        else if (fullData.length >= 3 && fullData[2] === "A") {
          // Up arrow - complete sequence
          escapeSequence = ""
          const prevStartIndex = startIndex
          cursorIndex = Math.max(0, cursorIndex - 1)
          if (cursorIndex < startIndex) {
            startIndex = Math.max(0, startIndex - pageSize)
          }
          render()
          // Prefetch if page changed
          if (startIndex !== prevStartIndex) {
            prefetchVisibleProjects()
          }
          return
        }
        // Check for DOWN arrow
        else if (fullData.length >= 3 && fullData[2] === "B") {
          // Down arrow - complete sequence
          escapeSequence = ""
          const prevStartIndex = startIndex
          cursorIndex = Math.min(projects.length - 1, cursorIndex + 1)
          if (cursorIndex >= startIndex + pageSize) {
            startIndex = Math.min(
              projects.length - pageSize,
              startIndex + pageSize
            )
          }
          render()
          // Prefetch if page changed
          if (startIndex !== prevStartIndex) {
            prefetchVisibleProjects()
          }
          return
        } else if (fullData.length === 2) {
          // Still building - have "\x1b[" but waiting for A/B/C/D/H/F/1/4
          escapeSequence = fullData
          return
        } else if (fullData.length >= 3 && fullData.length < 5) {
          // Could be building Home/End sequence (\x1b[1 or \x1b[4) - waiting for "~"
          if (fullData[2] === "1" || fullData[2] === "4") {
            escapeSequence = fullData
            return
          }
          // Invalid sequence, reset
          escapeSequence = ""
        } else {
          // Invalid sequence, reset
          escapeSequence = ""
        }
      } else if (fullData.length === 1 && fullData[0] === "\x1b") {
        // Just started escape sequence
        escapeSequence = fullData
        return
      } else if (escapeSequence.length > 0) {
        // Had escape sequence but this doesn't match, reset
        escapeSequence = ""
      }

      // Handle Ctrl+C - exit
      if (data === "\x03" || (data.length === 1 && data.charCodeAt(0) === 3)) {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        restoreScreen()
        process.stdout.write("\n")
        resolve({ projectIds: [], action: null })
        return
      }

      // Handle settings menu mode
      if (isSettingsMenuActive) {
        // Handle ESC to cancel
        if (data === "\x1b") {
          isSettingsMenuActive = false
          render()
          return
        }

        // Handle '1' to change team
        if (data === "1") {
          process.stdin.removeListener("data", handleData)
          process.stdin.setRawMode(wasRawMode || false)
          process.stdin.pause()
          clearScreen()
          restoreScreen()
          resolve({
            projectIds: [],
            action: "change-team",
          })
          return
        }

        // Ignore other keys in settings menu
        return
      }

      // Handle CTRL+R to refresh (\x12)
      if (data === "\x12" && !isDetailViewActive && !isSettingsMenuActive) {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        clearScreen()
        restoreScreen()
        // Invalidate all cached data
        invalidateCachePrefix("project-")
        invalidateCachePrefix("detail-view:")
        resolve({
          projectIds: [],
          action: "refresh",
        })
        return
      }

      // Handle CTRL+S to open settings menu (\x13)
      if (data === "\x13" && !isDetailViewActive) {
        isSettingsMenuActive = true
        render()
        return
      }

      // Handle ESC to go back or clear search filter
      if (data === "\x1b" && escapeSequence === "") {
        if (isDetailViewActive) {
          // Exit detail view
          isDetailViewActive = false
          detailViewData = null
          detailViewProjectId = null
          detailViewActionIndex = 0
          render()
          return
        } else if (!isSettingsMenuActive && searchQuery) {
          // Clear search filter
          searchQuery = ""
          projects = [...initialProjects]
          cursorIndex = 0
          startIndex = 0
          render()
          // Prefetch for restored project list
          prefetchVisibleProjects()
          return
        }
      }

      // Handle CTRL+D for delete (\x04) - immediately trigger if projects selected
      if (data === "\x04" && selected.size > 0) {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        clearScreen()
        restoreScreen()
        resolve({
          projectIds: Array.from(selected),
          action: "delete",
        })
        return
      }

      // Handle detail view mode
      if (isDetailViewActive) {
        // Handle ESC to go back
        if (data === "\x1b" && escapeSequence === "") {
          isDetailViewActive = false
          detailViewData = null
          detailViewProjectId = null
          detailViewActionIndex = 0
          render()
          return
        }

        // Handle TAB to cycle through actions (\x09)
        if (data === "\x09") {
          detailViewActionIndex = (detailViewActionIndex + 1) % 4
          render()
          return
        }

        // Handle SHIFT+TAB to cycle backwards (\x1b[Z)
        if (fullData === "\x1b[Z") {
          escapeSequence = ""
          detailViewActionIndex = (detailViewActionIndex - 1 + 4) % 4
          render()
          return
        }

        // Handle ENTER to execute highlighted action (open URL inline, stay in detail view)
        if (data === "\r" || data === "\n") {
          const projectId = detailViewProjectId
          if (!projectId || !scopeSlug) return

          // Get project name from metadata
          const projectMeta = allProjects.find((p) => p.id === projectId)
          const projectName = projectMeta?.name
          if (!projectName) return

          // Build URL based on selected action
          let urlSuffix = ""
          switch (detailViewActionIndex) {
            case 0: // Open project
              urlSuffix = ""
              break
            case 1: // Settings
              urlSuffix = "/settings"
              break
            case 2: // Deployments
              urlSuffix = "/deployments"
              break
            case 3: // Logs
              urlSuffix = "/logs"
              break
          }

          const url = `https://vercel.com/${scopeSlug}/${projectName}${urlSuffix}`

          // Open URL in background (don't await, stay in detail view)
          open(url).catch(() => {
            // Silently ignore errors opening URL
          })

          // Stay in detail view - don't resolve
          return
        }

        // Ignore other keys in detail view
        return
      }

      // Handle ENTER to toggle selection (\r or \n)
      if (data === "\r" || data === "\n") {
        if (projects.length > 0 && cursorIndex < projects.length) {
          const project = projects[cursorIndex]
          if (selected.has(project.value)) {
            selected.delete(project.value)
          } else {
            selected.add(project.value)
          }
          render()
        }
        return
      }

      // Handle CTRL+A to invert selection (\x01)
      if (data === "\x01") {
        projects.forEach((p) => {
          if (selected.has(p.value)) {
            selected.delete(p.value)
          } else {
            selected.add(p.value)
          }
        })
        render()
        return
      }

      // Handle backspace/delete for search query
      if (
        data === "\x7f" ||
        data === "\b" ||
        (data.length === 1 && data.charCodeAt(0) === 127)
      ) {
        if (searchQuery.length > 0) {
          searchQuery = searchQuery.slice(0, -1)
          applySearchFilter()
        }
        return
      }

      // Handle printable character input for search (search-first interaction)
      // Only handle if not a control character and not part of an escape sequence
      if (
        data.length === 1 &&
        data.charCodeAt(0) >= 32 &&
        data.charCodeAt(0) <= 126 &&
        escapeSequence === ""
      ) {
        searchQuery += data
        applySearchFilter()
        return
      }

      // Reset escape sequence if not part of one (and not already handled)
      if (escapeSequence.length > 0 && !escapeSequence.startsWith("\x1b")) {
        escapeSequence = ""
      }
    }

    // Set up data listener for raw stdin
    process.stdin.on("data", handleData)

    // Initial render
    render()

    // Cleanup on error
    process.stdin.on("error", (err) => {
      process.stdin.removeListener("data", handleData)
      process.stdin.setRawMode(wasRawMode || false)
      process.stdin.pause()
      restoreScreen()
      reject(err)
    })
  })
}

/**
 * Prompt user to select multiple projects (for deletion)
 */
export async function promptProjectsMultiSelect(
  projects: ProjectOption[]
): Promise<string[]> {
  const selected = await checkbox({
    message: "Select projects to delete (space to select, enter to confirm):",
    choices: projects.map((p) => ({
      name: p.name,
      value: p.value,
      description: p.description,
    })),
  })

  return selected
}

/**
 * Confirm a destructive action with yes/no
 */
export async function confirmAction(
  message: string,
  defaultValue: boolean = false
): Promise<boolean> {
  return confirm({
    message,
    default: defaultValue,
  })
}
