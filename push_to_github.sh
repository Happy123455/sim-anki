#!/usr/bin/env bash

# Exit immediately if any command fails
set -e

echo "=== GitHub Push Helper ==="
echo ""
echo "Please enter your GitHub repository URL (e.g., https://github.com/username/sim-anki.git):"
read -r repo_url

if [ -z "$repo_url" ]; then
  echo "Error: Repository URL cannot be empty."
  exit 1
fi

echo ""
echo "Setting remote origin to: $repo_url..."
git remote add origin "$repo_url" 2>/dev/null || git remote set-url origin "$repo_url"

echo "Setting primary branch to 'main'..."
git branch -M main

echo "Pushing code to GitHub..."
git push -u origin main

echo ""
echo "========================================================"
echo "✔ Successfully pushed code to your repository!"
echo ""
echo "Next steps to complete deployment to GitHub Pages:"
echo "1. Go to your repository on github.com"
echo "2. Click on 'Settings' (top bar)"
echo "3. Click on 'Pages' (left sidebar under Code and automation)"
echo "4. Under 'Build and deployment' -> 'Source', select 'GitHub Actions'"
echo "5. Wait 1-2 minutes for the Actions build to complete"
echo "6. Your live link will be shown at the top of the Pages tab!"
echo "========================================================"
