#!/usr/bin/env node

/**
 * CLI Wrapper - Handles npm argument passing correctly
 * This ensures all arguments are passed directly to the CLI
 */

const { spawn } = require('child_process')
const path = require('path')

// Get all arguments (everything after the script name)
// npm passes: ['cli-wrapper.cjs', 'process', '--input', ...]
const args = process.argv.slice(2)

// Spawn the CLI with all arguments
const cliProcess = spawn('node', ['--import', 'tsx', path.join(__dirname, '..', 'src', 'cli', 'index.ts'), ...args], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..')
})

cliProcess.on('exit', (code) => {
  process.exit(code || 0)
})

cliProcess.on('error', (err) => {
  console.error('Error spawning CLI:', err)
  process.exit(1)
})
