#!/usr/bin/env node

// Test script to verify MCP server tools work correctly
import { spawn } from 'child_process';

console.log('🧪 Testing MCP Server Tools...\n');

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let testResults = [];

// Test 1: Initialize
const sendMessage = (message) => {
  return new Promise((resolve) => {
    const messageStr = JSON.stringify(message) + '\n';
    server.stdin.write(messageStr);
    
    setTimeout(() => {
      resolve();
    }, 500);
  });
};

let output = '';
server.stdout.on('data', (data) => {
  output += data.toString();
});

server.stderr.on('data', (data) => {
  console.log('Server ready:', data.toString().trim());
});

// Run tests
setTimeout(async () => {
  console.log('1️⃣ Testing initialization...');
  await sendMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    }
  });

  console.log('2️⃣ Testing list tools...');
  await sendMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });

  console.log('3️⃣ Testing execute_sql tool...');
  await sendMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "execute_sql",
      arguments: {
        query: "SELECT * FROM users LIMIT 3"
      }
    }
  });

  console.log('4️⃣ Testing get_table_info tool...');
  await sendMessage({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "get_table_info",
      arguments: {
        table_name: "users"
      }
    }
  });

  setTimeout(() => {
    console.log('\n📊 Test Results:');
    console.log(output);
    console.log('\n✅ MCP Server tools test completed!');
    server.kill();
    process.exit(0);
  }, 2000);
}, 1000);

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});
