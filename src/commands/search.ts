import { requireVercelToken } from "../auth/vercelCliAuth.js"
import { VercelApi, VercelDeployment } from "../api/vercelApi.js"
import { confirmAction, ProjectOption } from "../ui/prompts.js"
import {
  formatProjectOption,
  ProjectWithMetadata,
  renderProjectsHeader,
} from "../ui/renderProjects.js"
import { logError, getErrorLogPath } from "../utils/errorLogger.js"
import chalk from "chalk"
import open from "open"

/**
 * Search command - search projects by name and creator name
 * @param query - Search query string
 * @param providedToken - Optional token provided via CLI flag
 */
export async function searchCommand(
  query: string,
  providedToken?: string
) {
  try {
    if (!query || query.trim().length === 0) {
      console.log(chalk.red("Error: Search query is required"))
      console.log(chalk.yellow("Usage: vercli search <query>"))
      process.exit(1)
    }

    const searchTerm = query.trim().toLowerCase()

    // Step 1: Load authentication token
    console.log(chalk.blue("🔐 Checking authentication..."))
    const token = requireVercelToken(providedToken)
    const api = new VercelApi(token)

    // Step 2: Fetch user info and teams for scope detection
    console.log(chalk.blue("📋 Fetching user information..."))
    const user = await api.getCurrentUser()
    const teams = await api.listTeams()
    const teamsMap = new Map(teams.map((t) => [t.id, t]))

    // Step 3: Fetch projects (token scope determines which projects are shown)
    console.log(chalk.blue("📦 Fetching projects..."))
    let projects = await api.listProjects(null)

    if (projects.length === 0) {
      console.log(chalk.yellow("No projects found."))
      return
    }

    // Determine scope from projects (check accountId against teams)
    let scopeSlug: string = user.username
    let scopeTeamId: string | null = null
    let scopeName: string = "Personal"

    // Check if projects belong to a team
    if (projects.length > 0 && projects[0].accountId) {
      const matchingTeam = teams.find((t) => t.id === projects[0].accountId)
      if (matchingTeam) {
        scopeSlug = matchingTeam.slug
        scopeTeamId = matchingTeam.id
        scopeName = matchingTeam.name
      }
    }

    console.log(chalk.green(`✓ Using scope: ${scopeName}\n`))

    // Step 4: Fetch deployments for all projects to get creator info
    console.log(chalk.blue("🔍 Fetching deployment information..."))
    const projectsWithMetadata: ProjectWithMetadata[] = projects.map(
      (project) => ({
        ...project,
        lastDeployment: null,
        deploymentLoading: true,
      })
    )

    // Fetch deployments for all projects in parallel (limit to 1 per project for efficiency)
    await Promise.all(
      projects.map(async (project, index) => {
        try {
          const projectDeployments = await api.listDeployments({
            teamId: scopeTeamId,
            projectId: project.id,
            limit: 1,
          })

          projectsWithMetadata[index] = {
            ...projectsWithMetadata[index],
            lastDeployment: projectDeployments[0] || null,
            deploymentLoading: false,
          }
        } catch (error) {
          // Mark as not loading even on error
          projectsWithMetadata[index].deploymentLoading = false

          // Only log non-404 errors (404 is expected for projects without deployments)
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          if (
            !errorMessage.includes("404") &&
            !errorMessage.includes("Not Found")
          ) {
            logError(
              error instanceof Error ? error : new Error(errorMessage),
              {
                operation: "fetchDeployments",
                projectId: project.id,
                teamId: scopeTeamId,
              }
            )
          }
        }
      })
    )

    // Step 5: Filter projects by search term
    const filteredProjects = projectsWithMetadata.filter((project) => {
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

    if (filteredProjects.length === 0) {
      console.log(
        chalk.yellow(
          `\nNo projects found matching "${query}" (searched by name and creator).\n`
        )
      )
      return
    }

    // Sort filtered projects by last updated (newest first)
    filteredProjects.sort((a, b) => b.updatedAt - a.updatedAt)

    // Step 6: Display results
    console.log(
      chalk.green(
        `\n✓ Found ${filteredProjects.length} project(s) matching "${query}":\n`
      )
    )
    renderProjectsHeader()
    filteredProjects.forEach((project) => {
      console.log(formatProjectOption(project))
    })
    console.log()

    // Step 7: Allow user to interact with results
    const { promptProjectsWithDynamicUpdates } = await import(
      "../ui/prompts.js"
    )

    const projectOptions: ProjectOption[] = filteredProjects.map(
      (project) => ({
        name: formatProjectOption(project),
        value: project.id,
        description: project.name,
      })
    )

    // Create a dummy update callback (not needed for search since we fetch all data upfront)
    const registerUpdateCallback = (
      callback: (projects: ProjectOption[]) => void
    ) => {
      // No-op: we don't need dynamic updates since all data is already loaded
    }

    const { projectIds, action } = await promptProjectsWithDynamicUpdates(
      projectOptions,
      10,
      registerUpdateCallback
    )

    if (projectIds.length === 0 || !action) {
      // Exit gracefully
      return
    }

    if (
      action === "open" ||
      action === "open-settings" ||
      action === "open-deployments" ||
      action === "open-logs"
    ) {
      await handleOpenActionFromSelection(
        filteredProjects,
        projectIds,
        scopeSlug,
        action
      )
    } else if (action === "delete") {
      const result = await handleDeleteActionFromSelection(
        filteredProjects,
        projectIds,
        api,
        scopeTeamId,
        scopeName
      )
      if (result.deletedCount > 0) {
        console.log(
          chalk.green(
            `\n✓ Deleted ${result.deletedCount} project(s). Run search again to refresh results.`
          )
        )
      }
    }
  } catch (error) {
    // Log error to file
    logError(error instanceof Error ? error : new Error(String(error)), {
      operation: "searchCommand",
    })

    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`))
    } else {
      console.error(chalk.red(`\n❌ Unexpected error: ${error}`))
    }
    console.error(
      chalk.yellow(`\nError details logged to: ${getErrorLogPath()}`)
    )
    process.exit(1)
  }
}

/**
 * Handle opening selected projects in the browser
 * @param action - The type of page to open: "open", "open-settings", "open-deployments", or "open-logs"
 */
async function handleOpenActionFromSelection(
  projects: ProjectWithMetadata[],
  projectIds: string[],
  scopeSlug: string,
  action: "open" | "open-settings" | "open-deployments" | "open-logs" = "open"
) {
  const selectedProjects = projects.filter((p) => projectIds.includes(p.id))

  if (selectedProjects.length === 0) {
    console.log(chalk.red("No projects selected."))
    return
  }

  // Determine URL suffix based on action
  let urlSuffix = ""
  let actionName = "project"
  switch (action) {
    case "open":
      urlSuffix = ""
      actionName = "project"
      break
    case "open-settings":
      urlSuffix = "/settings"
      actionName = "settings"
      break
    case "open-deployments":
      urlSuffix = "/deployments"
      actionName = "deployments"
      break
    case "open-logs":
      urlSuffix = "/logs"
      actionName = "logs"
      break
  }

  // Open each selected project using the correct scope slug
  for (const project of selectedProjects) {
    try {
      const projectUrl = `https://vercel.com/${scopeSlug}/${project.name}${urlSuffix}`
      console.log(chalk.blue(`\n🌐 Opening ${project.name} ${actionName}...`))
      await open(projectUrl)
      console.log(chalk.green(`✓ Opened ${projectUrl}`))
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      console.log(
        chalk.red(`✗ Failed to open ${project.name} ${actionName}: ${errorMessage}`)
      )

      // Log error to file
      logError(error instanceof Error ? error : new Error(errorMessage), {
        operation: `openProject${actionName}`,
        projectName: project.name,
        projectId: project.id,
        scopeSlug: scopeSlug,
        action: action,
      })
    }
  }
}

/**
 * Handle deleting selected projects
 */
async function handleDeleteActionFromSelection(
  projects: ProjectWithMetadata[],
  projectIds: string[],
  api: VercelApi,
  teamId: string | null,
  teamName: string
): Promise<{ deletedCount: number; cancelled: boolean }> {
  const selectedProjects = projects.filter((p) => projectIds.includes(p.id))

  if (selectedProjects.length === 0) {
    console.log(chalk.yellow("No projects selected."))
    return { deletedCount: 0, cancelled: false }
  }

  // Show confirmation
  const projectNames = selectedProjects.map((p) => p.name).join(", ")
  const confirmMessage = `Are you sure you want to delete ${selectedProjects.length} project(s)?\n  ${projectNames}`

  const confirmed = await confirmAction(confirmMessage, false)

  if (!confirmed) {
    console.log(chalk.yellow("Deletion cancelled."))
    return { deletedCount: 0, cancelled: true }
  }

  // Delete projects with progress
  console.log(
    chalk.blue(`\n🗑️  Deleting ${selectedProjects.length} project(s)...\n`)
  )

  const results: {
    success: string[]
    failed: Array<{ name: string; error: string }>
  } = {
    success: [],
    failed: [],
  }

  for (const project of selectedProjects) {
    try {
      await api.deleteProject(project.id, teamId)
      results.success.push(project.name)
      console.log(chalk.green(`✓ Deleted ${project.name}`))
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      results.failed.push({ name: project.name, error: errorMessage })
      console.log(
        chalk.red(`✗ Failed to delete ${project.name}: ${errorMessage}`)
      )

      // Log error to file
      logError(error instanceof Error ? error : new Error(errorMessage), {
        operation: "deleteProject",
        projectName: project.name,
        projectId: project.id,
        teamId: teamId,
        teamName: teamName,
      })
    }
  }

  // Summary
  console.log(chalk.blue("\n📊 Summary:"))
  console.log(
    chalk.green(`  ✓ Successfully deleted: ${results.success.length}`)
  )
  if (results.failed.length > 0) {
    console.log(chalk.red(`  ✗ Failed: ${results.failed.length}`))
    results.failed.forEach(({ name, error }) => {
      console.log(chalk.red(`    - ${name}: ${error}`))
    })
    console.log(
      chalk.yellow(`\n⚠️  Errors have been logged to: ${getErrorLogPath()}`)
    )
  }

  return { deletedCount: results.success.length, cancelled: false }
}
