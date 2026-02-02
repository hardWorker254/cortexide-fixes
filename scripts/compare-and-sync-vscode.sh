#!/bin/bash
# Compare current codebase with vscode/main and create a safe sync plan
# This script analyzes differences and helps plan a conflict-free sync

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

REPORT_FILE="vscode-sync-report-$(date +%Y%m%d-%H%M%S).txt"

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  VS Code Sync Comparison & Analysis Tool${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Ensure vscode remote exists
if ! git remote get-url vscode > /dev/null 2>&1; then
    echo -e "${YELLOW}Adding vscode remote...${NC}"
    git remote add vscode git@github.com:microsoft/vscode.git
fi

# Fetch latest from vscode
echo -e "${GREEN}Fetching latest from vscode/main...${NC}"
git fetch vscode main 2>&1 | grep -v "^$" || true

# Get current state
CURRENT_BRANCH=$(git branch --show-current)
CURRENT_COMMIT=$(git rev-parse HEAD)
VSCODE_COMMIT=$(git rev-parse vscode/main)
MERGE_BASE=$(git merge-base HEAD vscode/main)

echo "" | tee -a "$REPORT_FILE"
echo "═══════════════════════════════════════════════════════════" | tee -a "$REPORT_FILE"
echo "  VS Code Sync Comparison Report" | tee -a "$REPORT_FILE"
echo "  Generated: $(date)" | tee -a "$REPORT_FILE"
echo "═══════════════════════════════════════════════════════════" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Current state
echo -e "${BLUE}Current State:${NC}" | tee -a "$REPORT_FILE"
echo "  Branch: $CURRENT_BRANCH" | tee -a "$REPORT_FILE"
echo "  Commit: $CURRENT_COMMIT" | tee -a "$REPORT_FILE"
echo "  $(git log -1 --format='%s' HEAD)" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# VS Code state
echo -e "${BLUE}VS Code State:${NC}" | tee -a "$REPORT_FILE"
echo "  Commit: $VSCODE_COMMIT" | tee -a "$REPORT_FILE"
echo "  $(git log -1 --format='%s' vscode/main)" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Merge base
echo -e "${BLUE}Common Ancestor (Merge Base):${NC}" | tee -a "$REPORT_FILE"
echo "  Commit: $MERGE_BASE" | tee -a "$REPORT_FILE"
echo "  $(git log -1 --format='%s' $MERGE_BASE)" | tee -a "$REPORT_FILE"
MERGE_BASE_DATE=$(git log -1 --format='%ci' $MERGE_BASE)
echo "  Date: $MERGE_BASE_DATE" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Count commits
COMMITS_AHEAD=$(git rev-list --count $MERGE_BASE..HEAD)
COMMITS_BEHIND=$(git rev-list --count $MERGE_BASE..vscode/main)
COMMITS_VSCODE=$(git rev-list --count $MERGE_BASE..vscode/main)

echo -e "${BLUE}Divergence Analysis:${NC}" | tee -a "$REPORT_FILE"
echo "  Your commits ahead of merge base: $COMMITS_AHEAD" | tee -a "$REPORT_FILE"
echo "  VS Code commits ahead of merge base: $COMMITS_BEHIND" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Check for potential conflicts
echo -e "${YELLOW}Analyzing potential conflicts...${NC}" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Get list of files changed in both branches
echo -e "${BLUE}Files changed in your branch (since merge base):${NC}" | tee -a "$REPORT_FILE"
YOUR_FILES=$(git diff --name-only $MERGE_BASE..HEAD | wc -l | tr -d ' ')
echo "  Total files modified: $YOUR_FILES" | tee -a "$REPORT_FILE"
if [ "$YOUR_FILES" -lt 50 ]; then
    git diff --name-only $MERGE_BASE..HEAD | head -20 | sed 's/^/    /' | tee -a "$REPORT_FILE"
    if [ "$YOUR_FILES" -gt 20 ]; then
        echo "    ... and $((YOUR_FILES - 20)) more files" | tee -a "$REPORT_FILE"
    fi
fi
echo "" | tee -a "$REPORT_FILE"

echo -e "${BLUE}Files changed in VS Code (since merge base):${NC}" | tee -a "$REPORT_FILE"
VSCODE_FILES=$(git diff --name-only $MERGE_BASE..vscode/main | wc -l | tr -d ' ')
echo "  Total files modified: $VSCODE_FILES" | tee -a "$REPORT_FILE"
if [ "$VSCODE_FILES" -lt 50 ]; then
    git diff --name-only $MERGE_BASE..vscode/main | head -20 | sed 's/^/    /' | tee -a "$REPORT_FILE"
    if [ "$VSCODE_FILES" -gt 20 ]; then
        echo "    ... and $((VSCODE_FILES - 20)) more files" | tee -a "$REPORT_FILE"
    fi
fi
echo "" | tee -a "$REPORT_FILE"

# Find overlapping files (potential conflicts)
echo -e "${BLUE}Potential Conflict Analysis:${NC}" | tee -a "$REPORT_FILE"
YOUR_FILE_LIST=$(mktemp)
VSCODE_FILE_LIST=$(mktemp)
git diff --name-only $MERGE_BASE..HEAD | sort > "$YOUR_FILE_LIST"
git diff --name-only $MERGE_BASE..vscode/main | sort > "$VSCODE_FILE_LIST"

OVERLAPPING_FILES=$(comm -12 "$YOUR_FILE_LIST" "$VSCODE_FILE_LIST" | wc -l | tr -d ' ')
echo "  Files modified in both branches: $OVERLAPPING_FILES" | tee -a "$REPORT_FILE"

if [ "$OVERLAPPING_FILES" -gt 0 ]; then
    echo -e "${YELLOW}  ⚠️  These files may have conflicts:${NC}" | tee -a "$REPORT_FILE"
    comm -12 "$YOUR_FILE_LIST" "$VSCODE_FILE_LIST" | head -20 | sed 's/^/    /' | tee -a "$REPORT_FILE"
    if [ "$OVERLAPPING_FILES" -gt 20 ]; then
        echo "    ... and $((OVERLAPPING_FILES - 20)) more files" | tee -a "$REPORT_FILE"
    fi
else
    echo -e "${GREEN}  ✓ No overlapping files - merge should be clean!${NC}" | tee -a "$REPORT_FILE"
fi

rm -f "$YOUR_FILE_LIST" "$VSCODE_FILE_LIST"
echo "" | tee -a "$REPORT_FILE"

# Check CortexIDE-specific files
echo -e "${BLUE}CortexIDE-Specific Files (should be safe):${NC}" | tee -a "$REPORT_FILE"
CORTEXIDE_FILES=$(git diff --name-only $MERGE_BASE..HEAD | grep -E "(cortexide|void)" | wc -l | tr -d ' ')
echo "  CortexIDE-specific files modified: $CORTEXIDE_FILES" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Recent commits summary
echo -e "${BLUE}Your Recent Commits (last 10):${NC}" | tee -a "$REPORT_FILE"
git log --oneline $MERGE_BASE..HEAD | head -10 | sed 's/^/    /' | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

echo -e "${BLUE}VS Code Recent Commits (last 10):${NC}" | tee -a "$REPORT_FILE"
git log --oneline $MERGE_BASE..vscode/main | head -10 | sed 's/^/    /' | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Sync recommendations
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}" | tee -a "$REPORT_FILE"
echo -e "${CYAN}  Sync Recommendations${NC}" | tee -a "$REPORT_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

if [ "$OVERLAPPING_FILES" -eq 0 ]; then
    echo -e "${GREEN}✓ RECOMMENDED: Safe to merge/rebase${NC}" | tee -a "$REPORT_FILE"
    echo "  No file conflicts detected. You can safely sync." | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    echo "  To merge:" | tee -a "$REPORT_FILE"
    echo "    git merge vscode/main" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    echo "  To rebase:" | tee -a "$REPORT_FILE"
    echo "    git rebase vscode/main" | tee -a "$REPORT_FILE"
else
    echo -e "${YELLOW}⚠ CAUTION: Potential conflicts detected${NC}" | tee -a "$REPORT_FILE"
    echo "  $OVERLAPPING_FILES files were modified in both branches." | tee -a "$REPORT_FILE"
    echo "  Review the files listed above before syncing." | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    echo "  RECOMMENDED APPROACH:" | tee -a "$REPORT_FILE"
    echo "  1. Create a test branch: git checkout -b test-sync-vscode" | tee -a "$REPORT_FILE"
    echo "  2. Try merging: git merge vscode/main" | tee -a "$REPORT_FILE"
    echo "  3. Resolve any conflicts" | tee -a "$REPORT_FILE"
    echo "  4. Test thoroughly" | tee -a "$REPORT_FILE"
    echo "  5. If successful, merge test branch back to main" | tee -a "$REPORT_FILE"
fi

echo "" | tee -a "$REPORT_FILE"
echo -e "${BLUE}Full report saved to: ${REPORT_FILE}${NC}"
echo ""

# Ask if user wants to create a test sync branch
if [ "$OVERLAPPING_FILES" -gt 0 ]; then
    read -p "Create a test branch to try syncing? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        TEST_BRANCH="test-sync-vscode-$(date +%Y%m%d)"
        echo -e "${GREEN}Creating test branch: $TEST_BRANCH${NC}"
        git checkout -b "$TEST_BRANCH" 2>&1 || {
            echo -e "${YELLOW}Branch might already exist or git write not allowed${NC}"
            echo "You can create it manually: git checkout -b $TEST_BRANCH"
        }
        echo -e "${GREEN}Test branch created. You can now try: git merge vscode/main${NC}"
    fi
fi
