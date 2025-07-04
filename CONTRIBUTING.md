# Contributing to Chia Blockchain TypeScript Client

Thank you for your interest in contributing to the Chia Blockchain TypeScript Client! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [CI/CD Pipeline](#cicd-pipeline)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please be respectful and professional in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/chia-blockchain-client.git`
3. Add upstream remote: `git remote add upstream https://github.com/your-org/chia-blockchain-client.git`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn
- Git

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

## Making Changes

1. **Create a feature branch** from `develop`:
   ```bash
   git checkout develop
   git pull upstream develop
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards:
   - Write TypeScript with strict mode enabled
   - Follow ESLint rules
   - Add JSDoc comments for public APIs
   - Write unit tests for new functionality
   - Keep functions small and focused

3. **Test your changes**:
   ```bash
   npm test
   npm run lint
   npm run build
   ```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Place unit tests in `tests/unit/`
- Place integration tests in `tests/integration/`
- Use descriptive test names
- Test both success and error cases
- Aim for >90% code coverage

Example test:
```typescript
describe('BlockRepository', () => {
  it('should save a block successfully', async () => {
    // Arrange
    const block = createMockBlock();
    
    // Act
    const savedBlock = await repository.saveBlock(block);
    
    // Assert
    expect(savedBlock).toBeDefined();
    expect(savedBlock.height).toBe(block.height);
  });
});
```

## CI/CD Pipeline

Our CI/CD pipeline automatically runs on every push and pull request. Understanding the pipeline helps ensure your contributions pass all checks.

### GitHub Actions Workflows

1. **CI Workflow** (`ci.yml`)
   - Runs on: Push to main/develop, Pull requests
   - Tests on multiple Node.js versions (16.x, 18.x, 20.x)
   - Tests on multiple OS (Ubuntu, Windows, macOS)
   - Runs linting, tests, and builds
   - Generates test coverage reports

2. **Code Quality** (`code-quality.yml`)
   - Checks TypeScript strict mode
   - Scans for console.log statements
   - Analyzes code complexity
   - Checks for circular dependencies
   - Validates bundle size

3. **Security Audit** (`ci.yml`)
   - Runs npm audit
   - Checks for vulnerabilities
   - Validates dependency licenses

4. **Status Check** (`status-check.yml`)
   - Validates commit messages
   - Checks PR title format
   - Adds appropriate labels
   - Checks for merge conflicts

### Required Checks

All pull requests must pass these checks:
- ✅ All tests pass
- ✅ No linting errors
- ✅ Build succeeds
- ✅ No high/critical vulnerabilities
- ✅ Commit messages follow convention
- ✅ No merge conflicts

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions or modifications
- `chore`: Build process or auxiliary tool changes
- `ci`: CI configuration changes

### Examples
```bash
feat(protocol): add support for new message types
fix(cache): resolve memory leak in block caching
docs(readme): update installation instructions
test(events): add unit tests for event emitter
```

## Pull Request Process

1. **Before Opening a PR**:
   - Ensure all tests pass locally
   - Run linter and fix any issues
   - Update documentation if needed
   - Add tests for new functionality
   - Rebase on latest develop branch

2. **PR Title Format**:
   Follow the same format as commit messages:
   ```
   feat(core): add multi-peer connection support
   ```

3. **PR Description**:
   Use the PR template and include:
   - Description of changes
   - Related issues
   - Testing performed
   - Screenshots (if UI changes)

4. **Review Process**:
   - CI checks must pass
   - At least one maintainer approval required
   - Address review feedback promptly
   - Keep PR focused and reasonably sized

5. **After Merge**:
   - Delete your feature branch
   - Pull latest changes to your local develop

## Debugging CI Failures

If your PR fails CI checks:

1. **Check the GitHub Actions tab** for detailed logs
2. **Common issues and fixes**:
   - **Test failures**: Run tests locally with `npm test`
   - **Lint errors**: Run `npm run lint:fix`
   - **Build errors**: Check TypeScript errors with `npm run build`
   - **Security audit**: Run `npm audit fix`

3. **Running CI checks locally**:
   ```bash
   # Simulate CI environment
   npm ci
   npm run lint
   npm run build
   npm test
   npm audit
   ```

## Release Process

Releases are automated through GitHub Actions:

1. Maintainers create a release tag: `v1.2.3`
2. CI automatically:
   - Runs all tests
   - Builds the project
   - Publishes to npm
   - Creates GitHub release
   - Generates changelog

## Questions?

- Open an issue for bugs or feature requests
- Join our Discord for discussions
- Check existing issues before creating new ones

Thank you for contributing to the Chia Blockchain TypeScript Client! 🌱