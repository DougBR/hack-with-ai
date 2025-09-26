import { weatherGraph } from './graphs/weather-assistant.ts';
import { weatherIntermediateGraph } from './graphs/weather-intermediate.ts';
import databaseAgent from './graphs/database-agent.graph.ts';
import { project } from '@inkeep/agents-sdk';

export const myProject = project({
  id: 'weather-project',
  name: 'Weather Project',
  description: 'Weather project template with database integration',
  graphs: () => [weatherGraph, weatherIntermediateGraph, databaseAgent],
});