#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { z } from "zod";

// Database setup
const db = new Database("../../demo.db");

// Ensure demo table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  )
`);

// Insert sample data if table is empty
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
if (userCount.count === 0) {
  db.exec("INSERT INTO users (name) VALUES ('Alice'), ('Bob'), ('Charlie')");
}

// Schema for SQL query validation
const SqlQuerySchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
});

class SqliteMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "inkeep-sqlite-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "sqlite://demo.db/schema",
            name: "Database Schema",
            description: "Schema information for the demo database",
            mimeType: "application/json",
          },
          {
            uri: "sqlite://demo.db/users",
            name: "Users Table",
            description: "All users in the database",
            mimeType: "application/json",
          },
        ],
      };
    });

    // Read specific resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === "sqlite://demo.db/schema") {
        // Get table schema information
        const tables = db.prepare(`
          SELECT name, sql 
          FROM sqlite_master 
          WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `).all();

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(tables, null, 2),
            },
          ],
        };
      }

      if (uri === "sqlite://demo.db/users") {
        const users = db.prepare("SELECT * FROM users").all();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(users, null, 2),
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "execute_sql",
            description: "Execute a SQL query on the SQLite database",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "SQL query to execute (SELECT statements only for safety)",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "get_table_info",
            description: "Get information about database tables and their structure",
            inputSchema: {
              type: "object",
              properties: {
                table_name: {
                  type: "string",
                  description: "Name of the table to get info for (optional - if not provided, returns all tables)",
                },
              },
            },
          },
          {
            name: "add_user",
            description: "Add a new user to the database",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Name of the user to add",
                },
              },
              required: ["name"],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "execute_sql": {
            const { query } = SqlQuerySchema.parse(args);
            
            // Only allow SELECT statements for safety
            if (!query.trim().toLowerCase().startsWith("select")) {
              throw new Error("Only SELECT queries are allowed for safety");
            }

            const result = db.prepare(query).all();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "get_table_info": {
            const tableName = args?.table_name as string | undefined;
            
            let query: string;
            if (tableName) {
              query = `PRAGMA table_info(${tableName})`;
            } else {
              query = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`;
            }

            const result = db.prepare(query).all();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "add_user": {
            const name = args?.name as string;
            if (!name) {
              throw new Error("Name is required");
            }

            const stmt = db.prepare("INSERT INTO users (name) VALUES (?)");
            const result = stmt.run(name);
            
            return {
              content: [
                {
                  type: "text",
                  text: `User '${name}' added successfully with ID: ${result.lastInsertRowid}`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Inkeep SQLite MCP Server running on stdio");
  }
}

// Start the server
const server = new SqliteMcpServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
