import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

// Schema for defining downstream servers
export const ServerConfigSchema = z.object({
  servers: z.record(
    z.object({
      command: z.string(),
      args: z.array(z.string()).default([]),
      env: z.record(z.string()).optional(),
    }),
  ),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export function loadConfig(): ServerConfig {
  const configPath =
    process.env.PARALLEL_EXECUTOR_CONFIG ||
    path.join(process.cwd(), "servers.json");

  if (!fs.existsSync(configPath)) {
    console.error(`Configuration file not found at ${configPath}`);
    console.error(
      "Please create a servers.json file defining your downstream servers.",
    );
    process.exit(1);
  }

  try {
    const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return ServerConfigSchema.parse(rawConfig);
  } catch (error) {
    console.error("Failed to parse configuration:", error);
    process.exit(1);
  }
}
