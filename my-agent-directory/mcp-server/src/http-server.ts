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
const etfDb = new Database("etf_data.db");

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
    // Enable CORS for all routes
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // MCP endpoint for POST requests (JSON-RPC over HTTP)
    this.app.post("/sse", async (req, res) => {
      try {
        res.header('Content-Type', 'application/json');
        
        // Handle MCP JSON-RPC request
        const request = req.body;
        let response;

        switch (request.method) {
          case 'initialize':
            response = {
              jsonrpc: "2.0",
              id: request.id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: { resources: {}, tools: {} },
                serverInfo: { name: "inkeep-sqlite-mcp-server", version: "1.0.0" }
              }
            };
            break;

          case 'tools/list':
            response = {
              jsonrpc: "2.0",
              id: request.id,
              result: {
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
                  {
                    name: "initialize_database",
                    description: "Initialize the database with proper schema and sample data",
                    inputSchema: {
                      type: "object",
                      properties: {
                        reset: {
                          type: "boolean",
                          description: "Whether to reset existing data (default: false)",
                        },
                      },
                    },
                  },
                  {
                    name: "get_all_users",
                    description: "Get all users from the database",
                    inputSchema: {
                      type: "object",
                      properties: {},
                    },
                  },
                  {
                    name: "delete_user",
                    description: "Delete a user from the database by ID",
                    inputSchema: {
                      type: "object",
                      properties: {
                        id: {
                          type: "number",
                          description: "ID of the user to delete",
                        },
                      },
                      required: ["id"],
                    },
                  },
                  {
                    name: "update_user",
                    description: "Update a user's name by ID",
                    inputSchema: {
                      type: "object",
                      properties: {
                        id: {
                          type: "number",
                          description: "ID of the user to update",
                        },
                        name: {
                          type: "string",
                          description: "New name for the user",
                        },
                      },
                      required: ["id", "name"],
                    },
                  },
                  {
                    name: "get_etfs_by_risk",
                    description: "Get ETFs filtered by risk rating (Low, Medium, High)",
                    inputSchema: {
                      type: "object",
                      properties: {
                        risk_rating: {
                          type: "string",
                          enum: ["Low", "Medium", "High"],
                          description: "Risk rating to filter by",
                        },
                        limit: {
                          type: "number",
                          description: "Maximum number of ETFs to return (default: 10)",
                        },
                      },
                      required: ["risk_rating"],
                    },
                  },
                  {
                    name: "search_etfs",
                    description: "Search ETFs by symbol or name",
                    inputSchema: {
                      type: "object",
                      properties: {
                        term: {
                          type: "string",
                          description: "Search term (symbol or name)",
                        },
                      },
                      required: ["term"],
                    },
                  },
                  {
                    name: "get_top_etfs",
                    description: "Get top ETFs sorted by AUM, volume, or price",
                    inputSchema: {
                      type: "object",
                      properties: {
                        limit: {
                          type: "number",
                          description: "Number of ETFs to return (default: 10)",
                        },
                        sort_by: {
                          type: "string",
                          enum: ["aum", "volume", "price"],
                          description: "Sort criteria (default: aum)",
                        },
                      },
                    },
                  },
                  {
                    name: "get_etf_advice",
                    description: "Get personalized ETF investment advice based on risk tolerance",
                    inputSchema: {
                      type: "object",
                      properties: {
                        risk_tolerance: {
                          type: "string",
                          enum: ["Low", "Medium", "High"],
                          description: "Investor's risk tolerance",
                        },
                        investment_amount: {
                          type: "number",
                          description: "Investment amount in USD (optional)",
                        },
                        investment_goal: {
                          type: "string",
                          description: "Investment goal (e.g., retirement, growth, income)",
                        },
                      },
                      required: ["risk_tolerance"],
                    },
                  },
                  {
                    name: "get_etf_summary",
                    description: "Get summary statistics of all ETFs by risk category",
                    inputSchema: {
                      type: "object",
                      properties: {},
                    },
                  },
                ],
              }
            };
            break;

          case 'tools/call':
            const { name, arguments: args } = request.params;
            let callResult;

            try {
              switch (name) {
                case "execute_sql": {
                  const query = args?.query as string;
                  if (!query?.trim().toLowerCase().startsWith("select")) {
                    throw new Error("Only SELECT queries are allowed for safety");
                  }
                  const result = db.prepare(query).all();
                  callResult = {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                  break;
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
                  callResult = {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                  break;
                }

                case "add_user": {
                  const name = args?.name as string;
                  if (!name) {
                    throw new Error("Name is required");
                  }
                  const stmt = db.prepare("INSERT INTO users (name) VALUES (?)");
                  const result = stmt.run(name);
                  callResult = {
                    content: [
                      {
                        type: "text",
                        text: `User '${name}' added successfully with ID: ${result.lastInsertRowid}`,
                      },
                    ],
                  };
                  break;
                }

                case "initialize_database": {
                  const reset = args?.reset as boolean || false;
                  
                  if (reset) {
                    // Clear existing data
                    db.exec("DELETE FROM users");
                    db.exec("DELETE FROM sqlite_sequence WHERE name='users'");
                  }
                  
                  // Add sample data if table is empty
                  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
                  if (userCount.count === 0) {
                    db.exec("INSERT INTO users (name) VALUES ('Alice'), ('Bob'), ('Charlie')");
                  }
                  
                  const finalCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
                  callResult = {
                    content: [
                      {
                        type: "text",
                        text: `Database initialized successfully. Total users: ${finalCount.count}`,
                      },
                    ],
                  };
                  break;
                }

                case "get_all_users": {
                  const users = db.prepare("SELECT * FROM users ORDER BY id").all();
                  callResult = {
                    content: [{ type: "text", text: JSON.stringify(users, null, 2) }],
                  };
                  break;
                }

                case "delete_user": {
                  const id = args?.id as number;
                  if (!id) {
                    throw new Error("ID is required");
                  }
                  
                  const stmt = db.prepare("DELETE FROM users WHERE id = ?");
                  const result = stmt.run(id);
                  
                  if (result.changes === 0) {
                    throw new Error(`No user found with ID: ${id}`);
                  }
                  
                  callResult = {
                    content: [
                      {
                        type: "text",
                        text: `User with ID ${id} deleted successfully`,
                      },
                    ],
                  };
                  break;
                }

                case "update_user": {
                  const id = args?.id as number;
                  const name = args?.name as string;
                  if (!id || !name) {
                    throw new Error("Both ID and name are required");
                  }
                  
                  const stmt = db.prepare("UPDATE users SET name = ? WHERE id = ?");
                  const result = stmt.run(name, id);
                  
                  if (result.changes === 0) {
                    throw new Error(`No user found with ID: ${id}`);
                  }
                  
                  callResult = {
                    content: [
                      {
                        type: "text",
                        text: `User with ID ${id} updated successfully to '${name}'`,
                      },
                    ],
                  };
                  break;
                }

                case "get_etfs_by_risk": {
                  const risk_rating = args?.risk_rating as string;
                  const limit = args?.limit as number || 10;
                  
                  if (!risk_rating || !['Low', 'Medium', 'High'].includes(risk_rating)) {
                    throw new Error("Valid risk_rating (Low, Medium, High) is required");
                  }
                  
                  const etfs = etfDb.prepare(`
                    SELECT * FROM etfs 
                    WHERE risk_rating = ? 
                    ORDER BY aum DESC 
                    LIMIT ?
                  `).all(risk_rating, limit);
                  
                  callResult = {
                    content: [{ type: "text", text: JSON.stringify(etfs, null, 2) }],
                  };
                  break;
                }

                case "search_etfs": {
                  const term = args?.term as string;
                  if (!term) {
                    throw new Error("Search term is required");
                  }
                  
                  const etfs = etfDb.prepare(`
                    SELECT * FROM etfs 
                    WHERE symbol LIKE ? OR name LIKE ? 
                    ORDER BY aum DESC
                  `).all(`%${term}%`, `%${term}%`);
                  
                  callResult = {
                    content: [{ type: "text", text: JSON.stringify(etfs, null, 2) }],
                  };
                  break;
                }

                case "get_top_etfs": {
                  const limit = args?.limit as number || 10;
                  const sort_by = args?.sort_by as string || 'aum';
                  
                  let orderBy = 'aum DESC';
                  if (sort_by === 'volume') orderBy = 'avg_daily_volume DESC';
                  if (sort_by === 'price') orderBy = 'current_price DESC';
                  
                  const etfs = etfDb.prepare(`
                    SELECT * FROM etfs 
                    ORDER BY ${orderBy}
                    LIMIT ?
                  `).all(limit);
                  
                  callResult = {
                    content: [{ type: "text", text: JSON.stringify(etfs, null, 2) }],
                  };
                  break;
                }

                case "get_etf_advice": {
                  const risk_tolerance = args?.risk_tolerance as string;
                  const investment_amount = args?.investment_amount as number;
                  const investment_goal = args?.investment_goal as string;
                  
                  if (!risk_tolerance || !['Low', 'Medium', 'High'].includes(risk_tolerance)) {
                    throw new Error("Valid risk_tolerance (Low, Medium, High) is required");
                  }
                  
                  // Get recommended ETFs based on risk tolerance
                  const recommendedETFs = etfDb.prepare(`
                    SELECT * FROM etfs 
                    WHERE risk_rating = ? 
                    ORDER BY aum DESC 
                    LIMIT 5
                  `).all(risk_tolerance);
                  
                  // Generate advice text
                  let advice = `Based on your ${risk_tolerance.toLowerCase()} risk tolerance, here are my recommendations:\n\n`;
                  
                  if (risk_tolerance === 'Low') {
                    advice += "For conservative investors, I recommend bond ETFs and dividend-focused funds that provide steady income with lower volatility.\n\n";
                  } else if (risk_tolerance === 'Medium') {
                    advice += "For moderate risk tolerance, broad market index funds and international diversification can provide balanced growth.\n\n";
                  } else {
                    advice += "For aggressive growth, consider technology, growth, and emerging market ETFs for higher potential returns.\n\n";
                  }
                  
                  advice += "Top recommendations:\n";
                  recommendedETFs.forEach((etf: any, index: number) => {
                    advice += `${index + 1}. ${etf.symbol} - ${etf.name}\n   Price: $${etf.current_price} | AUM: $${(etf.aum / 1000000).toFixed(0)}M\n`;
                  });
                  
                  if (investment_amount) {
                    advice += `\nWith your investment amount of $${investment_amount}, you could consider diversifying across 2-3 of these ETFs.`;
                  }
                  
                  if (investment_goal) {
                    advice += `\nFor your goal of ${investment_goal}, these ETFs align well with your objectives.`;
                  }
                  
                  callResult = {
                    content: [
                      { type: "text", text: advice },
                      { type: "text", text: `\nDetailed ETF Data:\n${JSON.stringify(recommendedETFs, null, 2)}` }
                    ],
                  };
                  break;
                }

                case "get_etf_summary": {
                  const summary = etfDb.prepare(`
                    SELECT 
                      risk_rating,
                      COUNT(*) as count,
                      ROUND(AVG(current_price), 2) as avg_price,
                      ROUND(SUM(aum) / 1000000, 0) as total_aum_millions,
                      ROUND(AVG(avg_daily_volume), 0) as avg_volume
                    FROM etfs 
                    GROUP BY risk_rating
                    ORDER BY total_aum_millions DESC
                  `).all();
                  
                  callResult = {
                    content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
                  };
                  break;
                }

                default:
                  throw new Error(`Unknown tool: ${name}`);
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              callResult = {
                content: [{ type: "text", text: `Error: ${errorMessage}` }],
                isError: true,
              };
            }

            response = {
              jsonrpc: "2.0",
              id: request.id,
              result: callResult
            };
            break;

          default:
            response = {
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32601, message: "Method not found" }
            };
        }

        res.json(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: { code: -32603, message: "Internal error", data: errorMessage }
        });
      }
    });

    // SSE endpoint for streaming (if needed)
    this.app.get("/sse", (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });
      
      res.write('data: {"type":"connection","status":"connected"}\n\n');
      
      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write('data: {"type":"ping"}\n\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
      });
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
