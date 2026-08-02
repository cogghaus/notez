# Claude Code Instructions for Notez

## ⛔ CRITICAL: Command Execution Rule
**NEVER chain bash commands with `&&` or `||`**

This is blocked by the deny list and will fail. Always run commands separately, one at a time.

```bash
# WRONG - will be blocked
git add . && git commit -m "message"

# CORRECT - run separately
git add .
git commit -m "message"
```

## ⛔ CRITICAL: Branch Protection Rule
**NEVER commit directly to the `main` branch.**
Always create a new branch for your changes.

```bash
# WRONG - will be blocked
git checkout main
git add .
git commit -m "message"

# CORRECT - create a new branch
git checkout -b feature/new-feature
git add .
git commit -m "message"
```

### Branch Protection
- All pushes to `main` are blocked
- All merges to `main` require PR approval

### Automated Enforcement

A pre-commit hook blocks commits made while `main` is checked out. It reaches this repo
through a two-stage dispatch, not through `.git/hooks/`:

- `core.hooksPath` is set **globally** to `G:/dev/_git-hooks`, so git ignores this repo's
  `.git/hooks/` directory entirely.
- `G:/dev/_git-hooks/pre-commit` is a dispatcher. It looks for
  `<repo root>/.githooks/pre-commit` and runs it when present.
- This repo's guard therefore lives at `.githooks/pre-commit` (committed), and runs via that
  dispatcher. It blocks any commit attempt on the default branch with an explanatory message.

**Never run `git config core.hooksPath .githooks` in this or any repo.** Setting `core.hooksPath`
locally *replaces* the global hooks directory rather than adding to it, which would silently
disable the global pre-push gitleaks secret scan. Repo-local hooks are already picked up by the
global dispatcher; there is nothing to install.

If the guard is not firing, the fix belongs in `G:/dev/_git-hooks/`, not in local git config.

### Branch Strategy

1. **ALWAYS check your current branch before committing code**
   - The pre-commit hook will block commits to main automatically
   - Still verify with: `git branch --show-current`
   - If you are on `main`, you MUST switch to a feature branch or create a new one

2. **Feature Branch Naming Convention**
   - Format: `feature/<description>` (e.g., `feature/auth-system`, `feature/note-editor`)
   - Format: `fix/<description>` for bug fixes
   - Format: `refactor/<description>` for refactoring
   - Use kebab-case for branch names

3. **Workflow**
   - Create a new feature branch from `main` for each feature/task
   - Make all commits to the feature branch
   - When feature is complete and tested, create a PR to merge into `main`
   - Delete feature branch after merge

4. **Before Every Commit**

   ```bash
   # ALWAYS run this first
   git branch --show-current

   # If output is "main", STOP and either:
   # - Switch to existing feature branch: git checkout feature/branch-name
   # - Create new feature branch: git checkout -b feature/new-feature-name
   ```

5. **Creating Pull Requests**
   - Use descriptive PR titles
   - Include summary of changes
   - Reference any related issues
   - Ensure CI/CD passes before requesting merge

## Project Context

- **Project Name:** Notez
- **Description:** Self-hosted web-based note-taking application with AI features
- **Architecture:** Monorepo (Node.js backend + React frontend)
- **Deployment:** Docker → ghcr.io → Docker Compose on the target host (`compose.prod.yml`)
- **Documentation:** See `/docs` folder for requirements and MVP spec

## Development Permissions

You have extensive autonomous permissions to:

- ✅ Create and manage feature branches
- ✅ Write, edit, and delete code files
- ✅ Create project structure and configuration files
- ✅ Install dependencies (npm/yarn packages)
- ✅ Run tests and builds
- ✅ Create and update documentation
- ✅ Initialize database schemas
- ✅ Create Docker configurations
- ✅ Set up CI/CD pipelines (GitHub Actions)
- ✅ Make architectural decisions aligned with MVP spec
- ✅ Refactor code for better quality
- ✅ Create pull requests when features are complete

## Restrictions

- ❌ **NEVER commit to main branch directly**
- ❌ Do not push to main without PR approval
- ❌ Do not delete main or protected branches
- ❌ Do not modify .git configuration without asking
- ❌ Do not run force push operations without explicit approval
- ❌ Do not expose secrets or API keys in code

## Code Quality Standards

- Use TypeScript for all new code (backend and frontend)
- Follow consistent code formatting (Prettier)
- Write meaningful commit messages
- Add comments for complex logic
- Keep functions small and focused
- Write tests for critical functionality
- Handle errors gracefully

## Project Structure

```text
/notez
├── backend/          # Fastify + TypeScript backend
├── frontend/         # React + TypeScript frontend
├── notez-mcp/        # MCP server published to npm
├── compose*.yml      # Compose files (dev, local, prod, test) live at the repo root
├── docs/             # Documentation
├── .github/          # GitHub Actions workflows
└── .claude/          # Claude instructions (this file)
```

## Working Process

1. **Plan** - Understand the task and create a todo list
2. **Branch** - Create or switch to appropriate feature branch
3. **Code** - Implement the feature
4. **Test** - Verify functionality
5. **Commit** - Commit to feature branch with clear message
6. **PR** - Create pull request when ready for main

## Communication

- Provide progress updates as you work
- Ask questions when requirements are unclear
- Suggest improvements when you see opportunities
- Flag potential issues or risks early

## Environment Notes (Windows)

- Use `ls` instead of `dir` for listing files (Git Bash compatibility)
- Use absolute paths when possible to avoid directory confusion
- Use forward slashes in paths (works in both PowerShell and Git Bash)

## References

- MVP Specification: `/docs/mvp-specification.md`
- Requirements: `/docs/requirements.md`

---

**Remember: CHECK YOUR BRANCH BEFORE EVERY COMMIT!**
