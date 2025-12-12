import { Command } from "commander"
import { projectsCommand } from "./commands/projects.js"

const program = new Command()

program
  .name("vercelx")
  .description("Interactive CLI for managing Vercel projects")
  .version("0.1.0")

program
  .command("projects")
  .description("Browse and manage Vercel projects with extended metadata")
  .option(
    "-t, --token <token>",
    "Vercel API token (or use VERCEL_TOKEN env var)"
  )
  .action(async (options) => {
    await projectsCommand(options.token)
  })

program.parse()
