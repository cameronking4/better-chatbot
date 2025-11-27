# GitHub Projects Manager Agent – Tools & Agents Overview

## Agents
### 1. GitHub Projects Manager Agent
- Role: Expert manager for project boards, issues, PRs, roadmap planning, and project automations on GitHub.

### 2. Claude (Actionable AI Agent)
- Role: Acts on technical issue completion. Handles PR creation, design specs, implementation summaries, and research hand-off when prompted.

## Tooling (APIs/Functions)
### Issue Management
- Create, update, close, label, assign, and comment on issues.

### Pull Requests
- Create, update, comment, review, and merge pull requests, including requesting reviews.

### Project Board Management
- Add issues to projects, update project progress/status, and manage columns/rows for workflow automation.

### Repository & Branch Management
- Create branches, update files, manage releases and tags, push/pull files directly.

### Search Functions
- Search across issues, PRs, repositories, users, or code with advanced filters.

### Automations
- Assign Copilot/Claude to tasks, integrate CI/build status, and coordinate dependent actions efficiently.

### Multi-Tool Coordination
- Execute actions in parallel (e.g., multiple issues/PRs or status/project updates together).

---

This agent ensures end-to-end management and automation for GitHub development projects, enabling seamless handoffs to Claude for implementation and continuous project visibility for stakeholders like you, Cameron King.

## Workflow Verification

### Overview
The repository includes automated workflow verification to ensure GitHub Actions configurations remain valid and properly configured.

### Running Verification

**Locally:**
```bash
pnpm verify:workflows
```

**In CI/CD:**
The workflow verification is integrated into the PR check pipeline to catch configuration issues before they reach production.

### What Gets Verified

1. **Workflow Syntax**
   - YAML syntax validation
   - Proper indentation
   - Required sections (name, on, jobs)

2. **Claude Workflow Requirements**
   - Correct trigger conditions (@claude mentions)
   - Required permissions (contents, pull-requests, issues, id-token)
   - Anthropic API key configuration
   - Trigger events (issue_comment, pull_request_review_comment, etc.)

3. **Common Misconfigurations**
   - Missing permissions
   - Incorrect trigger conditions
   - Indentation issues
   - Missing required configuration

### E2E Tests

The `tests/github/workflow-verification.spec.ts` file contains comprehensive tests that verify:
- Workflow files exist and are properly configured
- Documentation files are present
- Repository follows best practices
- Scripts are available in package.json

Run tests:
```bash
pnpm test:e2e tests/github/workflow-verification.spec.ts
```

### Troubleshooting

**Workflow not triggering:**
1. Verify @claude is mentioned in issue/PR comment
2. Check workflow permissions in repository settings
3. Ensure ANTHROPIC_API_KEY secret is configured
4. Review workflow conditions in `.github/workflows/claude.yml`

**Verification script fails:**
1. Run `pnpm verify:workflows` to see detailed errors
2. Check YAML syntax and indentation
3. Ensure all required fields are present
4. Review error messages for specific issues

**Linear integration:**
- Issues automatically sync with Linear when properly configured
- Check for Linear bot comments on issues
- Verify Linear integration in repository settings
