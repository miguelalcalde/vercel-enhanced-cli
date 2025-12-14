import { select, confirm, checkbox } from "@inquirer/prompts"
import chalk from "chalk"
import * as readline from "readline"
import { ProjectWithMetadata } from "./renderProjects.js"

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
  process.stdout.write("\x1b[2J\x1b[H")

  const currentTeamName =
    currentTeamId === null
      ? "Personal"
      : teams.find((t) => t.value === currentTeamId)?.name || "Unknown"

  console.log(chalk.bold.cyan("Settings\n"))
  console.log(chalk.gray("-".repeat(100)))
  console.log(chalk.cyan("  t") + " - Change team (Current: " + chalk.bold(currentTeamName) + ")")
  console.log(chalk.gray("  ESC - Back to projects\n"))
  console.log(chalk.gray("-".repeat(100)))

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
        if (fullData.length >= 3 && (fullData[2] === "A" || fullData[2] === "B")) {
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
        process.stdout.write("\n")
        resolve(undefined) // Cancelled
        return
      }

      // Handle ESC to go back
      if (data === "\x1b" && escapeSequence === "") {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
        resolve(undefined) // Back to projects
        return
      }

      // Handle 't' to change team
      if (data === "t") {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
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
  // #region agent log
  fetch("http://127.0.0.1:7246/ingest/ba828ae7-af47-494c-9b58-d505a8984231", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "prompts.ts:58",
      message: "promptProjectsWithActions called",
      data: { projectsCount: projects.length, pageSize },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run2",
      hypothesisId: "A,B",
    }),
  }).catch(() => {})
  // #endregion

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

    // Ensure raw mode
    if (!wasRawMode) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    const render = () => {
      // Clear screen and move cursor to top
      process.stdout.write("\x1b[2J\x1b[H")
      process.stdout.write(chalk.gray("-".repeat(100)) + "\n")
      // Add table headers
      process.stdout.write(
        chalk.gray(
          "    " +
            "Name".padEnd(35) +
            "Created".padEnd(10) +
            "Updated".padEnd(10) +
            "Last Deploy".padEnd(20) +
            "Deploy Creator".padEnd(15) +
            "\n"
        )
      )
      process.stdout.write(chalk.gray("-".repeat(100)) + "\n")

      const endIndex = Math.min(startIndex + pageSize, projects.length)
      const visibleProjects = projects.slice(startIndex, endIndex)

      for (let i = 0; i < visibleProjects.length; i++) {
        const projectIndex = startIndex + i
        const project = projects[projectIndex]
        const isSelected = selected.has(project.value)
        const isCursor = projectIndex === cursorIndex

        const prefix = isCursor ? chalk.cyan("> ") : "  "
        const checkbox = isSelected ? chalk.green("◉") : "○"
        const name = isCursor
          ? chalk.cyan(project.name)
          : isSelected
          ? chalk.bold(project.name)
          : project.name

        process.stdout.write(`${prefix}${checkbox} ${name}\n`)
      }

      if (projects.length > pageSize) {
        process.stdout.write(
          chalk.gray(
            `\nPage ${Math.floor(startIndex / pageSize) + 1} of ${Math.ceil(
              projects.length / pageSize
            )}\n`
          )
        )
      }

      if (selected.size > 0) {
        process.stdout.write(
          chalk.green(`\n${selected.size} project(s) selected\n`)
        )
      }

      // Footer with navigation hints
      process.stdout.write(
        chalk.gray(
          "\n↑↓ navigate  space select  a all  i invert  d delete  o open\n"
        )
      )
    }

    const handleData = (chunk: Buffer) => {
      const data = chunk.toString("utf8")
      // #region agent log
      fetch(
        "http://127.0.0.1:7246/ingest/ba828ae7-af47-494c-9b58-d505a8984231",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "prompts.ts:156",
            message: "stdin data received",
            data: {
              data,
              length: data.length,
              firstChar: data[0],
              charCode: data.charCodeAt(0),
              selectedCount: selected.size,
              escapeSequence,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run3",
            hypothesisId: "A",
          }),
        }
      ).catch(() => {})
      // #endregion

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
        // #region agent log
        fetch(
          "http://127.0.0.1:7246/ingest/ba828ae7-af47-494c-9b58-d505a8984231",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "prompts.ts:220",
              message: "d keypress - triggering delete immediately",
              data: { selectedCount: selected.size },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run3",
              hypothesisId: "A",
            }),
          }
        ).catch(() => {})
        // #endregion
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
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

        // #region agent log
        fetch(
          "http://127.0.0.1:7246/ingest/ba828ae7-af47-494c-9b58-d505a8984231",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "prompts.ts:240",
              message: "o keypress - triggering open immediately",
              data: {
                selectedCount: selected.size,
                usingCursor: selected.size === 0,
                projectToOpen,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run3",
              hypothesisId: "A",
            }),
          }
        ).catch(() => {})
        // #endregion
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
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
 * @returns Selected project IDs and action to perform
 */
export async function promptProjectsWithDynamicUpdates(
  initialProjects: ProjectOption[],
  pageSize: number = 10,
  onUpdate: (callback: (projects: ProjectOption[]) => void) => void,
  allProjectsWithMetadata?: ProjectWithMetadata[],
  formatProjectOptionFn?: (project: ProjectWithMetadata) => string,
  teams?: TeamOption[],
  currentTeamId?: string | null
): Promise<{
  projectIds: string[]
  action:
    | "open"
    | "open-settings"
    | "open-deployments"
    | "open-logs"
    | "delete"
    | "edit"
    | "change-team"
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

    // Search state
    let isSearching = false
    let searchQuery = "" // Current input while searching
    let activeFilterQuery = "" // Applied filter (persists after Enter)
    const allProjects = allProjectsWithMetadata || []
    const formatProject =
      formatProjectOptionFn || ((p: ProjectWithMetadata) => p.name)

    // Open menu state
    let isOpenMenuActive = false

    // Settings menu state
    let isSettingsMenuActive = false

    // Ensure raw mode
    if (!wasRawMode) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    const render = () => {
      // Clear screen and move cursor to top
      process.stdout.write("\x1b[2J\x1b[H")

      // Show settings menu if active
      if (isSettingsMenuActive) {
        const currentTeamName =
          currentTeamId === null || currentTeamId === undefined
            ? "Personal"
            : teams?.find((t) => t.value === currentTeamId)?.name || "Unknown"
        process.stdout.write(chalk.bold.cyan("Settings\n"))
        process.stdout.write(chalk.gray("-".repeat(100)) + "\n")
        process.stdout.write(
          chalk.cyan("  1") +
            " - Change team (Current: " +
            chalk.bold(currentTeamName) +
            ")\n"
        )
        process.stdout.write(chalk.gray("  ESC - Back to projects\n"))
        process.stdout.write(chalk.gray("-".repeat(100)) + "\n")
        return
      }

      // Show open menu if active
      if (isOpenMenuActive) {
        const selectedProjectName =
          selected.size > 0
            ? projects.find((p) => selected.has(p.value))?.description ||
              "selected project(s)"
            : projects.length > 0
            ? projects[cursorIndex].description || "project"
            : "project"
        process.stdout.write(
          chalk.bold.cyan(`Open menu for: ${selectedProjectName}\n`)
        )
        process.stdout.write(chalk.gray("-".repeat(100)) + "\n")
        process.stdout.write(chalk.cyan("  1") + " - Open project\n")
        process.stdout.write(chalk.cyan("  2") + " - Open settings\n")
        process.stdout.write(chalk.cyan("  3") + " - Open deployments\n")
        process.stdout.write(chalk.cyan("  4") + " - Open logs\n")
        process.stdout.write(chalk.gray("  ESC - Cancel\n"))
        process.stdout.write(chalk.gray("-".repeat(100)) + "\n")
        return
      }

      // Show search input if in search mode
      if (isSearching) {
        process.stdout.write(
          chalk.bold.cyan(`Search: ${searchQuery}${chalk.inverse(" ")}\n`)
        )
        process.stdout.write(
          chalk.gray("Type to search, Enter to apply, ESC to clear\n")
        )
        process.stdout.write(chalk.gray("-".repeat(100)) + "\n")
      } else {
        if (activeFilterQuery) {
          process.stdout.write(
            chalk.blue(
              `Filter active: "${activeFilterQuery}" (${
                projects.length
              } match${
                projects.length !== 1 ? "es" : ""
              }) - Press ESC to clear\n`
            )
          )
        }
        process.stdout.write(chalk.gray("-".repeat(100)) + "\n")
      }
      // Add table headers
      process.stdout.write(
        chalk.gray(
          "    " +
            "Name".padEnd(35) +
            "Created".padEnd(10) +
            "Updated".padEnd(10) +
            "Last Deploy".padEnd(20) +
            "Deploy Creator".padEnd(15) +
            "\n"
        )
      )
      process.stdout.write(chalk.gray("-".repeat(100)) + "\n")

      const endIndex = Math.min(startIndex + pageSize, projects.length)
      const visibleProjects = projects.slice(startIndex, endIndex)

      for (let i = 0; i < visibleProjects.length; i++) {
        const projectIndex = startIndex + i
        const project = projects[projectIndex]
        const isSelected = selected.has(project.value)
        const isCursor = projectIndex === cursorIndex

        const prefix = isCursor ? chalk.cyan("> ") : "  "
        const checkbox = isSelected ? chalk.green("◉") : "○"
        const name = isCursor
          ? chalk.cyan(project.name)
          : isSelected
          ? chalk.bold(project.name)
          : project.name

        process.stdout.write(`${prefix}${checkbox} ${name}\n`)
      }

      if (projects.length > pageSize) {
        process.stdout.write(
          chalk.gray(
            `\nPage ${Math.floor(startIndex / pageSize) + 1} of ${Math.ceil(
              projects.length / pageSize
            )}\n`
          )
        )
      }

      if (selected.size > 0) {
        process.stdout.write(
          chalk.green(`\n${selected.size} project(s) selected\n`)
        )
      }

      // Show search status (only when actively searching, not when filter is applied)
      if (isSearching && searchQuery.trim()) {
        process.stdout.write(
          chalk.blue(
            `\nSearching for: "${searchQuery}" (${projects.length} match${
              projects.length !== 1 ? "es" : ""
            })\n`
          )
        )
      }

      // Footer with navigation hints
      process.stdout.write(
        chalk.gray(
          "\n↑↓ navigate  space select  a all  i invert  d delete  o open  e edit  s search  t settings\n"
        )
      )
    }

    /**
     * Filter projects based on search query
     */
    const filterProjects = (query: string): ProjectOption[] => {
      // Use activeFilterQuery if no query provided (when filter is applied)
      const filterToUse = query || activeFilterQuery
      if (!filterToUse.trim() || allProjects.length === 0) {
        return initialProjects
      }

      const searchTerm = filterToUse.toLowerCase().trim()
      const filtered = allProjects.filter((project) => {
        // Search by project name
        const nameMatch = project.name.toLowerCase().includes(searchTerm)

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

        return nameMatch || creatorMatch
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
      // Don't update if we're in search mode or have an active filter (search filtering takes precedence)
      if (isSearching || activeFilterQuery) {
        return
      }

      // Preserve cursor position relative to project ID if possible
      const currentProjectId =
        projects.length > 0 && cursorIndex < projects.length
          ? projects[cursorIndex].value
          : null

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
    }

    /**
     * Apply search filter and update displayed projects
     */
    const applySearchFilter = () => {
      // Use searchQuery if actively searching, otherwise use activeFilterQuery
      const queryToUse = isSearching ? searchQuery : activeFilterQuery
      const filtered = filterProjects(queryToUse)

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
    }

    // Register the update callback
    onUpdate(updateProjects)

    const handleData = (chunk: Buffer) => {
      const data = chunk.toString("utf8")

      // Combine with any existing escape sequence
      const fullData = escapeSequence + data

      // Check for complete arrow key sequences (ignore when menus are active)
      if (
        !isOpenMenuActive &&
        !isSettingsMenuActive &&
        fullData.length >= 3 &&
        fullData[0] === "\x1b" &&
        fullData[1] === "["
      ) {
        // Check for Home: \x1b[H or \x1b[1~
        if (
          (fullData.length >= 3 && fullData[2] === "H") ||
          (fullData.length >= 5 && fullData[2] === "1" && fullData[3] === "~")
        ) {
          // Home - go back one full page
          escapeSequence = ""
          startIndex = Math.max(0, startIndex - pageSize)
          cursorIndex = Math.min(startIndex + pageSize - 1, projects.length - 1)
          render()
          return
        }
        // Check for End: \x1b[F or \x1b[4~
        else if (
          (fullData.length >= 3 && fullData[2] === "F") ||
          (fullData.length >= 5 && fullData[2] === "4" && fullData[3] === "~")
        ) {
          // End - go forward one full page
          escapeSequence = ""
          startIndex = Math.min(
            projects.length - pageSize,
            startIndex + pageSize
          )
          cursorIndex = Math.min(startIndex + pageSize - 1, projects.length - 1)
          render()
          return
        }
        // Check for arrow keys
        else if (fullData.length >= 3 && fullData[2] === "A") {
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
          // Still building - have "\x1b[" but waiting for A/B/H/F/1/4
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
      } else if (
        !isOpenMenuActive &&
        !isSettingsMenuActive &&
        fullData.length === 1 &&
        fullData[0] === "\x1b"
      ) {
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

      // Handle search mode
      if (isSearching) {
        // Handle Escape to clear search completely
        if (data === "\x1b") {
          isSearching = false
          searchQuery = ""
          activeFilterQuery = ""
          // Restore full project list
          projects = [...initialProjects]
          cursorIndex = 0
          startIndex = 0
          render()
          return
        }

        // Handle Enter to apply search (keep filter active, exit input mode)
        if (data === "\r" || data === "\n") {
          activeFilterQuery = searchQuery.trim()
          isSearching = false
          // Apply the filter one more time to ensure it's set correctly
          applySearchFilter()
          return
        }

        // Handle backspace/delete
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

        // Handle regular character input (printable ASCII)
        if (
          data.length === 1 &&
          data.charCodeAt(0) >= 32 &&
          data.charCodeAt(0) <= 126
        ) {
          searchQuery += data
          applySearchFilter()
          return
        }

        // Ignore other keys in search mode
        return
      }

      // Handle 's' to enter search mode (only if search is supported)
      if (data === "s" && allProjects.length > 0 && formatProjectOptionFn) {
        isSearching = true
        // Pre-fill with active filter if one exists
        searchQuery = activeFilterQuery
        render()
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
          process.stdout.write("\x1b[2J\x1b[H")
          resolve({
            projectIds: [],
            action: "change-team",
          })
          return
        }

        // Ignore other keys in settings menu
        return
      }

      // Handle 't' to open settings menu
      if (data === "t" && !isSearching && !isOpenMenuActive) {
        isSettingsMenuActive = true
        render()
        return
      }

      // Handle ESC to clear active filter (when not in search mode, menus, and not part of arrow key sequence)
      if (
        data === "\x1b" &&
        !isSearching &&
        !isOpenMenuActive &&
        !isSettingsMenuActive &&
        activeFilterQuery &&
        escapeSequence === ""
      ) {
        activeFilterQuery = ""
        // Restore full project list
        projects = [...initialProjects]
        cursorIndex = 0
        startIndex = 0
        render()
        return
      }

      // Handle 'd' for delete - immediately trigger if projects selected
      if (data === "d" && selected.size > 0) {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
        resolve({
          projectIds: Array.from(selected),
          action: "delete",
        })
        return
      }

      // Handle 'e' for edit/view details - requires single selection
      if (data === "e") {
        const projectToEdit =
          selected.size === 1
            ? Array.from(selected)[0]
            : selected.size === 0 && projects.length > 0
            ? projects[cursorIndex].value
            : null

        if (projectToEdit) {
          process.stdin.removeListener("data", handleData)
          process.stdin.setRawMode(wasRawMode || false)
          process.stdin.pause()
          process.stdout.write("\x1b[2J\x1b[H")
          resolve({
            projectIds: [projectToEdit],
            action: "edit",
          })
          return
        } else if (selected.size > 1) {
          // Show message that only one project can be selected for edit
          // We'll show this by briefly rendering a message, but for now just proceed
          // The projects.ts handler will show the error message
          process.stdin.removeListener("data", handleData)
          process.stdin.setRawMode(wasRawMode || false)
          process.stdin.pause()
          process.stdout.write("\x1b[2J\x1b[H")
          resolve({
            projectIds: Array.from(selected),
            action: "edit",
          })
          return
        }
        // If no project available, ignore the keypress
        return
      }

      // Handle open menu mode
      if (isOpenMenuActive) {
        // Handle ESC to cancel
        if (data === "\x1b") {
          isOpenMenuActive = false
          render()
          return
        }

        // Handle action keys
        const projectToOpen =
          selected.size > 0
            ? Array.from(selected)
            : projects.length > 0
            ? [projects[cursorIndex].value]
            : []

        let action:
          | "open"
          | "open-settings"
          | "open-deployments"
          | "open-logs"
          | null = null

        if (data === "1") {
          action = "open"
        } else if (data === "2") {
          action = "open-settings"
        } else if (data === "3") {
          action = "open-deployments"
        } else if (data === "4") {
          action = "open-logs"
        } else {
          // Invalid key, ignore
          return
        }

        // Resolve with the selected action
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
        resolve({
          projectIds: projectToOpen,
          action,
        })
        return
      }

      // Handle 'o' to open projects
      if (data === "o") {
        // If multiple projects are selected, open them all directly
        if (selected.size > 1) {
          process.stdin.removeListener("data", handleData)
          process.stdin.setRawMode(wasRawMode || false)
          process.stdin.pause()
          process.stdout.write("\x1b[2J\x1b[H")
          resolve({
            projectIds: Array.from(selected),
            action: "open",
          })
          return
        }
        // Otherwise, show open menu for single selection or cursor position
        isOpenMenuActive = true
        render()
        return
      }

      // Handle space to toggle selection
      if (data === " ") {
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
