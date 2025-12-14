import chalk from "chalk"
import open from "open"
import { VercelApi, VercelProjectDetails, VercelDomain, VercelProject } from "../api/vercelApi.js"
import {
  formatFrameworkInfo,
  formatTimeAgo,
} from "../ui/renderProjectDetails.js"
import { logError } from "../utils/errorLogger.js"

interface SelectableItem {
  id: string
  name: string
  type: "domain" | "repo"
  url: string
  displayIndex: number // Index in the displayed list
}

/**
 * Show project details view with interactive selection
 */
export async function showProjectDetails(
  project: VercelProject,
  api: VercelApi,
  teamId: string | null,
  scopeSlug: string
): Promise<void> {
  try {
    // Fetch project details and domains in parallel
    const [projectDetails, domains] = await Promise.all([
      api.getProjectDetails(project.id, teamId).catch((error: unknown) => {
        logError(error instanceof Error ? error : new Error(String(error)), {
          operation: "getProjectDetails",
          projectId: project.id,
          teamId,
        })
        return project as VercelProjectDetails
      }),
      api.getProjectDomains(project.id, teamId).catch((error: unknown) => {
        logError(error instanceof Error ? error : new Error(String(error)), {
          operation: "getProjectDomains",
          projectId: project.id,
          teamId,
        })
        return [] as VercelDomain[]
      }),
    ])

    // Build selectable items list
    const selectableItems: SelectableItem[] = []
    let displayIndex = 0

    // Add domains
    domains.forEach((domain) => {
      selectableItems.push({
        id: `domain-${domain.name}`,
        name: domain.name,
        type: "domain",
        url: `https://${domain.name}`,
        displayIndex: displayIndex++,
      })
    })

    // Add GitHub repo if available
    if (projectDetails.link) {
      // Try to get repo name - use repoName if available, otherwise parse from repo or use repoOwner/repo
      const repoName = projectDetails.link.repoName || 
        (projectDetails.link.repo ? projectDetails.link.repo.split('/').pop() : null) ||
        projectDetails.link.repoOwner
      const org = projectDetails.link.org || projectDetails.link.repoOwner
      
      if (org && repoName) {
        const repoUrl = `https://github.com/${org}/${repoName}`
        selectableItems.push({
          id: `repo-${org}-${repoName}`,
          name: `${org}/${repoName}`,
          type: "repo",
          url: repoUrl,
          displayIndex: displayIndex++,
        })
      }
    }

    // Show interactive selection interface
    await showInteractiveProjectDetails(
      project,
      projectDetails,
      domains,
      selectableItems,
      scopeSlug
    )
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      operation: "showProjectDetails",
      projectId: project.id,
      projectName: project.name,
      teamId,
    })
    console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`))
  }
}

/**
 * Show interactive project details with selectable items integrated into display
 */
async function showInteractiveProjectDetails(
  project: VercelProject,
  projectDetails: VercelProjectDetails,
  domains: VercelDomain[],
  selectableItems: SelectableItem[],
  scopeSlug: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cursorIndex = 0
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

      // Project name header
      console.log(chalk.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`))
      console.log(chalk.bold(`  ${project.name}`))
      console.log(chalk.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`))

      // Display Domains section with cursor integration
      console.log(chalk.bold(`🌐 Domains (${domains.length})`))
      if (domains.length > 0) {
        domains.forEach((domain, index) => {
          const itemIndex = selectableItems.findIndex(
            (item) => item.type === "domain" && item.name === domain.name
          )
          const isSelected = itemIndex !== -1 && itemIndex === cursorIndex
          const prefix = isSelected ? chalk.cyan("> ") : "  "
          
          const verifiedIcon = domain.verified
            ? chalk.green("✓")
            : chalk.yellow("⚠")
          const verifiedText = domain.verified ? "" : chalk.yellow(" (Unverified)")
          const isProduction = !domain.gitBranch || domain.gitBranch === "main" || domain.gitBranch === "master"
          const typeBadge = isProduction
            ? chalk.blue("Production")
            : chalk.gray(`Preview (${domain.gitBranch})`)
          
          let redirectInfo = ""
          if (domain.redirect) {
            redirectInfo = chalk.gray(` → ${domain.redirect}`)
          }

          const domainName = isSelected
            ? chalk.cyan(chalk.bold(domain.name))
            : chalk.bold(domain.name)

          console.log(`${prefix}${verifiedIcon} ${domainName}${redirectInfo}${verifiedText} ${chalk.gray(`(${typeBadge})`)}`)
        })
      } else {
        console.log(`  ${chalk.gray("No domains configured")}`)
      }
      console.log()

      // Display Git Repository section with cursor integration
      console.log(chalk.bold("🔗 Git Repository"))
      if (projectDetails.link) {
        // Try to get repo name - use repoName if available, otherwise parse from repo or use repoOwner/repo
        const repoName = projectDetails.link.repoName || 
          (projectDetails.link.repo ? projectDetails.link.repo.split('/').pop() : null) ||
          projectDetails.link.repoOwner
        const org = projectDetails.link.org || projectDetails.link.repoOwner
        
        if (org && repoName) {
          const repoDisplayName = `${org}/${repoName}`
          const branch = projectDetails.link.productionBranch || "main"
          const provider = projectDetails.link.type === "github" ? "GitHub" : projectDetails.link.type === "gitlab" ? "GitLab" : projectDetails.link.type
          
          const itemIndex = selectableItems.findIndex(
            (item) => item.type === "repo"
          )
          const isSelected = itemIndex !== -1 && itemIndex === cursorIndex
          const prefix = isSelected ? chalk.cyan("> ") : "  "
          
          const repoNameDisplay = isSelected
            ? chalk.cyan(repoDisplayName)
            : chalk.blue(repoDisplayName)
          
          console.log(`${prefix}${repoNameDisplay} ${chalk.gray(`(${branch} branch)`)}`)
          console.log(`  Connected via ${provider}`)
        } else {
          console.log(`  ${chalk.gray("Not connected to a Git repository")}`)
        }
      } else {
        console.log(`  ${chalk.gray("Not connected to a Git repository")}`)
      }
      console.log()

      // Display Framework & Build Settings section
      console.log(chalk.bold("⚙️  Framework & Build"))
      const framework = projectDetails.framework
        ? projectDetails.framework.charAt(0).toUpperCase() + projectDetails.framework.slice(1)
        : chalk.gray("Auto-detected")
      const buildCommand = projectDetails.buildCommand || chalk.gray("Auto-detected")
      const devCommand = projectDetails.devCommand || chalk.gray("Auto-detected")
      const installCommand = projectDetails.installCommand || chalk.gray("Auto-detected")
      const outputDirectory = projectDetails.outputDirectory || chalk.gray("Default")
      const rootDirectory = projectDetails.rootDirectory || chalk.gray("Repository root")

      console.log(`  Framework: ${framework}`)
      console.log(`  Build: ${buildCommand}`)
      console.log(`  Dev: ${devCommand}`)
      console.log(`  Install: ${installCommand}`)
      console.log(`  Output: ${outputDirectory}`)
      console.log(`  Root: ${rootDirectory}`)
      console.log()

      // Footer with navigation hints
      const hints: string[] = []
      if (selectableItems.length > 0) {
        hints.push("↑↓ navigate")
        hints.push("o open")
        hints.push("c copy")
      }
      hints.push("1 dashboard")
      hints.push("2 settings")
      hints.push("ESC back")
      console.log(chalk.gray(hints.join("  ")))
    }

    const handleData = (chunk: Buffer) => {
      const data = chunk.toString("utf8")
      const fullData = escapeSequence + data

      // Handle arrow keys
      if (
        fullData.length >= 3 &&
        fullData[0] === "\x1b" &&
        fullData[1] === "["
      ) {
        if (fullData.length >= 3 && fullData[2] === "A") {
          // Up arrow
          escapeSequence = ""
          cursorIndex = Math.max(0, cursorIndex - 1)
          render()
          return
        } else if (fullData.length >= 3 && fullData[2] === "B") {
          // Down arrow
          escapeSequence = ""
          cursorIndex = Math.min(selectableItems.length - 1, cursorIndex + 1)
          render()
          return
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
        resolve()
        return
      }

      // Handle ESC to go back
      if (data === "\x1b" && escapeSequence === "") {
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
        resolve()
        return
      }

      // Handle 'o' to open selected item
      if (data === "o" && selectableItems.length > 0 && cursorIndex < selectableItems.length) {
        const selectedItem = selectableItems[cursorIndex]
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
        
        open(selectedItem.url).then(() => {
          console.log(chalk.green(`✓ Opened ${selectedItem.url}`))
          setTimeout(() => {
            showInteractiveProjectDetails(project, projectDetails, domains, selectableItems, scopeSlug).then(resolve).catch(reject)
          }, 1000)
        }).catch((error) => {
          console.error(chalk.red(`✗ Failed to open: ${error instanceof Error ? error.message : String(error)}`))
          setTimeout(() => {
            showInteractiveProjectDetails(project, projectDetails, domains, selectableItems, scopeSlug).then(resolve).catch(reject)
          }, 1500)
        })
        return
      }

      // Handle 'c' to copy selected item
      if (data === "c" && selectableItems.length > 0 && cursorIndex < selectableItems.length) {
        const selectedItem = selectableItems[cursorIndex]
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
        
        // Copy URL to clipboard
        import("clipboardy")
          .then((clipboardy) => {
            return clipboardy.default.write(selectedItem.url)
          })
          .then(() => {
            console.log(chalk.green(`✓ Copied "${selectedItem.url}" to clipboard`))
            setTimeout(() => {
              showInteractiveProjectDetails(project, projectDetails, domains, selectableItems, scopeSlug).then(resolve).catch(reject)
            }, 1500)
          })
          .catch((error) => {
            console.log(chalk.yellow(`⚠ Clipboard not available. URL: ${chalk.bold(selectedItem.url)}`))
            setTimeout(() => {
              showInteractiveProjectDetails(project, projectDetails, domains, selectableItems, scopeSlug).then(resolve).catch(reject)
            }, 1500)
          })
        return
      }

      // Handle '1' to open project dashboard
      if (data === "1") {
        const dashboardUrl = `https://vercel.com/${scopeSlug}/${project.name}`
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
        
        open(dashboardUrl).then(() => {
          console.log(chalk.green(`✓ Opened ${dashboardUrl}`))
          setTimeout(() => {
            showInteractiveProjectDetails(project, projectDetails, domains, selectableItems, scopeSlug).then(resolve).catch(reject)
          }, 1000)
        }).catch((error) => {
          console.error(chalk.red(`✗ Failed to open: ${error instanceof Error ? error.message : String(error)}`))
          setTimeout(() => {
            showInteractiveProjectDetails(project, projectDetails, domains, selectableItems, scopeSlug).then(resolve).catch(reject)
          }, 1500)
        })
        return
      }

      // Handle '2' to open project dashboard settings
      if (data === "2") {
        const settingsUrl = `https://vercel.com/${scopeSlug}/${project.name}/settings`
        process.stdin.removeListener("data", handleData)
        process.stdin.setRawMode(wasRawMode || false)
        process.stdin.pause()
        process.stdout.write("\x1b[2J\x1b[H")
        
        open(settingsUrl).then(() => {
          console.log(chalk.green(`✓ Opened ${settingsUrl}`))
          setTimeout(() => {
            showInteractiveProjectDetails(project, projectDetails, domains, selectableItems, scopeSlug).then(resolve).catch(reject)
          }, 1000)
        }).catch((error) => {
          console.error(chalk.red(`✗ Failed to open: ${error instanceof Error ? error.message : String(error)}`))
          setTimeout(() => {
            showInteractiveProjectDetails(project, projectDetails, domains, selectableItems, scopeSlug).then(resolve).catch(reject)
          }, 1500)
        })
        return
      }
    }

    // Set up data listener
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
