#!/bin/bash
# Sync with microsoft/vscode upstream instead of voideditor/void
# This script fetches from vscode remote and merges into your current branch

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Syncing with microsoft/vscode:main...${NC}"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Check if vscode remote exists
if ! git remote get-url vscode > /dev/null 2>&1; then
    echo -e "${YELLOW}Adding vscode remote...${NC}"
    git remote add vscode git@github.com:microsoft/vscode.git
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${GREEN}Current branch: ${CURRENT_BRANCH}${NC}"

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    read -p "Do you want to stash them? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git stash push -m "Auto-stash before syncing with vscode"
        STASHED=true
    else
        echo -e "${RED}Aborting. Please commit or stash your changes first.${NC}"
        exit 1
    fi
fi

# Fetch from vscode
echo -e "${GREEN}Fetching from vscode remote...${NC}"
git fetch vscode main

# Ask user if they want to merge or rebase
echo -e "${YELLOW}Choose sync method:${NC}"
echo "1) Merge (creates a merge commit)"
echo "2) Rebase (replays your commits on top of vscode/main)"
read -p "Enter choice (1 or 2, default: 1): " -n 1 -r
echo

if [[ $REPLY =~ ^[2]$ ]]; then
    echo -e "${GREEN}Rebasing onto vscode/main...${NC}"
    git rebase vscode/main
else
    echo -e "${GREEN}Merging vscode/main...${NC}"
    git merge vscode/main --no-edit
fi

# Restore stashed changes if any
if [ "$STASHED" = true ]; then
    echo -e "${GREEN}Restoring stashed changes...${NC}"
    git stash pop
fi

echo -e "${GREEN}✓ Sync complete!${NC}"
echo -e "${YELLOW}Don't forget to push: git push origin ${CURRENT_BRANCH}${NC}"
