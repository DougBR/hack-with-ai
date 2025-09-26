#!/bin/bash

# Start the Inkeep SQLite MCP Server
echo "Starting Inkeep SQLite MCP Server..."

# Ensure we're in the correct directory
cd "$(dirname "$0")"

# Build if needed
if [ ! -d "dist" ]; then
    echo "Building TypeScript..."
    pnpm build
fi

# Start the server
echo "MCP Server is running on stdio..."
echo "Connect your Inkeep agent to this server using the configuration in mcp-config.json"
node dist/index.js
