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

// Database setup with enhanced initialization
const db = new Database("../../demo.db");
const etfDb = new Database("etf_data.db");

// Enhanced database initialization function
function ensureUsersTable() {
  // Check if the users table exists
  const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
  if (tbl.length === 0) {
    // Fresh create with desired constraints
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    return;
  }

  // Inspect existing table schema
  const info = db.prepare("PRAGMA table_info('users')").all() as any[];
  const idCol = info.find((c: any) => c.name === 'id');
  const nameCol = info.find((c: any) => c.name === 'name');
  const idIsPk = idCol && (idCol as any).pk === 1;
  const nameNotNull = nameCol && (nameCol as any).notnull === 1;

  // If schema already matches, nothing to do
  if (idIsPk && nameNotNull) return;

  // Otherwise migrate: create new table with correct schema, copy data, replace
  console.log('Migrating users table to add PRIMARY KEY / NOT NULL constraints');
  db.exec('BEGIN TRANSACTION');
  db.exec('CREATE TABLE IF NOT EXISTS users_new (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  // Preserve existing data; replace NULL names with 'Unknown' to satisfy NOT NULL
  db.prepare("INSERT OR IGNORE INTO users_new (id, name) SELECT id, COALESCE(name, 'Unknown') FROM users").run();
  db.exec('DROP TABLE users');
  db.exec("ALTER TABLE users_new RENAME TO users");
  db.exec('COMMIT');
}

// Initialize database
ensureUsersTable();

// Validation schemas
const SqlQuerySchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
});

const AddUserSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
});

const DeleteUserSchema = z.object({
  id: z.number().int().positive("ID must be a positive integer"),
});

const UpdateUserSchema = z.object({
  id: z.number().int().positive("ID must be a positive integer"),
  name: z.string().min(1, "Name cannot be empty"),
});

const InitializeDatabaseSchema = z.object({
  reset: z.boolean().optional(),
});

// ETF-specific schemas
const GetETFsByRiskSchema = z.object({
  risk_rating: z.enum(['Low', 'Medium', 'High']),
  limit: z.number().int().positive().optional(),
});

const SearchETFsSchema = z.object({
  term: z.string().min(1, "Search term cannot be empty"),
});

const GetTopETFsSchema = z.object({
  limit: z.number().int().positive().optional(),
  sort_by: z.enum(['aum', 'volume', 'price']).optional(),
});

const GetETFAdviceSchema = z.object({
  risk_tolerance: z.enum(['Low', 'Medium', 'High']),
  investment_amount: z.number().positive().optional(),
  investment_goal: z.string().optional(),
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
          {
            uri: "sqlite://etf_data.db/etfs",
            name: "ETF Database",
            description: "All ETF data with risk ratings and performance metrics",
            mimeType: "application/json",
          },
          {
            uri: "sqlite://etf_data.db/risk_summary",
            name: "ETF Risk Summary",
            description: "Summary statistics by risk rating",
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

      if (uri === "sqlite://etf_data.db/etfs") {
        const etfs = etfDb.prepare("SELECT * FROM etfs ORDER BY aum DESC LIMIT 20").all();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(etfs, null, 2),
            },
          ],
        };
      }

      if (uri === "sqlite://etf_data.db/risk_summary") {
        const summary = etfDb.prepare(`
          SELECT 
            risk_rating,
            COUNT(*) as count,
            AVG(current_price) as avg_price,
            SUM(aum) as total_aum,
            AVG(avg_daily_volume) as avg_volume
          FROM etfs 
          GROUP BY risk_rating
          ORDER BY total_aum DESC
        `).all();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(summary, null, 2),
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
            const { name } = AddUserSchema.parse(args);
            
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

          case "initialize_database": {
            const { reset = false } = InitializeDatabaseSchema.parse(args || {});
            
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
            return {
              content: [
                {
                  type: "text",
                  text: `Database initialized successfully. Total users: ${finalCount.count}`,
                },
              ],
            };
          }

          case "get_all_users": {
            const users = db.prepare("SELECT * FROM users ORDER BY id").all();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(users, null, 2),
                },
              ],
            };
          }

          case "delete_user": {
            const { id } = DeleteUserSchema.parse(args);
            
            const stmt = db.prepare("DELETE FROM users WHERE id = ?");
            const result = stmt.run(id);
            
            if (result.changes === 0) {
              throw new Error(`No user found with ID: ${id}`);
            }
            
            return {
              content: [
                {
                  type: "text",
                  text: `User with ID ${id} deleted successfully`,
                },
              ],
            };
          }

          case "update_user": {
            const { id, name } = UpdateUserSchema.parse(args);
            
            const stmt = db.prepare("UPDATE users SET name = ? WHERE id = ?");
            const result = stmt.run(name, id);
            
            if (result.changes === 0) {
              throw new Error(`No user found with ID: ${id}`);
            }
            
            return {
              content: [
                {
                  type: "text",
                  text: `User with ID ${id} updated successfully to '${name}'`,
                },
              ],
            };
          }

          case "get_etfs_by_risk": {
            const { risk_rating, limit = 10 } = GetETFsByRiskSchema.parse(args);
            
            const etfs = etfDb.prepare(`
              SELECT * FROM etfs 
              WHERE risk_rating = ? 
              ORDER BY aum DESC 
              LIMIT ?
            `).all(risk_rating, limit);
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(etfs, null, 2),
                },
              ],
            };
          }

          case "search_etfs": {
            const { term } = SearchETFsSchema.parse(args);
            
            const etfs = etfDb.prepare(`
              SELECT * FROM etfs 
              WHERE symbol LIKE ? OR name LIKE ? 
              ORDER BY aum DESC
            `).all(`%${term}%`, `%${term}%`);
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(etfs, null, 2),
                },
              ],
            };
          }

          case "get_top_etfs": {
            const { limit = 10, sort_by = 'aum' } = GetTopETFsSchema.parse(args || {});
            
            let orderBy = 'aum DESC';
            if (sort_by === 'volume') orderBy = 'avg_daily_volume DESC';
            if (sort_by === 'price') orderBy = 'current_price DESC';
            
            const etfs = etfDb.prepare(`
              SELECT * FROM etfs 
              ORDER BY ${orderBy}
              LIMIT ?
            `).all(limit);
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(etfs, null, 2),
                },
              ],
            };
          }

          case "get_etf_advice": {
            const { risk_tolerance, investment_amount, investment_goal } = GetETFAdviceSchema.parse(args);
            
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
            
            return {
              content: [
                {
                  type: "text",
                  text: advice,
                },
                {
                  type: "text",
                  text: `\nDetailed ETF Data:\n${JSON.stringify(recommendedETFs, null, 2)}`,
                },
              ],
            };
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
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(summary, null, 2),
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

const server = new SqliteMcpServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
