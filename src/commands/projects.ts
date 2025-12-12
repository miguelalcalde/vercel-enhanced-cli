import { requireVercelToken } from "../auth/vercelCliAuth.js"
import { VercelApi, VercelDeployment } from "../api/vercelApi.js"
import {
  promptTeam,
  promptProject,
  promptProjectsMultiSelect,
  confirmAction,
  TeamOption,
  ProjectOption,
} from "../ui/prompts.js"
import {
  renderProjectsList,
  formatProjectOption,
  ProjectWithMetadata,
} from "../ui/renderProjects.js"
import chalk from "chalk"
import open from "open"

type Action = "open" | "delete" | "exit"

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

    // Step 2: Fetch teams and prompt for selection
    console.log(chalk.blue("📋 Fetching teams..."))
    const teams = await api.listTeams()
    const teamOptions: TeamOption[] = teams.map((team) => ({
      name: team.name,
      value: team.id,
    }))

    const selectedTeamId = await promptTeam(teamOptions)
    const teamName =
      selectedTeamId === null
        ? "Personal"
        : teams.find((t) => t.id === selectedTeamId)?.name || "Unknown"

    console.log(chalk.green(`✓ Using scope: ${teamName}\n`))

    // Step 3: Fetch projects
    console.log(chalk.blue("📦 Fetching projects..."))
    const projects = await api.listProjects(selectedTeamId)

    if (projects.length === 0) {
      console.log(chalk.yellow("No projects found in this scope."))
      return
    }

    console.log(chalk.green(`✓ Found ${projects.length} project(s)\n`))

    // Sort projects by last updated (newest first) before pagination
    projects.sort((a, b) => b.updatedAt - a.updatedAt)

    // Step 4: Fetch deployments gradually (lazy loading per page)
    const pageSize = 10
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
      const pageProjectIds = projects.slice(pageStart, pageEnd).map((p) => p.id)

      // Fetch deployments for this page in parallel
      await Promise.all(
        pageProjectIds.map(async (projectId) => {
          try {
            const projectDeployments = await api.listDeployments({
              teamId: selectedTeamId,
              projectId,
              limit: 1,
            })
            latestDeployments.set(projectId, projectDeployments[0] || null)
          } catch (error) {
            // If project has no deployments or error, set to null
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
    // First page has data, others will show "never deployed" until fetched
    let projectsWithMetadata: ProjectWithMetadata[] = projects.map(
      (project) => ({
        ...project,
        lastDeployment: latestDeployments.get(project.id) || null,
      })
    )

    // Fetch remaining deployments in background with progress indication
    const totalPages = Math.ceil(projects.length / pageSize)
    if (totalPages > 1) {
      // Start background fetch but don't block
      const backgroundFetch = (async () => {
        for (let pageNum = 1; pageNum < totalPages; pageNum++) {
          await fetchDeploymentsForPage(projects, pageNum)
          // Update the projectsWithMetadata array with newly fetched data
          // (Note: UI won't update dynamically, but data will be ready)
          projectsWithMetadata = projects.map((project) => ({
            ...project,
            lastDeployment: latestDeployments.get(project.id) || null,
          }))
        }
      })().catch(() => {
        // Silently handle background fetch errors
      })

      // Don't await - let it run in background
      // The data will be available if user navigates to later pages
      void backgroundFetch
    }

    // Step 5: Show interactive select interface (no full list display)
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
      console.log(chalk.gray("No action selected."))
      return
    }

    if (action === "open") {
      await handleOpenActionFromSelection(
        projectsWithMetadata,
        projectIds,
        selectedTeamId,
        teamName
      )
    } else if (action === "delete") {
      await handleDeleteActionFromSelection(
        projectsWithMetadata,
        projectIds,
        api,
        selectedTeamId,
        teamName
      )
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`))
    } else {
      console.error(chalk.red(`\n❌ Unexpected error: ${error}`))
    }
    process.exit(1)
  }
}

/**
 * Handle opening selected projects in the browser
 */
async function handleOpenActionFromSelection(
  projects: ProjectWithMetadata[],
  projectIds: string[],
  teamId: string | null,
  teamName: string
) {
  const selectedProjects = projects.filter((p) => projectIds.includes(p.id))

  if (selectedProjects.length === 0) {
    console.log(chalk.red("No projects selected."))
    return
  }

  // Open each selected project
  const scope = teamId || "~"
  for (const project of selectedProjects) {
    const projectUrl = `https://vercel.com/${scope}/~/project/${project.name}`
    console.log(chalk.blue(`\n🌐 Opening ${project.name}...`))
    await open(projectUrl)
    console.log(chalk.green(`✓ Opened ${projectUrl}`))
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
) {
  const selectedProjects = projects.filter((p) => projectIds.includes(p.id))

  if (selectedProjects.length === 0) {
    console.log(chalk.yellow("No projects selected."))
    return
  }

  // Show confirmation
  const projectNames = selectedProjects.map((p) => p.name).join(", ")
  const confirmMessage = `Are you sure you want to delete ${selectedProjects.length} project(s)?\n  ${projectNames}`

  const confirmed = await confirmAction(confirmMessage, false)

  if (!confirmed) {
    console.log(chalk.yellow("Deletion cancelled."))
    return
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
  }
}
