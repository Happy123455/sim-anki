#!/usr/bin/env bash

# Exit immediately if any command fails
set -e

# Default commit message if none provided
COMMIT_MSG=${1:-"Update application and deploy build"}

echo "=== 🚀 Starting Deployment ==="
echo ""

# 1. Build the production application
echo "Building the production bundle..."
npm run build

# 2. Commit and push source code (main branch)
echo ""
echo "Staging source files..."
git add .
echo "Committing source files: '$COMMIT_MSG'..."
# Allow commit to fail if there are no changes
git commit -m "$COMMIT_MSG" || echo "No source changes to commit."
echo "Pushing source code to GitHub main branch..."
git push origin main

# 3. Commit and push compiled build (gh-pages branch)
echo ""
echo "Navigating to build output..."
cd dist

# Initialize git if not already present in dist folder
if [ ! -d ".git" ]; then
  git init
  git checkout -b gh-pages
  git remote add origin https://github.com/Happy123455/sim-anki.git
fi

echo "Staging compiled assets..."
git add .
echo "Committing compiled assets..."
git commit -m "Deploy: $COMMIT_MSG" || echo "No build changes to commit."
echo "Pushing built site to GitHub gh-pages branch..."
git push origin gh-pages --force

echo ""
echo "=== ✔ Deployment Complete! ==="
echo "Your live site will update in ~30 seconds at:"
echo "👉 https://Happy123455.github.io/sim-anki/"
echo "============================================="
