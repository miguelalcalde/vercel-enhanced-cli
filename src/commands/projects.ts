import { requireVercelToken } from "../auth/vercelCliAuth.js"
import { VercelApi, VercelDeployment } from "../api/vercelApi.js"
import { confirmAction, ProjectOption } from "../ui/prompts.js"
import {
  formatProjectOption,
  ProjectWithMetadata,
} from "../ui/renderProjects.js"
import { logError, getErrorLogPath } from "../utils/errorLogger.js"
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

      // Show dynamic prompt with update support
      const { promptProjectsWithDynamicUpdates } = await import(
        "../ui/prompts.js"
      )
      const { projectIds, action } = await promptProjectsWithDynamicUpdates(
        initialProjectOptions,
        pageSize,
        registerUpdateCallback
      )

      // Wait for deployment fetching to complete (in case user exits quickly)
      await deploymentFetchPromise.catch(() => {
        // Silently handle errors - already logged in fetchDeploymentsForPage
      })

      if (projectIds.length === 0 || !action) {
        // Exit gracefully
        continueLoop = false
        break
      }

      if (action === "open") {
        await handleOpenActionFromSelection(
          projectsWithMetadata,
          projectIds,
          scopeSlug
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
 */
async function handleOpenActionFromSelection(
  projects: ProjectWithMetadata[],
  projectIds: string[],
  scopeSlug: string
) {
  const selectedProjects = projects.filter((p) => projectIds.includes(p.id))

  if (selectedProjects.length === 0) {
    console.log(chalk.red("No projects selected."))
    return
  }

  // Open each selected project using the correct scope slug
  for (const project of selectedProjects) {
    try {
      const projectUrl = `https://vercel.com/${scopeSlug}/${project.name}`
      console.log(chalk.blue(`\n🌐 Opening ${project.name}...`))
      await open(projectUrl)
      console.log(chalk.green(`✓ Opened ${projectUrl}`))
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      console.log(
        chalk.red(`✗ Failed to open ${project.name}: ${errorMessage}`)
      )

      // Log error to file
      logError(error instanceof Error ? error : new Error(errorMessage), {
        operation: "openProject",
        projectName: project.name,
        projectId: project.id,
        scopeSlug: scopeSlug,
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
