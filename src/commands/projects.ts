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
      // Fetch deployments gradually (lazy loading per page)
      const latestDeployments = new Map<string, VercelDeployment | null>()

      /**
       * Fetch deployments for a specific page of projects
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
              latestDeployments.set(projectId, projectDeployments[0] || null)
            } catch (error) {
              // If project has no deployments or error, set to null
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
              latestDeployments.set(projectId, null)
            }
          })
        )
      }

      // Fetch deployments for first page immediately (for initial display)
      console.log(chalk.blue("🚀 Fetching deployment data for first page..."))
      await fetchDeploymentsForPage(projects, 0)
      const firstPageCount = Math.min(pageSize, projects.length)
      console.log(
        chalk.green(
          `✓ Fetched deployment data for first ${firstPageCount} project(s)\n`
        )
      )

      // Combine projects with deployment metadata
      let projectsWithMetadata: ProjectWithMetadata[] = projects.map(
        (project) => ({
          ...project,
          lastDeployment: latestDeployments.get(project.id) || null,
        })
      )

      // Fetch remaining deployments in background
      const totalPages = Math.ceil(projects.length / pageSize)
      if (totalPages > 1) {
        const backgroundFetch = (async () => {
          for (let pageNum = 1; pageNum < totalPages; pageNum++) {
            await fetchDeploymentsForPage(projects, pageNum)
            projectsWithMetadata = projects.map((project) => ({
              ...project,
              lastDeployment: latestDeployments.get(project.id) || null,
            }))
          }
        })().catch(() => {
          // Silently handle background fetch errors
        })
        void backgroundFetch
      }

      // Show interactive select interface
      const projectOptions: ProjectOption[] = projectsWithMetadata.map(
        (project) => ({
          name: formatProjectOption(project),
          value: project.id,
          description: project.name,
        })
      )

      const { promptProjectsWithActions } = await import("../ui/prompts.js")
      const { projectIds, action } = await promptProjectsWithActions(
        projectOptions,
        pageSize
      )

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
