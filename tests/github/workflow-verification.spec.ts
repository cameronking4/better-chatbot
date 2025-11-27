import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

test.describe("GitHub Workflow Verification", () => {
  const workflowsDir = join(process.cwd(), ".github", "workflows");

  test("should have Claude workflow file", () => {
    const claudeWorkflowPath = join(workflowsDir, "claude.yml");
    expect(existsSync(claudeWorkflowPath)).toBe(true);
  });

  test("Claude workflow should have correct triggers", () => {
    const claudeWorkflowPath = join(workflowsDir, "claude.yml");
    const content = readFileSync(claudeWorkflowPath, "utf-8");

    // Check for issue_comment trigger
    expect(content).toContain("issue_comment:");
    expect(content).toContain("types: [created]");

    // Check for pull_request_review_comment trigger
    expect(content).toContain("pull_request_review_comment:");

    // Check for issues trigger
    expect(content).toContain("issues:");
    expect(content).toContain("types: [opened, assigned]");

    // Check for pull_request_review trigger
    expect(content).toContain("pull_request_review:");
    expect(content).toContain("types: [submitted]");
  });

  test("Claude workflow should have @claude trigger condition", () => {
    const claudeWorkflowPath = join(workflowsDir, "claude.yml");
    const content = readFileSync(claudeWorkflowPath, "utf-8");

    // Should check for @claude in comments
    expect(content).toContain("@claude");
    expect(content).toContain("contains(");
  });

  test("Claude workflow should have required permissions", () => {
    const claudeWorkflowPath = join(workflowsDir, "claude.yml");
    const content = readFileSync(claudeWorkflowPath, "utf-8");

    // Check for essential permissions
    expect(content).toContain("contents: read");
    expect(content).toContain("pull-requests: read");
    expect(content).toContain("issues: read");
    expect(content).toContain("id-token: write");
  });

  test("Claude workflow should use anthropics/claude-code-action", () => {
    const claudeWorkflowPath = join(workflowsDir, "claude.yml");
    const content = readFileSync(claudeWorkflowPath, "utf-8");

    expect(content).toContain("uses: anthropics/claude-code-action@");
    expect(content).toContain("anthropic_api_key:");
  });

  test("should have repository documentation files", () => {
    // Check for essential documentation
    expect(existsSync(join(process.cwd(), "README.md"))).toBe(true);
    expect(existsSync(join(process.cwd(), "CONTRIBUTING.md"))).toBe(true);
    expect(existsSync(join(process.cwd(), "AGENTS.md"))).toBe(true);
    expect(existsSync(join(process.cwd(), "github_tools_and_agents.md"))).toBe(
      true,
    );
  });

  test("github_tools_and_agents.md should document Claude agent", () => {
    const agentsDocPath = join(process.cwd(), "github_tools_and_agents.md");
    const content = readFileSync(agentsDocPath, "utf-8");

    // Should mention Claude agent
    expect(content.toLowerCase()).toContain("claude");
    expect(content.toLowerCase()).toContain("agent");

    // Should mention key capabilities
    expect(content.toLowerCase()).toContain("issue");
    expect(content.toLowerCase()).toContain("pull request");
  });

  test("AGENTS.md should have repository guidelines", () => {
    const agentsPath = join(process.cwd(), "AGENTS.md");
    const content = readFileSync(agentsPath, "utf-8");

    // Should have structure guidelines
    expect(content).toContain("src");

    // Should have testing guidelines
    expect(content.toLowerCase()).toContain("test");

    // Should have commit guidelines
    expect(content.toLowerCase()).toContain("commit");
  });

  test("should have CI/CD workflows for quality checks", () => {
    // Check for essential CI workflows
    expect(existsSync(join(workflowsDir, "lint-and-type-check.yml"))).toBe(
      true,
    );
    expect(existsSync(join(workflowsDir, "e2e-tests.yml"))).toBe(true);
    expect(existsSync(join(workflowsDir, "pr-check.yml"))).toBe(true);
  });

  test("package.json should have workflow verification script", () => {
    const packageJsonPath = join(process.cwd(), "package.json");
    const content = readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);

    // Should have the verify-workflows script
    expect(packageJson.scripts).toHaveProperty("verify:workflows");
  });
});

test.describe("Workflow Integration Tests", () => {
  test("should validate workflow files pass verification", async () => {
    // This test runs the verification script and checks exit code
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execPromise = promisify(exec);

    try {
      const { stdout, stderr } = await execPromise("pnpm verify:workflows");
      expect(stdout).toContain("All workflows passed validation");
    } catch (error: any) {
      // If verification fails, the error will contain the output
      console.error("Workflow verification failed:", error.stdout || error.message);
      throw error;
    }
  });
});
