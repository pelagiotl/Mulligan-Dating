#!/bin/bash
# Skip TypeScript checking and just build with Vite
# Set environment variable to skip type checking
export SKIP_TYPE_CHECK=true
npx vite build --mode production

