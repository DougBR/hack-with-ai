import { defineConfig } from '@inkeep/agents-cli/config';

  const config = defineConfig({
    tenantId: "default",
    projectId: "weather-project",
    agentsManageApiUrl: 'http://localhost:3002',
    agentsRunApiUrl: 'http://localhost:3003',
    modelSettings: {
  "base": {
    "model": "google/gemini-2.5-flash"
  },
  "structuredOutput": {
    "model": "google/gemini-2.5-flash-lite"
  },
  "summarizer": {
    "model": "google/gemini-2.5-flash-lite"
  }
},
  });
      
  export default config;