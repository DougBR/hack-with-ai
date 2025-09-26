#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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

const SqlQuerySchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
});

class HttpMcpServer {
  private server: Server;
  private app: express.Application;

  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

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

  async run(port: number = 3001) {
    // Set up SSE endpoint
    this.app.get("/sse", (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });
      
      const transport = new SSEServerTransport("/sse", res);
      this.server.connect(transport);
    });

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({ status: "ok", server: "inkeep-sqlite-mcp-server" });
    });
    
    this.app.listen(port, () => {
      console.log(`MCP Server running on http://localhost:${port}`);
      console.log(`Connect your Inkeep agent to: http://localhost:${port}/sse`);
      console.log(`Health check available at: http://localhost:${port}/health`);
    });
  }
}

// Start the HTTP server
const server = new HttpMcpServer();
server.run(3001).catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
