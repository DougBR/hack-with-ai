# Integrating MCP Server with Inkeep Agents

## Quick Start

Your MCP server is ready to connect to Inkeep agents! Here's how to integrate it:

### 1. Start the MCP Server

```bash
# From the mcp-server directory
./start-mcp-server.sh

# Or manually:
node dist/index.js
```

### 2. Configure Your Inkeep Agent

Add the MCP server configuration to your agent's MCP client settings. The server provides:

#### Available Tools:
- **`execute_sql`**: Run SELECT queries on the SQLite database
- **`get_table_info`**: Get database schema information
- **`add_user`**: Add new users to the database

#### Available Resources:
- **`sqlite://demo.db/schema`**: Database schema information
- **`sqlite://demo.db/users`**: All users in the database

### 3. Example Agent Integration

Create a new agent graph that uses the MCP server:

```typescript
// In your agent graph file (e.g., src/your-project/graphs/database-agent.graph.ts)
import { defineGraph } from '@inkeep/agents-core';

export default defineGraph({
  name: 'database-agent',
  description: 'Agent that can interact with SQLite database via MCP',
  
  // Configure MCP connection
  mcpServers: {
    'sqlite-db': {
      command: 'node',
      args: ['../../mcp-server/dist/index.js'],
      cwd: process.cwd()
    }
  },

  // Your agent logic here
  nodes: {
    // Add nodes that use the MCP tools
  }
});
```

### 4. Testing the Connection

You can test the MCP server manually:

```bash
# Test server startup
cd mcp-server
node test-server.js
```

### 5. Available Database Operations

The MCP server connects to `../../demo.db` and provides these operations:

#### Query Users
```sql
SELECT * FROM users;
```

#### Get Table Schema
```sql
PRAGMA table_info(users);
```

#### Add New User
Use the `add_user` tool with a name parameter.

## Database Structure

The demo database includes:
- **users** table with `id` (INTEGER) and `name` (TEXT) columns
- Sample data: Alice, Bob, Charlie

## Security Notes

- Only SELECT queries are allowed through `execute_sql` for safety
- All inputs are validated using Zod schemas
- Error handling prevents SQL injection

## Troubleshooting

1. **Server won't start**: Ensure dependencies are installed with `pnpm install`
2. **Database errors**: Check that `../../demo.db` exists and is accessible
3. **Connection issues**: Verify the MCP client configuration matches the server setup

## Next Steps

1. Create custom agent graphs that leverage the database tools
2. Extend the MCP server with additional database operations
3. Connect to other databases (finance API SQLite, etc.)
4. Add more sophisticated query capabilities
