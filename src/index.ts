import { Command } from "commander"
import { projectsCommand } from "./commands/projects.js"
import { searchCommand } from "./commands/search.js"

const program = new Command()

program
  .name("vercli")
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

program
  .command("search")
  .alias("s")
  .description("Search projects by name and creator name")
  .argument("<query>", "Search query (searches project name and creator name)")
  .option(
    "-t, --token <token>",
    "Vercel API token (or use VERCEL_TOKEN env var)"
  )
  .action(async (query, options) => {
    await searchCommand(query, options.token)
  })

program.parse()
