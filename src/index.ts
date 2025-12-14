import { Command } from "commander"
import { projectsCommand } from "./commands/projects.js"

const program = new Command()

program
  .name("vercli")
  .description("Interactive CLI for managing Vercel projects")
  .version("0.1.0")
  .option(
    "-t, --token <token>",
    "Vercel API token (or use VERCEL_TOKEN env var or auth.json)"
  )
  .action(async (options) => {
    await projectsCommand(options.token)
  })

program.parse()
