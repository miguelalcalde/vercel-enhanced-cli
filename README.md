# Vercli

Interactive CLI for managing Vercel projects with batch actions.

## Installation

### Global Installation (Recommended)

Build and install globally from the project directory:

```bash
# Install dependencies
pnpm install
# or: npm install

# Build the project
pnpm run build
# or: npm run build

# Install globally
pnpm link --global
# or: npm link -g
# or: pnpm install -g .
# or: npm install -g .
```

After installation, you can run `vercli` from anywhere:

```bash
vercli projects --token YOUR_VERCEL_TOKEN
```

### Local Development

```bash
pnpm install
pnpm run build
node dist/index.js projects --token YOUR_VERCEL_TOKEN
```

## Usage

```bash
vercli projects
```

Or with a token:

```bash
vercli projects --token YOUR_VERCEL_TOKEN
```

Or set the token as an environment variable:

```bash
export VERCEL_TOKEN=YOUR_VERCEL_TOKEN
vercli projects
```

## Features

- Browse projects with extended metadata (last updated, last deployment)
- Open project URLs in browser
- Batch delete projects with confirmation

## Authentication

Provide your Vercel API token either:

- Via command-line flag: `--token` or `-t`
- Via environment variable: `VERCEL_TOKEN`

You can get your token from: https://vercel.com/account/tokens
