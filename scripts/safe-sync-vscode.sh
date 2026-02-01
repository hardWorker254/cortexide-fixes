#!/bin/bash
# Safe sync workflow - creates a test branch, attempts merge, and provides conflict resolution guide

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Safe VS Code Sync Workflow${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    read -p "Do you want to stash them? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git stash push -m "Auto-stash before safe sync with vscode"
        STASHED=true
        echo -e "${GREEN}Changes stashed${NC}"
    else
        echo -e "${RED}Aborting. Please commit or stash your changes first.${NC}"
        exit 1
    fi
fi

# Ensure vscode remote exists and fetch
if ! git remote get-url vscode > /dev/null 2>&1; then
    echo -e "${YELLOW}Adding vscode remote...${NC}"
    git remote add vscode git@github.com:microsoft/vscode.git
fi

echo -e "${GREEN}Fetching latest from vscode/main...${NC}"
git fetch vscode main

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
TEST_BRANCH="test-sync-vscode-$(date +%Y%m%d-%H%M%S)"

echo -e "${BLUE}Current branch: ${CURRENT_BRANCH}${NC}"
echo -e "${BLUE}Creating test branch: ${TEST_BRANCH}${NC}"

# Create test branch
git checkout -b "$TEST_BRANCH" 2>&1 || {
    echo -e "${RED}Failed to create test branch. Branch might already exist.${NC}"
    exit 1
}

echo -e "${GREEN}Test branch created successfully${NC}"
echo ""

# Run comparison first
echo -e "${CYAN}Running comparison analysis...${NC}"
if [ -f "./scripts/compare-and-sync-vscode.sh" ]; then
    ./scripts/compare-and-sync-vscode.sh
fi

echo ""
echo -e "${YELLOW}Ready to attempt merge. This will help identify conflicts.${NC}"
read -p "Proceed with merge attempt? (y/n) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Merge cancelled. You're on test branch ${TEST_BRANCH}${NC}"
    echo "You can manually run: git merge vscode/main"
    exit 0
fi

# Attempt merge
echo -e "${GREEN}Attempting to merge vscode/main...${NC}"
echo ""

MERGE_OUTPUT=$(git merge vscode/main 2>&1) || MERGE_EXIT=$?

if [ -z "$MERGE_EXIT" ]; then
    # Merge succeeded!
    echo -e "${GREEN}✓ Merge successful! No conflicts detected.${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Test your application thoroughly"
    echo "  2. If everything works, merge this branch back to main:"
    echo "     git checkout $CURRENT_BRANCH"
    echo "     git merge $TEST_BRANCH"
    echo "  3. Push to origin: git push origin $CURRENT_BRANCH"
    echo ""
    echo -e "${YELLOW}If you want to abort and try rebase instead:${NC}"
    echo "  git merge --abort"
    echo "  git rebase vscode/main"

    # Restore stashed changes if any
    if [ "$STASHED" = true ]; then
        echo ""
        echo -e "${GREEN}Restoring stashed changes...${NC}"
        git stash pop || true
    fi
else
    # Merge had conflicts
    echo -e "${YELLOW}⚠ Merge conflicts detected!${NC}"
    echo ""
    echo -e "${BLUE}Conflict Resolution Guide:${NC}"
    echo ""

    # Show conflicted files
    CONFLICTED_FILES=$(git diff --name-only --diff-filter=U)
    CONFLICT_COUNT=$(echo "$CONFLICTED_FILES" | grep -c . || echo "0")

    echo "Conflicted files ($CONFLICT_COUNT):"
    echo "$CONFLICTED_FILES" | sed 's/^/  - /'
    echo ""

    echo -e "${BLUE}Options:${NC}"
    echo ""
    echo "1. ${GREEN}Resolve conflicts manually:${NC}"
    echo "   - Edit each conflicted file"
    echo "   - Look for <<<<<<< HEAD markers"
    echo "   - Choose which changes to keep"
    echo "   - Remove conflict markers"
    echo "   - Stage resolved files: git add <file>"
    echo "   - Complete merge: git commit"
    echo ""
    echo "2. ${GREEN}Use VS Code merge tool:${NC}"
    echo "   code ."
    echo "   # VS Code will show merge conflicts in the UI"
    echo ""
    echo "3. ${GREEN}Abort and try rebase instead:${NC}"
    echo "   git merge --abort"
    echo "   git rebase vscode/main"
    echo ""
    echo "4. ${GREEN}Accept VS Code's version for specific files:${NC}"
    echo "   git checkout --theirs <file>  # Use VS Code version"
    echo "   git add <file>"
    echo ""
    echo "5. ${GREEN}Accept your version for specific files:${NC}"
    echo "   git checkout --ours <file>  # Use your version"
    echo "   git add <file>"
    echo ""

    # Create conflict resolution helper script
    CONFLICT_HELPER="resolve-conflicts-$(date +%Y%m%d-%H%M%S).sh"
    cat > "$CONFLICT_HELPER" << 'EOF'
#!/bin/bash
# Conflict resolution helper - run this after resolving conflicts

echo "Checking conflict status..."
if git diff --check > /dev/null 2>&1; then
    echo "✓ No conflict markers found"

    CONFLICTED=$(git diff --name-only --diff-filter=U)
    if [ -z "$CONFLICTED" ]; then
        echo "✓ All conflicts resolved!"
        echo ""
        echo "Stage all resolved files:"
        echo "  git add ."
        echo ""
        echo "Complete the merge:"
        echo "  git commit"
    else
        echo "⚠ Still have unmerged files:"
        echo "$CONFLICTED" | sed 's/^/  - /'
    fi
else
    echo "⚠ Conflict markers still found in files"
    echo "Run: git diff --check"
fi
EOF
    chmod +x "$CONFLICT_HELPER"
    echo -e "${GREEN}Created conflict resolution helper: ${CONFLICT_HELPER}${NC}"
    echo ""

    echo -e "${YELLOW}You're currently on test branch: ${TEST_BRANCH}${NC}"
    echo "Take your time to resolve conflicts. When done, run:"
    echo "  git add ."
    echo "  git commit"
    echo ""
    echo "Or abort: git merge --abort"
fi
