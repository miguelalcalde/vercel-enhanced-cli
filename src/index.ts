import { Command } from "commander"
import { projectsCommand } from "./commands/projects.js"

const program = new Command()

program
  .name("vcli")
  .description("Interactive CLI for managing Vercel projects")
  .version("0.1.0")
  .option(
    "-t, --token <token>",
    "Vercel API token (or use VERCEL_TOKEN env var or auth.json)"
  )
  .option("--icons", "Force enable Nerd Font icons")
  .option("--no-icons", "Force disable Nerd Font icons")
  .action(async (options) => {
    await projectsCommand({
      token: options.token,
      icons: options.icons,
    })
  })

program.parse()
