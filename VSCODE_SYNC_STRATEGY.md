# VS Code Sync Strategy

## Overview

This document outlines the strategy for syncing CortexIDE with the upstream `microsoft/vscode` repository.

## Current Situation

- **Your branch**: 150 commits ahead of merge base
- **VS Code**: 4,558 commits ahead of merge base
- **Merge base**: `ac4cbdf48759c7d8c3eb91ffe6bb04316e263c57` (Nov 11, 2025)
- **Potential conflicts**: 66 files modified in both branches

## Tools Created

### 1. `scripts/compare-and-sync-vscode.sh`
Analyzes differences between your codebase and VS Code, identifies potential conflicts, and generates a detailed report.

**Usage:**
```bash
./scripts/compare-and-sync-vscode.sh
```

**Output:**
- Comparison report saved to `vscode-sync-report-*.txt`
- Lists all files changed in both branches
- Identifies potential conflict files
- Provides sync recommendations

### 2. `scripts/safe-sync-vscode.sh`
Creates a test branch and attempts a safe merge, providing conflict resolution guidance.

**Usage:**
```bash
./scripts/safe-sync-vscode.sh
```

**What it does:**
1. Stashes uncommitted changes (if any)
2. Creates a test branch: `test-sync-vscode-YYYYMMDD-HHMMSS`
3. Fetches latest from `vscode/main`
4. Attempts merge
5. Provides conflict resolution guide if conflicts occur

### 3. `scripts/sync-vscode.sh`
Simple sync script for when you're ready to sync (after testing).

**Usage:**
```bash
./scripts/sync-vscode.sh
```

## Recommended Sync Workflow

### Step 1: Analyze First
```bash
./scripts/compare-and-sync-vscode.sh
```

Review the generated report to understand:
- Which files will likely conflict
- How many commits you're behind
- What VS Code has changed

### Step 2: Test Sync in Safe Branch
```bash
./scripts/safe-sync-vscode.sh
```

This will:
- Create a test branch
- Attempt the merge
- Show you conflicts if any
- Guide you through resolution

### Step 3: Resolve Conflicts

If conflicts occur, you have several options:

#### Option A: Manual Resolution
1. Open conflicted files in your editor
2. Look for conflict markers:
   ```
   <<<<<<< HEAD
   Your changes
   =======
   VS Code changes
   >>>>>>> vscode/main
   ```
3. Choose which version to keep (or merge both)
4. Remove conflict markers
5. Stage: `git add <file>`
6. Complete: `git commit`

#### Option B: Use VS Code Merge Tool
```bash
code .
```
VS Code will highlight conflicts and provide UI to resolve them.

#### Option C: Accept VS Code's Version (for specific files)
```bash
git checkout --theirs <file>  # Use VS Code version
git add <file>
```

#### Option D: Keep Your Version (for specific files)
```bash
git checkout --ours <file>  # Use your version
git add <file>
```

### Step 4: Test Thoroughly

After resolving conflicts:
1. Build the project: `npm run compile` (or your build command)
2. Run tests if available
3. Test key features manually
4. Check for runtime errors

### Step 5: Merge to Main (if successful)

If everything works:
```bash
git checkout main
git merge test-sync-vscode-YYYYMMDD-HHMMSS
git push origin main
```

If something's wrong:
```bash
git checkout main
git branch -D test-sync-vscode-YYYYMMDD-HHMMSS  # Delete test branch
```

## Conflict Categories

Based on the analysis, conflicts are likely in:

### 1. Build/CI Files (Low Risk)
- `.github/workflows/*.yml` - GitHub Actions workflows
- `build/**/*` - Build scripts
- These are usually safe to accept VS Code's version

### 2. Configuration Files (Medium Risk)
- `.gitignore`
- `README.md`
- May need manual merging

### 3. Core VS Code Files (High Risk)
- Files in `src/vs/**` that you've also modified
- These need careful review
- Your CortexIDE changes should be preserved

### 4. CortexIDE-Specific Files (No Risk)
- Files in `src/vs/workbench/contrib/cortexide/**`
- These won't conflict (VS Code doesn't have them)

## Alternative: Rebase Instead of Merge

If you prefer a linear history:

```bash
git checkout test-sync-vscode-YYYYMMDD-HHMMSS
git rebase vscode/main
```

**Pros:**
- Cleaner history
- No merge commits

**Cons:**
- More complex conflict resolution
- Rewrites commit history
- Harder to abort if something goes wrong

## Tips

1. **Sync regularly**: Don't let the gap get too large (you're 4,558 commits behind)
2. **Test branches**: Always use test branches for large syncs
3. **Backup first**: Consider creating a backup branch before syncing
   ```bash
   git branch backup-before-sync-$(date +%Y%m%d)
   ```
4. **Incremental syncs**: Consider syncing more frequently with smaller batches
5. **Document conflicts**: Keep notes on which files always conflict and why

## Quick Reference

```bash
# Fetch latest from VS Code
git fetch vscode main

# See what's different
git log HEAD..vscode/main --oneline

# See file differences
git diff --name-only HEAD vscode/main

# Create test branch and merge
git checkout -b test-sync
git merge vscode/main

# If conflicts, resolve then:
git add .
git commit

# If successful, merge to main
git checkout main
git merge test-sync
```

## Getting Help

If you encounter issues:
1. Check the generated report: `vscode-sync-report-*.txt`
2. Review conflict files carefully
3. Test in the test branch before merging to main
4. Consider syncing in smaller chunks if conflicts are overwhelming
