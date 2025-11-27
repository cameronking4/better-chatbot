import { readFileSync, readdirSync } from "fs";
import { join } from "path";

interface WorkflowValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface WorkflowConfig {
  name?: string;
  on?: any;
  jobs?: Record<string, any>;
}

function validateWorkflowFile(filePath: string): WorkflowValidationResult {
  const result: WorkflowValidationResult = {
    file: filePath,
    valid: true,
    errors: [],
    warnings: [],
  };

  try {
    const content = readFileSync(filePath, "utf-8");

    // Basic YAML syntax check - look for common issues
    if (!content.trim()) {
      result.errors.push("File is empty");
      result.valid = false;
      return result;
    }

    // Parse as simple key-value for basic validation
    const lines = content.split("\n");
    let workflow: WorkflowConfig = {};

    // Extract basic structure without full YAML parsing
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    if (nameMatch) {
      workflow.name = nameMatch[1].trim();
    } else {
      result.warnings.push("Workflow name not specified");
    }

    // Check for 'on:' trigger
    if (!content.includes("on:") && !content.includes("on ")) {
      result.errors.push("Missing 'on:' trigger configuration");
      result.valid = false;
    }

    // Check for jobs
    if (!content.includes("jobs:")) {
      result.errors.push("Missing 'jobs:' section");
      result.valid = false;
    }

    // Validate Claude workflow specific requirements
    if (filePath.includes("claude.yml")) {
      // Check for required permissions
      const requiredPermissions = [
        "contents: read",
        "pull-requests: read",
        "issues: read",
      ];

      for (const perm of requiredPermissions) {
        if (!content.includes(perm)) {
          result.warnings.push(`Missing recommended permission: ${perm}`);
        }
      }

      // Check for anthropic_api_key
      if (!content.includes("anthropic_api_key")) {
        result.errors.push(
          "Claude workflow missing 'anthropic_api_key' configuration",
        );
        result.valid = false;
      }

      // Check for @claude trigger condition
      if (!content.includes("@claude")) {
        result.warnings.push(
          "Claude workflow may be missing @claude trigger condition",
        );
      }
    }

    // Check for common misconfigurations
    if (content.includes("on: push") && content.includes("branches: [main]")) {
      result.warnings.push(
        "Workflow triggers on push to main - ensure this is intentional",
      );
    }

    // Check for proper indentation (basic check)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() && !line.startsWith("#")) {
        const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
        if (leadingSpaces % 2 !== 0) {
          result.warnings.push(
            `Line ${i + 1}: Inconsistent indentation (should be multiples of 2)`,
          );
        }
      }
    }

  } catch (error: any) {
    result.errors.push(`Failed to read or parse file: ${error.message}`);
    result.valid = false;
  }

  return result;
}

function main() {
  console.log("🔍 GitHub Workflows Verification\n");
  console.log("=" .repeat(60));

  const workflowsDir = join(process.cwd(), ".github", "workflows");
  let allValid = true;
  const results: WorkflowValidationResult[] = [];

  try {
    const files = readdirSync(workflowsDir).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    );

    if (files.length === 0) {
      console.error("❌ No workflow files found in .github/workflows/");
      process.exit(1);
    }

    console.log(`Found ${files.length} workflow file(s)\n`);

    for (const file of files) {
      const filePath = join(workflowsDir, file);
      const result = validateWorkflowFile(filePath);
      results.push(result);

      if (!result.valid) {
        allValid = false;
      }
    }

    // Print results
    for (const result of results) {
      const status = result.valid ? "✅" : "❌";
      console.log(`${status} ${result.file}`);

      if (result.errors.length > 0) {
        console.log("  Errors:");
        for (const error of result.errors) {
          console.log(`    - ${error}`);
        }
      }

      if (result.warnings.length > 0) {
        console.log("  Warnings:");
        for (const warning of result.warnings) {
          console.log(`    - ${warning}`);
        }
      }

      console.log();
    }

    // Summary
    console.log("=" .repeat(60));
    const validCount = results.filter((r) => r.valid).length;
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce(
      (sum, r) => sum + r.warnings.length,
      0,
    );

    console.log(`\n📊 Summary:`);
    console.log(`  Total workflows: ${results.length}`);
    console.log(`  Valid: ${validCount}`);
    console.log(`  Invalid: ${results.length - validCount}`);
    console.log(`  Total errors: ${totalErrors}`);
    console.log(`  Total warnings: ${totalWarnings}`);

    if (allValid) {
      console.log("\n✅ All workflows passed validation!");
      process.exit(0);
    } else {
      console.log("\n❌ Some workflows failed validation.");
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ Failed to verify workflows: ${error.message}`);
    process.exit(1);
  }
}

main();
