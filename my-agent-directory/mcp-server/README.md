# Inkeep SQLite MCP Server

A Model Context Protocol (MCP) server that provides SQLite database access for Inkeep agents.

## Features

- **Database Resources**: Access to database schema and table data
- **SQL Query Tool**: Execute SELECT queries safely
- **Table Information**: Get detailed table structure information
- **User Management**: Add new users to the database

## Installation

```bash
# Install dependencies
pnpm install

# Build the server
pnpm build

# Run in development mode
pnpm dev
```

## Available Tools

### 1. `execute_sql`
Execute SELECT queries on the SQLite database.
- **Input**: `query` (string) - SQL SELECT statement
- **Output**: Query results in JSON format

### 2. `get_table_info`
Get information about database tables and their structure.
- **Input**: `table_name` (optional string) - Specific table name
- **Output**: Table schema information

### 3. `add_user`
Add a new user to the database.
- **Input**: `name` (string) - User name
- **Output**: Success message with new user ID

## Available Resources

### 1. `sqlite://demo.db/schema`
Database schema information including all tables and their SQL definitions.

### 2. `sqlite://demo.db/users`
Complete list of all users in the database.

## Usage with Inkeep Agents

To connect this MCP server to your Inkeep agents, you'll need to configure it in your agent's MCP client settings. The server runs on stdio transport.

## Safety Features

- Only SELECT queries are allowed through `execute_sql` for data safety
- Input validation using Zod schemas
- Error handling with descriptive messages

## Database

The server connects to `../../demo.db` (relative to the server location) and automatically:
- Creates a `users` table if it doesn't exist
- Populates it with sample data (Alice, Bob, Charlie) if empty
