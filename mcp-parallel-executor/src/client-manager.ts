import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ServerConfig } from "./config.js";

export class ClientManager {
  private clients: Map<string, Client>;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.clients = new Map();
  }

  /**
   * Gets an active client for the specified server name.
   * Connects if not already connected.
   */
  async getClient(serverName: string): Promise<Client> {
    if (this.clients.has(serverName)) {
      return this.clients.get(serverName)!;
    }

    const serverDef = this.config.servers[serverName];
    if (!serverDef) {
      throw new Error(`Server '${serverName}' not defined in configuration.`);
    }

    const transport = new StdioClientTransport({
      command: serverDef.command,
      args: serverDef.args,
      env: { ...process.env, ...serverDef.env },
    });

    const client = new Client(
      {
        name: "parallel-executor-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await client.connect(transport);
      this.clients.set(serverName, client);
      return client;
    } catch (error) {
      throw new Error(`Failed to connect to server '${serverName}': ${error}`);
    }
  }

  /**
   * Closes all connections.
   */
  async closeAll() {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
      } catch (e) {
        console.error(`Error closing client ${name}:`, e);
      }
    }
    this.clients.clear();
  }
}
