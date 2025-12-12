import { select, confirm, checkbox } from "@inquirer/prompts"
import chalk from "chalk"
import * as readline from "readline"

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
): Promise<{ projectIds: string[]; action: "open" | "delete" | null }> {
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
      process.stdout.write(
        chalk.bold("Select projects (space to select, d delete, o open):\n")
      )
      process.stdout.write(
        chalk.gray(
          "↑↓ navigate  space select  a all  i invert  d delete  o open\n"
        )
      )
      process.stdout.write(chalk.gray("-".repeat(60)) + "\n")

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
