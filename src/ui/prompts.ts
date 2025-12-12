import { select, confirm, checkbox } from "@inquirer/prompts"
import chalk from "chalk"

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
 * Prompt user to select projects with action shortcuts (d delete, o open)
 * Returns the selected project IDs and the action to perform
 * @param pageSize - Number of projects to show per page (default: 10)
 */
export async function promptProjectsWithActions(
  projects: ProjectOption[],
  pageSize: number = 10
): Promise<{ projectIds: string[]; action: "open" | "delete" | null }> {
  const selected = await checkbox({
    message: "Select projects (space to select, enter to confirm):",
    choices: projects.map((p) => ({
      name: p.name,
      value: p.value,
      description: p.description,
    })),
    pageSize,
    instructions:
      chalk.gray("↑↓ navigate  space select  a all  i invert  ↵ submit") +
      "\n" +
      chalk.gray("d delete  o open"),
  })

  // After selection, prompt for action if projects were selected
  if (selected.length === 0) {
    return { projectIds: [], action: null }
  }

  // For single selection, default to open; for multiple, default to delete
  const defaultAction = selected.length === 1 ? "open" : "delete"

  // Show quick action selection
  const { select: selectAction } = await import("@inquirer/prompts")
  const action = await selectAction({
    message: `Action for ${selected.length} selected project(s):`,
    choices: [
      { name: "Open project(s)", value: "open" },
      { name: "Delete project(s)", value: "delete" },
    ],
    default: defaultAction,
  })

  return { projectIds: selected, action: action as "open" | "delete" }
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
