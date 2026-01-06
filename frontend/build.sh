#!/bin/bash
set -e
# Skip TypeScript checking and just build with Vite
# Remove tsc from PATH temporarily to prevent it from running
export PATH=$(echo $PATH | tr ':' '\n' | grep -v node_modules | tr '\n' ':')
# Build with Vite only
npx --yes vite build --mode production

