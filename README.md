# vcli

Interactive CLI for managing Vercel projects with batch actions.

## Installation

### Install from npm (Recommended)

```bash
npm install -g vcli
```

Or using pnpm:

```bash
pnpm install -g vcli
```

Or using yarn:

```bash
yarn global add vcli
```

After installation, you can run `vcli` from anywhere:

```bash
vcli projects --token YOUR_VERCEL_TOKEN
```

### Install from Source

If you want to install from the GitHub repository:

```bash
# Clone the repository
git clone https://github.com/miguelalcalde/vercel-enhanced-cli.git
cd vercel-enhanced-cli

# Install dependencies
pnpm install
# or: npm install

# Build the project
pnpm run build
# or: npm run build

# Install globally
pnpm link --global
# or: npm link -g
```

### Local Development

```bash
# Clone and install dependencies
git clone https://github.com/miguelalcalde/vercel-enhanced-cli.git
cd vercel-enhanced-cli
pnpm install

# Run in development mode (with watch)
pnpm run dev

# In another terminal, test the CLI
node dist/index.js projects --token YOUR_VERCEL_TOKEN
```

## Usage

Run the CLI:

```bash
vcli
```

Or with a token:

```bash
vcli --token YOUR_VERCEL_TOKEN
```

Or set the token as an environment variable:

```bash
export VERCEL_TOKEN=YOUR_VERCEL_TOKEN
vcli
```

### Command Options

- `-t, --token <token>` - Vercel API token (or use `VERCEL_TOKEN` env var)

## Features

- 🔍 **Browse Projects**: View all your Vercel projects with extended metadata
  - Last updated timestamp
  - Last deployment information
  - Project URLs and domains
- 👥 **Team Management**: Switch between personal account and teams
- 📊 **Project Details**: View detailed information about each project
- 🌐 **Open URLs**: Batch open project URLs in your browser
- 🗑️ **Batch Delete**: Select and delete multiple projects with confirmation
- ⚡ **Lazy Loading**: Efficient data fetching with incremental loading
- 🎨 **Interactive UI**: Terminal-based selection with keyboard navigation

## Authentication

Provide your Vercel API token using one of these methods:

1. **Command-line flag**: `--token` or `-t`

   ```bash
   vcli --token YOUR_VERCEL_TOKEN
   ```

2. **Environment variable**: `VERCEL_TOKEN`

   ```bash
   export VERCEL_TOKEN=YOUR_VERCEL_TOKEN
   vcli
   ```

3. **Vercel CLI auth file**: The tool can also read from Vercel CLI's auth configuration

Get your token from: https://vercel.com/account/tokens

## Requirements

- Node.js >= 18.0.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 🐛 **Bug Reports**: [Open an issue](https://github.com/miguelalcalde/vercel-enhanced-cli/issues)
- 💡 **Feature Requests**: [Open an issue](https://github.com/miguelalcalde/vercel-enhanced-cli/issues)
- 📖 **Documentation**: Check the [AGENTS.md](AGENTS.md) file for development guidelines
