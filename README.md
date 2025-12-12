# Vercel Enhanced CLI

Interactive CLI for managing Vercel projects with batch actions.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
vercelx projects
```

Or with a token:

```bash
vercelx projects --token YOUR_VERCEL_TOKEN
```

Or set the token as an environment variable:

```bash
export VERCEL_TOKEN=YOUR_VERCEL_TOKEN
vercelx projects
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
