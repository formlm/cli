#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args[0] === 'mcp') {
  const { startMcpServer } = await import(join(__dirname, '..', 'dist', 'mcp.js'));
  await startMcpServer();
} else {
  await import(join(__dirname, '..', 'dist', 'index.js'));
}
