import {
  requireVercelToken,
  readCurrentTeam,
  writeCurrentTeam,
} from "../auth/vercelCliAuth.js"
import { VercelApi, VercelDeployment, VercelTeam } from "../api/vercelApi.js"
import {
  confirmAction,
  ProjectOption,
  promptTeam,
  TeamOption,
  promptProjectsWithDynamicUpdates,
  FetchDetailDataCallback,
} from "../ui/prompts.js"
import {
  formatProjectOption,
  ProjectWithMetadata,
} from "../ui/renderProjects.js"
import { logError, getErrorLogPath } from "../utils/errorLogger.js"
import { invalidateCachePrefix } from "../utils/cache.js"
import { showProjectDetails } from "./projectDetails.js"
import chalk from "chalk"
import open from "open"

/**
 * Main projects command wizard
 * @param providedToken - Optional token provided via CLI flag
 */
export async function projectsCommand(providedToken?: string) {
  try {
    // Step 1: Load authentication token
    console.log(chalk.blue("🔐 Checking authentication..."))
    const token = requireVercelToken(providedToken)
    const api = new VercelApi(token)

    // Step 2: Fetch user info and teams
    console.log(chalk.blue("📋 Fetching user information..."))
    const user = await api.getCurrentUser()
    const teams = await api.listTeams()
    const teamsMap = new Map(teams.map((t) => [t.id, t]))

    // Step 3: Get or select current team
    let currentTeamId: string | null = readCurrentTeam()

    // If no team is set, prompt user to select one
    if (currentTeamId === undefined) {
      console.log(chalk.blue("👥 No team selected. Please choose a team:\n"))
      const teamOptions: TeamOption[] = teams.map((team) => ({
        name: team.name,
        value: team.id,
      }))
      currentTeamId = await promptTeam(teamOptions)
      writeCurrentTeam(currentTeamId)
      console.log() // Add spacing
    } else if (currentTeamId !== null) {
      // Validate that the saved team still exists
      const teamExists = teams.some((t) => t.id === currentTeamId)
      if (!teamExists) {
        console.log(
          chalk.yellow(
            `⚠️  Saved team (${currentTeamId}) not found. Please select a team:\n`
          )
        )
        const teamOptions: TeamOption[] = teams.map((team) => ({
          name: team.name,
          value: team.id,
        }))
        currentTeamId = await promptTeam(teamOptions)
        writeCurrentTeam(currentTeamId)
        console.log() // Add spacing
      }
    }

    // Step 4: Determine scope information
    let scopeSlug: string = user.username
    let scopeTeamId: string | null = currentTeamId
    let scopeName: string = "Personal"

    if (currentTeamId !== null) {
      const selectedTeam = teams.find((t) => t.id === currentTeamId)
      if (selectedTeam) {
        scopeSlug = selectedTeam.slug
        scopeName = selectedTeam.name
      }
    }

    console.log(chalk.green(`✓ Using scope: ${scopeName}\n`))

    // Step 5: Fetch projects for the selected team
    console.log(chalk.blue("📦 Fetching projects..."))
    let projects = await api.listProjects(scopeTeamId)

    if (projects.length === 0) {
      console.log(chalk.yellow("No projects found."))
      return
    }

    // Sort projects by last updated (newest first)
    projects.sort((a, b) => b.updatedAt - a.updatedAt)

    const pageSize = 10

    // Main loop - return to selection after actions
    let continueLoop = true
    while (continueLoop) {
      // Initialize all projects with loading state
      let projectsWithMetadata: ProjectWithMetadata[] = projects.map(
        (project) => ({
          ...project,
          lastDeployment: null,
          deploymentLoading: true,
        })
      )

      // Create update callback
      let updateCallback: ((projects: ProjectOption[]) => void) | null = null

      const registerUpdateCallback = (
        callback: (projects: ProjectOption[]) => void
      ) => {
        updateCallback = callback
      }

      /**
       * Fetch deployments for a specific page of projects
       * Triggers UI updates when deployment data arrives
       */
      async function fetchDeploymentsForPage(
        pageProjects: typeof projects,
        pageNum: number
      ): Promise<void> {
        const pageStart = pageNum * pageSize
        const pageEnd = Math.min(pageStart + pageSize, projects.length)
        const pageProjectIds = projects
          .slice(pageStart, pageEnd)
          .map((p) => p.id)

        // Fetch deployments for this page in parallel
        await Promise.all(
          pageProjectIds.map(async (projectId) => {
            try {
              const projectDeployments = await api.listDeployments({
                teamId: scopeTeamId,
                projectId,
                limit: 1,
              })

              // Update the specific project
              const projectIndex = projectsWithMetadata.findIndex(
                (p) => p.id === projectId
              )
              if (projectIndex !== -1) {
                projectsWithMetadata[projectIndex] = {
                  ...projectsWithMetadata[projectIndex],
                  lastDeployment: projectDeployments[0] || null,
                  deploymentLoading: false,
                }

                // Trigger UI update if callback is registered
                if (updateCallback) {
                  const updatedOptions = projectsWithMetadata.map(
                    (project) => ({
                      name: formatProjectOption(project),
                      value: project.id,
                      description: project.name,
                    })
                  )
                  updateCallback(updatedOptions)
                }
              }
            } catch (error) {
              // Mark as not loading even on error
              const projectIndex = projectsWithMetadata.findIndex(
                (p) => p.id === projectId
              )
              if (projectIndex !== -1) {
                projectsWithMetadata[projectIndex].deploymentLoading = false

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
                      projectId: projectId,
                      teamId: scopeTeamId,
                    }
                  )
                }

                // Trigger UI update to show error state
                if (updateCallback) {
                  const updatedOptions = projectsWithMetadata.map(
                    (project) => ({
                      name: formatProjectOption(project),
                      value: project.id,
                      description: project.name,
                    })
                  )
                  updateCallback(updatedOptions)
                }
              }
            }
          })
        )
      }

      // Start fetching all pages immediately
      const fetchAllDeployments = async () => {
        const totalPages = Math.ceil(projects.length / pageSize)
        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
          await fetchDeploymentsForPage(projects, pageNum)
        }
      }

      // Start background fetching
      const deploymentFetchPromise = fetchAllDeployments()

      // Show initial project options with loading states
      const initialProjectOptions: ProjectOption[] = projectsWithMetadata.map(
        (project) => ({
          name: formatProjectOption(project),
          value: project.id,
          description: project.name,
        })
      )

      // Prepare team options for settings menu
      const teamOptions: TeamOption[] = teams.map((team) => ({
        name: team.name,
        value: team.id,
      }))

      // Create callback to fetch detail view data (domains and commit message)
      const fetchDetailData: FetchDetailDataCallback = async (projectId: string) => {
        const [domains, deployments] = await Promise.all([
          api.getProjectDomains(projectId, scopeTeamId).catch(() => []),
          api.listDeployments({ projectId, teamId: scopeTeamId, limit: 1 }).catch(() => []),
        ])

        // Try to extract commit message from deployment meta (if available)
        const deployment = deployments[0]
        const commitMessage = (deployment as any)?.meta?.githubCommitMessage || undefined

        return { domains, commitMessage }
      }

      // Show dynamic prompt with update support
      const result = await promptProjectsWithDynamicUpdates(
        initialProjectOptions,
        pageSize,
        registerUpdateCallback,
        projectsWithMetadata,
        formatProjectOption,
        teamOptions,
        scopeTeamId,
        scopeSlug,
        fetchDetailData
      )
      const { projectIds, action } = result

      // Wait for deployment fetching to complete (in case user exits quickly)
      await deploymentFetchPromise.catch(() => {
        // Silently handle errors - already logged in fetchDeploymentsForPage
      })

      // Exit only if action is null/undefined (user cancelled)
      // Settings actions (like change-team) can have empty projectIds but valid action
      if (!action) {
        // Exit gracefully
        continueLoop = false
        break
      }

      // Type guard for open actions
      if (
        action === "open" ||
        action === "open-settings" ||
        action === "open-deployments" ||
        action === "open-logs"
      ) {
        await handleOpenActionFromSelection(
          projectsWithMetadata,
          projectIds,
          scopeSlug,
          action
        )
        // Return to selection after opening
      } else if (action === "delete") {
        const result = await handleDeleteActionFromSelection(
          projectsWithMetadata,
          projectIds,
          api,
          scopeTeamId,
          scopeName
        )
        // Return to selection after delete (whether confirmed or cancelled)
        // Re-fetch projects if any were deleted
        if (result.deletedCount > 0) {
          projects = await api.listProjects(scopeTeamId)
          if (projects.length === 0) {
            console.log(chalk.yellow("No projects remaining."))
            continueLoop = false
            break
          }
          projects.sort((a, b) => b.updatedAt - a.updatedAt)
        }
      } else if (action === "edit") {
        // Show project details for the selected project
        // Edit action requires exactly one project
        if (projectIds.length === 0) {
          console.log(chalk.yellow("No project selected."))
          // Return to selection
        } else if (projectIds.length > 1) {
          console.log(
            chalk.yellow("Please select only one project to view details.")
          )
          // Return to selection
        } else {
          const selectedProject = projectsWithMetadata.find(
            (p) => p.id === projectIds[0]
          )
          if (selectedProject) {
            await showProjectDetails(
              selectedProject,
              api,
              scopeTeamId,
              scopeSlug
            )
            // Return to selection after viewing details
          }
        }
      } else if (action === "change-team") {
        // Show team selection prompt
        const teamOptions: TeamOption[] = teams.map((team) => ({
          name: team.name,
          value: team.id,
        }))
        const selectedTeam = await promptTeam(teamOptions)

        // If user selected a new team, update and refresh projects
        if (selectedTeam !== scopeTeamId) {
          writeCurrentTeam(selectedTeam)
          currentTeamId = selectedTeam

          // Update scope information
          scopeTeamId = selectedTeam
          if (selectedTeam !== null) {
            const team = teams.find((t) => t.id === selectedTeam)
            if (team) {
              scopeSlug = team.slug
              scopeName = team.name
            }
          } else {
            scopeSlug = user.username
            scopeName = "Personal"
          }

          // Re-fetch projects for the new team
          console.log(chalk.blue("\n📦 Fetching projects..."))
          projects = await api.listProjects(scopeTeamId)
          if (projects.length === 0) {
            console.log(chalk.yellow("No projects found."))
            continueLoop = false
            break
          }
          projects.sort((a, b) => b.updatedAt - a.updatedAt)
          console.log(chalk.green(`✓ Using scope: ${scopeName}\n`))
        }
        // Return to selection (whether team changed or not)
      } else if (action === "refresh") {
        // Clear all cached project data
        invalidateCachePrefix("project-")
        invalidateCachePrefix("detail-view:")

        // Re-fetch projects
        console.log(chalk.blue("\n🔄 Refreshing projects..."))
        projects = await api.listProjects(scopeTeamId)
        if (projects.length === 0) {
          console.log(chalk.yellow("No projects found."))
          continueLoop = false
          break
        }
        projects.sort((a, b) => b.updatedAt - a.updatedAt)
        console.log(chalk.green(`✓ Refreshed ${projects.length} project(s)\n`))
        // Return to selection with fresh data
      }
    }
  } catch (error) {
    // Log error to file
    logError(error instanceof Error ? error : new Error(String(error)), {
      operation: "projectsCommand",
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
        chalk.red(
          `✗ Failed to open ${project.name} ${actionName}: ${errorMessage}`
        )
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
