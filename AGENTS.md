---
version: 1.1.0
supported_languages:
  - typescript
  - javascript
agents:
  - name: CLI Developer
    description: Specializes in building command-line interfaces and interactive terminal applications
    instructions:
      - Focus on user experience in terminal environments
      - Ensure proper error handling and user feedback
      - Maintain consistent CLI patterns using Commander.js
      - Use Chalk for colored output appropriately
      - Follow interactive prompt best practices with @inquirer/prompts
    tools:
      - commander
      - @inquirer/prompts
      - chalk
  - name: API Integration Specialist
    description: Handles external API integrations and data fetching
    instructions:
      - Follow RESTful API patterns
      - Implement proper error handling and retry logic
      - Handle pagination and rate limiting
      - Use TypeScript interfaces for API responses
      - Optimize API calls (parallel fetching, lazy loading)
    tools:
      - fetch API
      - TypeScript interfaces
  - name: Code Reviewer
    description: Reviews code for quality, security, and best practices
    instructions:
      - Check for TypeScript strict mode compliance
      - Verify error handling patterns
      - Ensure authentication security
      - Review async/await usage
      - Validate API response handling
    constraints:
      - Never commit API tokens or secrets
      - Always validate user inputs
      - Ensure proper error messages for users
  - name: Debugger
    description: Troubleshoots issues and implements debugging capabilities
    instructions:
      - Use error logging utilities for persistent error tracking
      - Add contextual information to error logs
      - Implement verbose debug mode when needed
      - Trace API calls and responses
      - Identify and fix performance bottlenecks
    tools:
      - errorLogger utilities
      - chalk for debug output
      - Node.js debugging tools
---

# AGENTS.md

This file provides context and guidelines for AI agents to interact with this repository effectively. It serves as a comprehensive guide for understanding the project architecture, coding standards, and best practices.

## Introduction

This repository contains **Vercli** (`vercli`), an interactive command-line tool for managing Vercel projects with batch actions. The tool provides a user-friendly interface for browsing projects, viewing extended metadata (last updated, last deployment), opening project URLs, and performing batch deletions.

AI agents working on this codebase should:

- Understand the CLI-first architecture and terminal UX patterns
- Follow TypeScript strict mode conventions
- Maintain consistency with existing code patterns
- Prioritize user experience and error handling
- Respect API rate limits and optimize data fetching

## Project Overview

### Architecture

The project follows a modular CLI architecture:

- **Entry Point** (`src/index.ts`): Sets up Commander.js CLI structure
- **Commands** (`src/commands/`): Implements CLI command handlers
- **API Layer** (`src/api/`): Vercel API client with typed interfaces
- **Authentication** (`src/auth/`): Token management and validation
- **UI Components** (`src/ui/`): Interactive prompts and rendering utilities

### Tech Stack

- **Runtime**: Node.js >= 18.0.0
- **Language**: TypeScript 5.7+ (ES2022 target, ESNext modules)
- **CLI Framework**: Commander.js 12+
- **Interactive Prompts**: @inquirer/prompts 7+
- **Terminal Styling**: Chalk 5+
- **Build Tool**: tsup 8+ (CommonJS output with shebang)
- **Package Manager**: pnpm

### Key Features

1. **Team Selection**: Choose between personal account or team scope
2. **Project Browsing**: Paginated list with extended metadata
3. **Lazy Loading**: Deployment data fetched incrementally for performance
4. **Batch Operations**: Select multiple projects for open/delete actions
5. **Interactive UI**: Terminal-based selection with keyboard navigation

## Coding Standards

### TypeScript Configuration

- **Strict Mode**: Always enabled (`strict: true`)
- **Target**: ES2022
- **Module System**: ESNext (bundled to CommonJS by tsup)
- **Type Safety**: Full type coverage required
- **Interfaces**: Use interfaces for API responses and data structures

### Code Style

- **Naming Conventions**:

  - Functions: `camelCase` (e.g., `fetchProjects`, `handleDeleteAction`)
  - Types/Interfaces: `PascalCase` (e.g., `VercelProject`, `ProjectOption`)
  - Constants: `UPPER_SNAKE_CASE` (e.g., `VERCEL_API_BASE`)
  - Files: `camelCase.ts` for implementation, `PascalCase.ts` for types (if separate)

- **Async/Await**: Prefer async/await over Promises chains
- **Error Handling**: Always use try/catch with meaningful error messages
- **Comments**: JSDoc comments for exported functions and complex logic

### File Organization

```
src/
├── index.ts              # CLI entry point and command registration
├── api/                  # External API clients
│   └── vercelApi.ts     # Vercel API client with typed interfaces
├── auth/                 # Authentication handling
│   └── vercelCliAuth.ts # Token validation and loading
├── commands/             # CLI command implementations
│   └── projects.ts      # Projects command wizard
├── ui/                   # User interface components
│   ├── prompts.ts       # Interactive prompt functions
│   └── renderProjects.ts # Project rendering and formatting
└── utils/                # Utility functions
    └── errorLogger.ts   # Error logging to .vercli-errors.log
```

### Import Conventions

- Use ES module imports: `import { ... } from "./module.js"`
- Include `.js` extension in imports (required for ESNext modules)
- Group imports: external packages → internal modules → types

### Error Handling

- Always provide user-friendly error messages using Chalk
- Use `chalk.red()` for errors, `chalk.yellow()` for warnings, `chalk.green()` for success
- Exit with `process.exit(1)` on fatal errors
- Never expose internal error details to end users

### Error Logging

- **Log File**: Errors are logged to `.vercli-errors.log` in the working directory
- **Usage**: Use `logError()` from `utils/errorLogger.ts` for persistent error tracking
- **Format**: JSON lines format with timestamp, error message, stack trace, and context
- **Context**: Include operation, project details, and relevant metadata
- **Example**:

  ```typescript
  import { logError } from "../utils/errorLogger.js"

  try {
    // Operation that might fail
  } catch (error) {
    logError(error, {
      operation: "deleteProject",
      projectId: project.id,
      projectName: project.name,
    })
    console.error(chalk.red(`❌ Error: ${error.message}`))
  }
  ```

### API Integration

- Use typed interfaces for all API responses
- Handle pagination properly (check `pagination.next` field)
- Implement parallel fetching where possible (use `Promise.all`)
- Add rate limiting considerations for batch operations
- Handle API errors gracefully with retry logic when appropriate

## Repository Structure

### Key Files

- `package.json`: Project metadata, dependencies, and scripts
- `tsconfig.json`: TypeScript compiler configuration
- `tsup.config.ts`: Build configuration (outputs CJS with shebang)
- `src/index.ts`: CLI entry point, registers commands
- `src/commands/projects.ts`: Main projects command implementation
- `src/api/vercelApi.ts`: Vercel API client with fetch implementation
- `src/auth/vercelCliAuth.ts`: Token loading from env vars or CLI flags
- `src/ui/prompts.ts`: Interactive prompt wrappers using @inquirer
- `src/ui/renderProjects.ts`: Project list formatting and display logic
- `src/utils/errorLogger.ts`: Error logging utilities for debugging and monitoring

### Build Output

- `dist/`: Compiled JavaScript output (CommonJS)
- `dist/index.js`: Executable CLI entry point (with shebang)
- `dist/*.d.ts`: TypeScript declaration files
- `dist/*.js.map`: Source maps for debugging

### Dependencies

**Production**:

- `commander`: CLI framework
- `@inquirer/prompts`: Interactive terminal prompts
- `chalk`: Terminal colors
- `open`: Open URLs in browser

**Development**:

- `typescript`: Type checking and compilation
- `tsup`: Fast TypeScript bundler
- `@types/node`: Node.js type definitions

## Agent Instructions

### General Rules

1. **Never commit secrets**: API tokens, credentials, or sensitive data
2. **Always validate inputs**: Check user-provided tokens and options
3. **Maintain backward compatibility**: Don't break existing CLI flags or behavior
4. **Follow existing patterns**: Match code style and architecture of existing files
5. **Test interactively**: Ensure CLI commands work end-to-end

### Adding New Commands

1. Create command handler in `src/commands/`
2. Register command in `src/index.ts` using Commander.js
3. Add command description and options
4. Implement proper error handling and user feedback
5. Update README.md with usage examples

### Modifying API Client

1. Update TypeScript interfaces in `src/api/vercelApi.ts`
2. Maintain type safety for all API responses
3. Handle pagination, errors, and edge cases
4. Consider rate limiting for batch operations
5. Add JSDoc comments for complex methods

### UI/UX Guidelines

1. **Progress Indicators**: Show loading states for async operations

   ```typescript
   console.log(chalk.blue("📦 Fetching projects..."))
   ```

2. **Success Messages**: Use green checkmarks for completed actions

   ```typescript
   console.log(chalk.green(`✓ Found ${projects.length} project(s)`))
   ```

3. **Error Messages**: Use red with clear descriptions

   ```typescript
   console.error(chalk.red(`❌ Error: ${error.message}`))
   ```

4. **Interactive Prompts**: Use @inquirer/prompts for consistent UX
5. **Pagination**: Implement lazy loading for large datasets

### Security Considerations

- **Token Handling**: Never log or expose API tokens
- **Input Validation**: Validate all user inputs before API calls
- **Error Messages**: Don't expose internal errors or stack traces
- **Dependencies**: Keep dependencies up-to-date for security patches

### Performance Optimization

- **Lazy Loading**: Fetch deployment data incrementally (see `projects.ts`)
- **Parallel Fetching**: Use `Promise.all` for independent API calls
- **Pagination**: Load data in pages (default: 10 items per page)
- **Background Fetching**: Fetch remaining data asynchronously without blocking UI

### Debugging and Troubleshooting

1. **Error Logs**: Check `.vercli-errors.log` for detailed error information

   - JSON lines format for easy parsing
   - Contains stack traces and operation context
   - Use `clearErrorLog()` to reset the log file

2. **Debug Mode**: Add verbose logging when debugging

   ```typescript
   if (process.env.DEBUG) {
     console.log(chalk.gray(`[DEBUG] ${message}`))
   }
   ```

3. **API Response Inspection**: Log raw API responses when troubleshooting

   ```typescript
   const response = await fetch(url)
   if (!response.ok) {
     logError(`API Error: ${response.status}`, { url, status: response.status })
   }
   ```

4. **Common Issues**:
   - **Token Issues**: Verify token with `api.verifyToken()`
   - **Rate Limiting**: Check for 429 status codes
   - **Pagination**: Ensure `pagination.next` is properly followed
   - **Type Mismatches**: Use TypeScript strict mode to catch early

## Personas

### CLI Developer

**When to use**: Building new commands, improving terminal UX, adding interactive features.

**Responsibilities**:

- Design intuitive CLI interfaces
- Implement consistent command patterns
- Handle user input validation
- Create helpful error messages and progress indicators
- Ensure cross-platform compatibility

**Example tasks**:

- Add a new `vercli deployments` command
- Improve pagination UX in project selection
- Add progress bars for long-running operations

### API Integration Specialist

**When to use**: Working with Vercel API, adding new endpoints, optimizing data fetching.

**Responsibilities**:

- Maintain typed API client interfaces
- Implement efficient data fetching strategies
- Handle API errors and rate limiting
- Optimize network requests (parallel, lazy loading)
- Ensure data consistency

**Example tasks**:

- Add support for Vercel domains API
- Implement caching for frequently accessed data
- Add retry logic for failed API requests

### Code Reviewer

**When to use**: Reviewing pull requests, ensuring code quality, identifying security issues.

**Responsibilities**:

- Verify TypeScript strict mode compliance
- Check error handling patterns
- Ensure authentication security
- Validate async/await usage
- Review API response handling

**Example tasks**:

- Review new command implementation
- Check for potential security vulnerabilities
- Ensure proper error handling in new features

### Debugger

**When to use**: Investigating bugs, improving error handling, adding diagnostic capabilities.

**Responsibilities**:

- Implement comprehensive error logging
- Add debug mode features
- Trace execution flow
- Identify performance issues
- Improve error messages and recovery

**Example tasks**:

- Debug API rate limiting issues
- Add verbose logging for troubleshooting
- Implement retry logic for failed operations
- Track down intermittent failures
- Analyze `.vercli-errors.log` for patterns

## Examples

### Adding a New Command

```typescript
// src/commands/deployments.ts
import { VercelApi } from "../api/vercelApi.js"
import chalk from "chalk"

export async function deploymentsCommand(token: string) {
  try {
    const api = new VercelApi(token)
    const deployments = await api.listDeployments({ limit: 10 })
    // ... implementation
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`))
    process.exit(1)
  }
}

// src/index.ts
import { deploymentsCommand } from "./commands/deployments.js"

program
  .command("deployments")
  .description("List recent deployments")
  .option("-t, --token <token>", "Vercel API token")
  .action(async (options) => {
    await deploymentsCommand(options.token)
  })
```

### Implementing Lazy Loading

```typescript
// Fetch first page immediately
await fetchDeploymentsForPage(projects, 0)

// Fetch remaining pages in background
const backgroundFetch = (async () => {
  for (let pageNum = 1; pageNum < totalPages; pageNum++) {
    await fetchDeploymentsForPage(projects, pageNum)
  }
})().catch(() => {
  // Silently handle errors
})
```

### Error Handling Pattern

```typescript
try {
  const projects = await api.listProjects(teamId)
  console.log(chalk.green(`✓ Found ${projects.length} project(s)`))
} catch (error) {
  if (error instanceof Error) {
    console.error(chalk.red(`❌ Error: ${error.message}`))
  } else {
    console.error(chalk.red(`❌ Unexpected error: ${error}`))
  }
  process.exit(1)
}
```

### Error Logging Pattern

```typescript
import { logError } from "../utils/errorLogger.js"

try {
  const result = await api.deleteProject(projectId)
  console.log(chalk.green(`✓ Project deleted successfully`))
} catch (error) {
  // Log detailed error for debugging
  logError(error, {
    operation: "deleteProject",
    projectId,
    projectName,
    teamId,
    timestamp: new Date().toISOString(),
  })

  // Show user-friendly error
  console.error(chalk.red(`❌ Failed to delete project: ${error.message}`))
  console.error(chalk.gray("Error details saved to .vercli-errors.log"))
  process.exit(1)
}
```

## Contributing

### Development Workflow

1. **Install Dependencies**: `pnpm install`
2. **Build**: `pnpm run build`
3. **Development**: `pnpm run dev` (watch mode)
4. **Test**: Run `node dist/index.js projects` to test locally

### Environment Setup

1. **Node.js**: Ensure Node.js >= 18.0.0 is installed
2. **Package Manager**: Use pnpm for consistency
3. **TypeScript**: Global installation not required (uses local version)
4. **Vercel Token**: Get from https://vercel.com/account/tokens
5. **Environment Variables**:
   ```bash
   export VERCEL_TOKEN=your_token_here
   export DEBUG=1  # Enable debug logging (optional)
   ```

### Local Testing

```bash
# Test with token via environment
export VERCEL_TOKEN=your_token
node dist/index.js projects

# Test with token via flag
node dist/index.js projects --token your_token

# Test with debug mode
DEBUG=1 node dist/index.js projects

# Test after making changes (watch mode)
pnpm run dev
# In another terminal:
node dist/index.js projects
```

### Code Review Checklist

- [ ] TypeScript compiles without errors (`strict: true`)
- [ ] All async operations have error handling
- [ ] User-facing messages use Chalk for styling
- [ ] No hardcoded secrets or tokens
- [ ] API calls handle pagination correctly
- [ ] Interactive prompts provide clear options
- [ ] Error messages are user-friendly

### Testing Guidelines

- Test commands with valid and invalid tokens
- Test with empty project lists
- Test batch operations (open, delete)
- Verify pagination works with large datasets
- Test error scenarios (network failures, API errors)

### Git Workflow

1. **Branch Naming**:

   - Features: `feature/command-name` (e.g., `feature/deployments-command`)
   - Fixes: `fix/issue-description` (e.g., `fix/pagination-error`)
   - Improvements: `improve/area-description` (e.g., `improve/error-handling`)

2. **Commit Messages**:

   ```
   type(scope): description

   - feat(commands): add deployments command
   - fix(api): handle rate limiting properly
   - improve(ui): enhance project rendering
   - docs(readme): update usage examples
   - chore(deps): update dependencies
   ```

3. **Pre-commit Checklist**:

   - [ ] TypeScript compiles without errors
   - [ ] No exposed tokens or secrets
   - [ ] Error handling implemented
   - [ ] User messages use Chalk styling
   - [ ] Code follows existing patterns

4. **Files to Never Commit**:
   - `.vercli-errors.log` (error log file)
   - `.env` or any file with tokens
   - `node_modules/` (already in .gitignore)
   - Personal test scripts

## References

- [Commander.js Documentation](https://github.com/tj/commander.js)
- [@inquirer/prompts Documentation](https://github.com/SBoudrias/Inquirer.js)
- [Vercel API Documentation](https://vercel.com/docs/rest-api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [tsup Documentation](https://tsup.egoist.dev/)

---

**Last Updated**: 2025-12-12  
**Maintainer**: See package.json author field
