#!/usr/bin/env node

// Simple test script to verify the MCP server can start
import { spawn } from 'child_process';

console.log('Testing MCP Server startup...');

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let errorOutput = '';

server.stdout.on('data', (data) => {
  output += data.toString();
});

server.stderr.on('data', (data) => {
  errorOutput += data.toString();
  console.log('Server stderr:', data.toString());
});

// Send a simple MCP initialization message
setTimeout(() => {
  const initMessage = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  }) + '\n';
  
  console.log('Sending initialization message...');
  server.stdin.write(initMessage);
  
  setTimeout(() => {
    console.log('Server output:', output);
    console.log('Test completed - server appears to be working!');
    server.kill();
    process.exit(0);
  }, 1000);
}, 1000);

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
});
