#!/usr/bin/env bash
# =============================================================================
# MemoryForge Installer (Unix/macOS/Linux/Git Bash on Windows)
# =============================================================================
# Usage: bash install.sh [target-project-dir]
#
# If no target directory is provided, installs into the current directory.
#
# What it does:
# 1. Copies hook scripts to scripts/hooks/
# 2. Creates or merges .claude/settings.json with hook configuration
# 3. Creates .mind/ directory with template state files
# 4. Creates .claude/agents/mind.md (the Mind agent)
# 5. Adds .mind/ tracking files to .gitignore
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Determine source and target directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-.}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

echo -e "${BLUE}=== MemoryForge Installer ===${NC}"
echo -e "Source:  ${SCRIPT_DIR}"
echo -e "Target:  ${TARGET_DIR}"
echo ""

# --- 1. Copy hook scripts ---
echo -e "${YELLOW}[1/5] Installing hook scripts...${NC}"
mkdir -p "$TARGET_DIR/scripts/hooks"
cp "$SCRIPT_DIR/scripts/hooks/"*.sh "$TARGET_DIR/scripts/hooks/"
chmod +x "$TARGET_DIR/scripts/hooks/"*.sh
echo -e "${GREEN}  Copied 8 hook scripts to scripts/hooks/${NC}"

# --- 2. Install or merge .claude/settings.json ---
echo -e "${YELLOW}[2/5] Configuring hooks in .claude/settings.json...${NC}"
mkdir -p "$TARGET_DIR/.claude"

if [ -f "$TARGET_DIR/.claude/settings.json" ]; then
  # Settings file already exists — check if hooks are already configured
  if grep -q "session-start.sh" "$TARGET_DIR/.claude/settings.json" 2>/dev/null; then
    echo -e "${GREEN}  Hooks already configured in .claude/settings.json (skipped)${NC}"
  else
    echo -e "${YELLOW}  WARNING: .claude/settings.json already exists but has no MemoryForge hooks.${NC}"
    echo -e "${YELLOW}  You need to manually merge the hooks configuration.${NC}"
    echo -e "${YELLOW}  Reference: ${SCRIPT_DIR}/.claude/settings.json${NC}"
    cp "$SCRIPT_DIR/.claude/settings.json" "$TARGET_DIR/.claude/settings.memoryforge.json"
    echo -e "${GREEN}  Saved reference config to .claude/settings.memoryforge.json${NC}"
  fi
else
  cp "$SCRIPT_DIR/.claude/settings.json" "$TARGET_DIR/.claude/settings.json"
  echo -e "${GREEN}  Created .claude/settings.json with hook configuration${NC}"
fi

# --- 3. Create .mind/ directory with templates ---
echo -e "${YELLOW}[3/5] Creating .mind/ directory...${NC}"
mkdir -p "$TARGET_DIR/.mind/checkpoints"

for file in STATE.md DECISIONS.md PROGRESS.md SESSION-LOG.md; do
  if [ -f "$TARGET_DIR/.mind/$file" ]; then
    echo -e "${GREEN}  .mind/$file already exists (skipped)${NC}"
  else
    cp "$SCRIPT_DIR/templates/.mind/$file" "$TARGET_DIR/.mind/$file"
    echo -e "${GREEN}  Created .mind/$file${NC}"
  fi
done

# --- 4. Install Mind agent ---
echo -e "${YELLOW}[4/5] Installing Mind agent...${NC}"
mkdir -p "$TARGET_DIR/.claude/agents"

if [ -f "$TARGET_DIR/.claude/agents/mind.md" ]; then
  echo -e "${GREEN}  .claude/agents/mind.md already exists (skipped)${NC}"
else
  cp "$SCRIPT_DIR/.claude/agents/mind.md" "$TARGET_DIR/.claude/agents/mind.md"
  echo -e "${GREEN}  Created .claude/agents/mind.md${NC}"
fi

# --- 5. Update .gitignore ---
echo -e "${YELLOW}[5/5] Updating .gitignore...${NC}"

GITIGNORE_ENTRIES=(
  "# MemoryForge auto-generated tracking files"
  ".mind/.last-activity"
  ".mind/.agent-activity"
  ".mind/.task-completions"
  ".mind/.session-tracking"
  ".mind/checkpoints/"
)

if [ -f "$TARGET_DIR/.gitignore" ]; then
  NEEDS_UPDATE=false
  for entry in "${GITIGNORE_ENTRIES[@]}"; do
    if ! grep -qF "$entry" "$TARGET_DIR/.gitignore" 2>/dev/null; then
      NEEDS_UPDATE=true
      break
    fi
  done

  if [ "$NEEDS_UPDATE" = true ]; then
    echo "" >> "$TARGET_DIR/.gitignore"
    for entry in "${GITIGNORE_ENTRIES[@]}"; do
      echo "$entry" >> "$TARGET_DIR/.gitignore"
    done
    echo -e "${GREEN}  Updated .gitignore with MemoryForge entries${NC}"
  else
    echo -e "${GREEN}  .gitignore already has MemoryForge entries (skipped)${NC}"
  fi
else
  for entry in "${GITIGNORE_ENTRIES[@]}"; do
    echo "$entry" >> "$TARGET_DIR/.gitignore"
  done
  echo -e "${GREEN}  Created .gitignore with MemoryForge entries${NC}"
fi

echo ""
echo -e "${GREEN}=== MemoryForge installed successfully! ===${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Add the Mind Protocol section to your CLAUDE.md"
echo -e "     (see templates/CLAUDE.md.template for reference)"
echo -e "  2. Edit .mind/STATE.md with your project's current state"
echo -e "  3. Start Claude Code in your project directory"
echo -e "  4. The session-start hook will inject your .mind/ state automatically"
echo ""
echo -e "Files installed:"
echo -e "  scripts/hooks/*.sh        — 8 hook scripts"
echo -e "  .claude/settings.json     — Hook configuration"
echo -e "  .claude/agents/mind.md    — Mind agent definition"
echo -e "  .mind/*.md                — State tracking files"
echo ""
echo -e "${BLUE}Tip: Commit .mind/STATE.md, PROGRESS.md, DECISIONS.md, and SESSION-LOG.md${NC}"
echo -e "${BLUE}to version control. The auto-generated tracking files are gitignored.${NC}"
