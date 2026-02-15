#!/usr/bin/env bash
# =============================================================================
# MemoryForge Installer
# =============================================================================
# Persistent memory for Claude Code — hooks + state files.
#
# Install modes:
#   bash install.sh [target-dir]                  # Project-level
#   bash install.sh --global                      # User-level (all projects)
#
# Brownfield features:
#   bash install.sh [target-dir] --dry-run        # Preview changes only
#   bash install.sh [target-dir] --no-claude-md   # Skip CLAUDE.md injection
#   bash install.sh [target-dir] --uninstall      # Remove MemoryForge cleanly
#
# Docs: https://github.com/marolinik/MemoryForge
# =============================================================================

set -euo pipefail

MEMORYFORGE_VERSION="2.0.0"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# --- Check Node.js prerequisite ---
if ! command -v node &>/dev/null; then
  echo -e "${RED}ERROR: Node.js is required but not found.${NC}"
  echo -e "MemoryForge hooks use Node.js for JSON parsing and the MCP server."
  echo -e "Install Node.js 18+ from: ${CYAN}https://nodejs.org/${NC}"
  exit 1
fi
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${YELLOW}WARNING: Node.js $NODE_MAJOR detected, but 18+ is recommended.${NC}"
fi

# --- Parse flags ---
GLOBAL=false
DRY_RUN=false
NO_CLAUDE_MD=false
UNINSTALL=false
TARGET_ARG=""

for arg in "$@"; do
  case "$arg" in
    --global)           GLOBAL=true ;;
    --dry-run)          DRY_RUN=true ;;
    --no-claude-md)     NO_CLAUDE_MD=true ;;
    --uninstall)        UNINSTALL=true ;;
    --help|-h)
      echo "Usage: bash install.sh [target-dir] [flags]"
      echo ""
      echo "Install flags:"
      echo "  --global           Install to ~/.claude/ (all projects)"
      echo ""
      echo "Brownfield flags:"
      echo "  --dry-run          Preview what would change (no writes)"
      echo "  --no-claude-md     Skip adding Mind Protocol to CLAUDE.md"
      echo "  --uninstall        Remove MemoryForge from the project"
      echo ""
      echo "  --help             Show this help"
      exit 0
      ;;
    -*)
      echo -e "${RED}Unknown flag: $arg${NC}" >&2
      echo "Run 'bash install.sh --help' for usage." >&2
      exit 1
      ;;
    *)
      TARGET_ARG="$arg"
      ;;
  esac
done

# --- Determine directories ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$GLOBAL" = true ]; then
  CLAUDE_DIR="$HOME/.claude"
  TARGET_DIR="$HOME"
  SCOPE="user"
else
  if [ -n "$TARGET_ARG" ]; then
    TARGET_DIR="$(cd "$TARGET_ARG" && pwd)"
  else
    TARGET_DIR="$(pwd)"
  fi
  CLAUDE_DIR="$TARGET_DIR/.claude"
  SCOPE="project"
fi

# --- Helper functions ---
step_num=0
total_steps=0

step() {
  step_num=$((step_num + 1))
  echo -e "${YELLOW}[$step_num/$total_steps]${NC} $1"
}

ok() {
  echo -e "    ${GREEN}$1${NC}"
}

skip() {
  echo -e "    ${DIM}$1 (skipped — already exists)${NC}"
}

warn() {
  echo -e "    ${YELLOW}$1${NC}"
}

dry() {
  echo -e "    ${CYAN}[dry-run]${NC} $1"
}

# =============================================================================
# UNINSTALL MODE
# =============================================================================
if [ "$UNINSTALL" = true ]; then
  echo ""
  echo -e "${BOLD}${RED}  MemoryForge Uninstaller${NC}"
  if [ "$GLOBAL" = true ]; then
    echo -e "${DIM}  Removing from ~/.claude/ (user-level)${NC}"
  else
    echo -e "${DIM}  Removing from $TARGET_DIR${NC}"
  fi
  echo ""

  if [ "$DRY_RUN" != true ]; then
    echo -e "  ${YELLOW}This will remove MemoryForge hooks and scripts from:${NC}"
    echo -e "  ${CYAN}$TARGET_DIR${NC}"
    echo -e "  ${DIM}(.mind/ state files will be preserved)${NC}"
    echo ""
    read -r -p "  Continue? [y/N] " CONFIRM
    case "$CONFIRM" in
      [yY]|[yY][eE][sS]) ;;
      *)
        echo -e "  ${DIM}Cancelled.${NC}"
        exit 0
        ;;
    esac
    echo ""
  fi

  REMOVED=0

  # 1. Remove hook scripts
  if [ "$GLOBAL" = true ]; then
    HOOKS_DIR="$HOME/.claude/hooks"
  else
    HOOKS_DIR="$TARGET_DIR/scripts/hooks"
  fi

  MF_HOOKS="session-start.sh pre-compact.sh session-end.sh"

  for hook in $MF_HOOKS; do
    HOOK_PATH="$HOOKS_DIR/$hook"
    if [ -f "$HOOK_PATH" ]; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove $HOOK_PATH"
      else
        rm -f "$HOOK_PATH"
        ok "Removed $hook"
      fi
      REMOVED=$((REMOVED + 1))
    fi
  done

  # Remove empty hooks dir
  if [ -d "$HOOKS_DIR" ] && [ -z "$(ls -A "$HOOKS_DIR" 2>/dev/null)" ]; then
    if [ "$DRY_RUN" = true ]; then
      dry "Would remove empty directory $HOOKS_DIR"
    else
      rmdir "$HOOKS_DIR" 2>/dev/null || true
      SCRIPTS_DIR="$(dirname "$HOOKS_DIR")"
      if [ "$(basename "$SCRIPTS_DIR")" = "scripts" ] && [ -z "$(ls -A "$SCRIPTS_DIR" 2>/dev/null)" ]; then
        rmdir "$SCRIPTS_DIR" 2>/dev/null || true
      fi
    fi
  fi

  # 2. Remove MemoryForge hooks from settings.json
  SETTINGS_PATH="$CLAUDE_DIR/settings.json"
  if [ -f "$SETTINGS_PATH" ]; then
    if grep -q "session-start.sh" "$SETTINGS_PATH" 2>/dev/null; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove MemoryForge hooks from settings.json"
      else
        cp "$SETTINGS_PATH" "${SETTINGS_PATH}.backup"
        # Remove MemoryForge hook entries using node
        SETTINGS_FILE="$SETTINGS_PATH" node -e "
          const fs = require('fs');
          const p = process.env.SETTINGS_FILE;
          const s = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (s.hooks) {
            for (const [event, handlers] of Object.entries(s.hooks)) {
              s.hooks[event] = handlers.filter(h =>
                !JSON.stringify(h).includes('memoryforge') &&
                !JSON.stringify(h).includes('session-start.sh') &&
                !JSON.stringify(h).includes('pre-compact.sh') &&
                !JSON.stringify(h).includes('session-end.sh')
              );
              if (s.hooks[event].length === 0) delete s.hooks[event];
            }
            if (Object.keys(s.hooks).length === 0) delete s.hooks;
          }
          fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
        " 2>/dev/null && ok "Removed MemoryForge hooks from settings.json" || warn "Could not clean settings.json"
      fi
      REMOVED=$((REMOVED + 1))
    fi
  fi

  # 3. Remove MCP memory server
  if [ "$GLOBAL" = true ]; then
    MCP_SERVER="$HOME/.claude/mcp-memory-server.js"
    if [ -f "$MCP_SERVER" ]; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove $MCP_SERVER"
      else
        rm -f "$MCP_SERVER"
        ok "Removed ~/.claude/mcp-memory-server.js"
      fi
      REMOVED=$((REMOVED + 1))
    fi
  else
    for script in mcp-memory-server.js compress-sessions.js config-keys.js; do
      SCRIPT_PATH="$TARGET_DIR/scripts/$script"
      if [ -f "$SCRIPT_PATH" ]; then
        if [ "$DRY_RUN" = true ]; then
          dry "Would remove scripts/$script"
        else
          rm -f "$SCRIPT_PATH"
          ok "Removed scripts/$script"
        fi
        REMOVED=$((REMOVED + 1))
      fi
    done

    # Remove "memory" entry from .mcp.json
    MCP_JSON="$TARGET_DIR/.mcp.json"
    if [ -f "$MCP_JSON" ] && grep -q "mcp-memory-server\|memoryforge" "$MCP_JSON" 2>/dev/null; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove memory server from .mcp.json"
      else
        cp "$MCP_JSON" "${MCP_JSON}.backup"
        MCP_FILE="$MCP_JSON" node -e "
          const fs = require('fs');
          const p = process.env.MCP_FILE;
          const mcp = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (mcp.mcpServers && mcp.mcpServers.memory) {
            delete mcp.mcpServers.memory;
          }
          if (Object.keys(mcp.mcpServers || {}).length === 0) {
            fs.unlinkSync(p);
          } else {
            fs.writeFileSync(p, JSON.stringify(mcp, null, 2) + '\n');
          }
        " 2>/dev/null && {
          if [ -f "$MCP_JSON" ]; then
            ok "Removed memory server from .mcp.json (other servers preserved)"
          else
            ok "Removed .mcp.json (no other servers)"
          fi
        } || warn "Could not clean .mcp.json — remove 'memory' entry manually"
      fi
      REMOVED=$((REMOVED + 1))
    fi
  fi

  # 4. Remove agents
  MIND_AGENT="$CLAUDE_DIR/agents/mind.md"
  if [ -f "$MIND_AGENT" ]; then
    if grep -q "MemoryForge\|\.mind/" "$MIND_AGENT" 2>/dev/null; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove $MIND_AGENT"
      else
        rm -f "$MIND_AGENT"
        ok "Removed agents/mind.md"
      fi
      REMOVED=$((REMOVED + 1))
    fi
  fi

  # 5. Remove tracking files (NOT state files)
  if [ "$GLOBAL" != true ]; then
    TRACKING_FILES=".mind/.last-activity .mind/.agent-activity .mind/.task-completions .mind/.session-tracking .mind/.file-tracker"
    for tf in $TRACKING_FILES; do
      TF_PATH="$TARGET_DIR/$tf"
      if [ -f "$TF_PATH" ]; then
        if [ "$DRY_RUN" = true ]; then
          dry "Would remove $TF_PATH"
        else
          rm -f "$TF_PATH"
          ok "Removed $tf"
        fi
        REMOVED=$((REMOVED + 1))
      fi
    done

    if [ -d "$TARGET_DIR/.mind/checkpoints" ]; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove .mind/checkpoints/"
      else
        rm -rf "$TARGET_DIR/.mind/checkpoints"
        ok "Removed .mind/checkpoints/"
      fi
      REMOVED=$((REMOVED + 1))
    fi

    echo ""
    echo -e "    ${BOLD}Preserved:${NC} .mind/STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md"
    echo -e "    ${DIM}These are your project data. Delete manually if you want them gone.${NC}"
  fi

  echo ""
  if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}  Dry run complete. No files were modified.${NC}"
  elif [ $REMOVED -gt 0 ]; then
    echo -e "${GREEN}  MemoryForge removed ($REMOVED items).${NC}"
  else
    echo -e "${DIM}  Nothing to remove — MemoryForge doesn't appear to be installed.${NC}"
  fi
  echo ""
  exit 0
fi

# =============================================================================
# INSTALL MODE
# =============================================================================

# Header
echo ""
echo -e "${BOLD}${BLUE}  MemoryForge Installer${NC}"
echo -e "${DIM}  Persistent memory for Claude Code${NC}"
if [ "$DRY_RUN" = true ]; then
  echo -e "${CYAN}  DRY RUN — no files will be modified${NC}"
fi
echo ""
echo -e "  ${CYAN}Source${NC}  $SCRIPT_DIR"
if [ "$GLOBAL" = true ]; then
  echo -e "  ${CYAN}Target${NC}  ~/.claude/ ${DIM}(user-level — all projects)${NC}"
else
  echo -e "  ${CYAN}Target${NC}  $TARGET_DIR ${DIM}(project-level)${NC}"
fi
echo ""

# Calculate total steps (6 base for project-level, 5 for global or no-claude-md)
if [ "$GLOBAL" = true ] || [ "$NO_CLAUDE_MD" = true ]; then
  total_steps=5
else
  total_steps=6
fi

# =============================================================================
# STEP 1: Hook scripts
# =============================================================================
step "Installing hook scripts..."

if [ "$GLOBAL" = true ]; then
  HOOKS_DIR="$HOME/.claude/hooks"
else
  HOOKS_DIR="$TARGET_DIR/scripts/hooks"
fi

if [ "$DRY_RUN" = true ]; then
  dry "Would copy 3 hooks to $HOOKS_DIR"
else
  mkdir -p "$HOOKS_DIR"
  cp "$SCRIPT_DIR/scripts/hooks/"*.sh "$HOOKS_DIR/"
  chmod +x "$HOOKS_DIR/"*.sh
  ok "Copied 3 hooks to ${HOOKS_DIR/$HOME/\~}"
fi

# =============================================================================
# STEP 2: Hook configuration (.claude/settings.json)
# =============================================================================
step "Configuring .claude/settings.json..."

SETTINGS_PATH="$CLAUDE_DIR/settings.json"
MF_SETTINGS="$SCRIPT_DIR/.claude/settings.json"

# Prepare a temp copy of MF settings with correct paths for global
if [ "$GLOBAL" = true ]; then
  MF_SETTINGS_TEMP=$(mktemp)
  sed 's|\$CLAUDE_PROJECT_DIR/scripts/hooks|\$HOME/.claude/hooks|g' "$MF_SETTINGS" > "$MF_SETTINGS_TEMP"
  MF_SETTINGS="$MF_SETTINGS_TEMP"
fi

if [ -f "$SETTINGS_PATH" ]; then
  if grep -q "session-start.sh" "$SETTINGS_PATH" 2>/dev/null; then
    skip ".claude/settings.json already has MemoryForge hooks"
  else
    # Smart merge using inline Node.js
    if [ "$DRY_RUN" = true ]; then
      dry "Would merge MemoryForge hooks into existing settings.json"
    else
      mkdir -p "$CLAUDE_DIR"
      cp "$SETTINGS_PATH" "${SETTINGS_PATH}.backup"
      EXISTING_FILE="$SETTINGS_PATH" MF_FILE="$MF_SETTINGS" node -e "
        const fs = require('fs');
        const existing = JSON.parse(fs.readFileSync(process.env.EXISTING_FILE, 'utf-8'));
        const mf = JSON.parse(fs.readFileSync(process.env.MF_FILE, 'utf-8'));
        existing.hooks = existing.hooks || {};
        for (const [event, handlers] of Object.entries(mf.hooks || {})) {
          if (!existing.hooks[event]) {
            existing.hooks[event] = handlers;
          } else {
            const existingStr = JSON.stringify(existing.hooks[event]);
            for (const handler of handlers) {
              if (!existingStr.includes(JSON.stringify(handler).slice(1, -1))) {
                existing.hooks[event].push(handler);
              }
            }
          }
        }
        fs.writeFileSync(process.env.EXISTING_FILE, JSON.stringify(existing, null, 2) + '\n');
      " 2>/dev/null && ok "Merged hooks into existing settings.json" || {
        warn "Merge failed — saving reference config instead."
        cp "$MF_SETTINGS" "$CLAUDE_DIR/settings.memoryforge.json"
        ok "Saved reference: .claude/settings.memoryforge.json"
      }
    fi
  fi
else
  if [ "$DRY_RUN" = true ]; then
    dry "Would create .claude/settings.json"
  else
    mkdir -p "$CLAUDE_DIR"
    cp "$MF_SETTINGS" "$SETTINGS_PATH"
    ok "Created .claude/settings.json"
  fi
fi

# Clean up temp file
[ "${MF_SETTINGS_TEMP:-}" ] && rm -f "$MF_SETTINGS_TEMP" 2>/dev/null || true

# =============================================================================
# STEP 3: MCP Memory Server (.mcp.json)
# =============================================================================
step "Configuring MCP memory server..."

MCP_JSON="$TARGET_DIR/.mcp.json"
MF_MCP_JSON="$SCRIPT_DIR/.mcp.json"

if [ "$GLOBAL" = true ]; then
  MCP_SERVER_DEST="$HOME/.claude/mcp-memory-server.js"
  if [ "$DRY_RUN" = true ]; then
    dry "Would copy MCP server to $MCP_SERVER_DEST"
  else
    cp "$SCRIPT_DIR/scripts/mcp-memory-server.js" "$MCP_SERVER_DEST"
    ok "Copied MCP server to ~/.claude/"
  fi
  ok "Note: Add to each project's .mcp.json:"
  ok '  {"mcpServers":{"memory":{"command":"node","args":["~/.claude/mcp-memory-server.js"]}}}'
elif [ -f "$MCP_JSON" ]; then
  if grep -q "mcp-memory-server\|memoryforge" "$MCP_JSON" 2>/dev/null; then
    skip ".mcp.json already has MemoryForge memory server"
  else
    if [ "$DRY_RUN" = true ]; then
      dry "Would add memory server to existing .mcp.json"
    else
      cp "$MCP_JSON" "${MCP_JSON}.backup"
      MCP_FILE="$MCP_JSON" MF_FILE="$MF_MCP_JSON" node -e "
        const fs = require('fs');
        const existing = JSON.parse(fs.readFileSync(process.env.MCP_FILE, 'utf-8'));
        const mf = JSON.parse(fs.readFileSync(process.env.MF_FILE, 'utf-8'));
        existing.mcpServers = existing.mcpServers || {};
        Object.assign(existing.mcpServers, mf.mcpServers);
        fs.writeFileSync(process.env.MCP_FILE, JSON.stringify(existing, null, 2) + '\n');
      " 2>/dev/null && ok "Added memory server to existing .mcp.json" || {
        warn "Could not merge .mcp.json — saving reference copy"
        cp "$MF_MCP_JSON" "${TARGET_DIR}/.mcp.memoryforge.json"
      }
    fi
  fi
else
  if [ "$DRY_RUN" = true ]; then
    dry "Would create .mcp.json with memory server"
  else
    cp "$MF_MCP_JSON" "$MCP_JSON"
    ok "Created .mcp.json with MCP memory server"
  fi
fi

# Copy MCP server and supporting scripts to project
if [ "$GLOBAL" != true ]; then
  if [ "$DRY_RUN" = true ]; then
    dry "Would copy scripts to $TARGET_DIR/scripts/"
  else
    mkdir -p "$TARGET_DIR/scripts"
    for script in mcp-memory-server.js config-keys.js compress-sessions.js; do
      if [ -f "$SCRIPT_DIR/scripts/$script" ]; then
        cp "$SCRIPT_DIR/scripts/$script" "$TARGET_DIR/scripts/$script"
      fi
    done
    ok "Copied MCP server and supporting scripts to scripts/"
  fi
fi

# =============================================================================
# STEP 4: .mind/ state files (always project-level)
# =============================================================================
step "Creating .mind/ state files..."

if [ "$GLOBAL" = true ]; then
  ok "Skipped — .mind/ is always per-project."
  ok "Run the installer on a project to create .mind/ files."
else
  if [ "$DRY_RUN" = true ]; then
    for file in STATE.md DECISIONS.md PROGRESS.md SESSION-LOG.md; do
      if [ -f "$TARGET_DIR/.mind/$file" ]; then
        skip ".mind/$file"
      else
        dry "Would create .mind/$file"
      fi
    done
  else
    mkdir -p "$TARGET_DIR/.mind/checkpoints"
    for file in STATE.md DECISIONS.md PROGRESS.md SESSION-LOG.md; do
      if [ -f "$TARGET_DIR/.mind/$file" ]; then
        skip ".mind/$file"
      else
        cp "$SCRIPT_DIR/templates/.mind/$file" "$TARGET_DIR/.mind/$file"
        ok "Created .mind/$file"
      fi
    done
  fi
fi

# =============================================================================
# STEP 5: .gitignore (project-level only)
# =============================================================================
step "Updating .gitignore..."

if [ "$GLOBAL" = true ]; then
  ok "Skipped — .gitignore is per-project."
else
  GITIGNORE="$TARGET_DIR/.gitignore"
  ENTRIES=(
    "# MemoryForge auto-generated tracking files"
    ".mind/.last-activity"
    ".mind/.agent-activity"
    ".mind/.task-completions"
    ".mind/.session-tracking"
    ".mind/.file-tracker"
    ".mind/.write-lock"
    ".mind/.prompt-context"
    ".mind/.mcp-errors.log"
    ".mind/ARCHIVE.md"
    ".mind/checkpoints/"
    "*.pre-compress"
  )

  if [ -f "$GITIGNORE" ] && grep -qF "MemoryForge" "$GITIGNORE" 2>/dev/null; then
    skip ".gitignore already has MemoryForge entries"
  else
    if [ "$DRY_RUN" = true ]; then
      dry "Would add MemoryForge entries to .gitignore"
    else
      echo "" >> "$GITIGNORE"
      for entry in "${ENTRIES[@]}"; do
        echo "$entry" >> "$GITIGNORE"
      done
      ok "Updated .gitignore"
    fi
  fi
fi

# =============================================================================
# STEP 6: CLAUDE.md — Mind Protocol (default for project-level)
# =============================================================================
if [ "$GLOBAL" != true ] && [ "$NO_CLAUDE_MD" != true ]; then
  step "Adding Mind Protocol to CLAUDE.md..."

  CLAUDE_MD="$TARGET_DIR/CLAUDE.md"
  TEMPLATE="$SCRIPT_DIR/templates/CLAUDE.md.template"

  if [ ! -f "$TEMPLATE" ]; then
    warn "Template not found: $TEMPLATE"
  elif [ -f "$CLAUDE_MD" ] && grep -q "\.mind/STATE\.md\|Mind Protocol\|MemoryForge" "$CLAUDE_MD" 2>/dev/null; then
    skip "CLAUDE.md already has Mind Protocol / MemoryForge references"
  elif [ -f "$CLAUDE_MD" ]; then
    if [ "$DRY_RUN" = true ]; then
      dry "Would append Mind Protocol section to existing CLAUDE.md"
    else
      echo "" >> "$CLAUDE_MD"
      echo "" >> "$CLAUDE_MD"
      cat "$TEMPLATE" >> "$CLAUDE_MD"
      ok "Appended Mind Protocol to existing CLAUDE.md"
    fi
  else
    if [ "$DRY_RUN" = true ]; then
      dry "Would create CLAUDE.md with Mind Protocol"
    else
      cp "$TEMPLATE" "$CLAUDE_MD"
      ok "Created CLAUDE.md with Mind Protocol"
    fi
  fi
fi

# =============================================================================
# VERSION TRACKING
# =============================================================================
if [ "$GLOBAL" != true ]; then
  VERSION_FILE="$TARGET_DIR/.memoryforge-version"
  if [ "$DRY_RUN" = true ]; then
    if [ -f "$VERSION_FILE" ]; then
      INSTALLED_VERSION=$(cat "$VERSION_FILE" 2>/dev/null || echo "unknown")
      if [ "$INSTALLED_VERSION" != "$MEMORYFORGE_VERSION" ]; then
        dry "Would upgrade version tracking: $INSTALLED_VERSION → $MEMORYFORGE_VERSION"
      fi
    else
      dry "Would create .memoryforge-version ($MEMORYFORGE_VERSION)"
    fi
  else
    if [ -f "$VERSION_FILE" ]; then
      INSTALLED_VERSION=$(cat "$VERSION_FILE" 2>/dev/null || echo "unknown")
      if [ "$INSTALLED_VERSION" != "$MEMORYFORGE_VERSION" ]; then
        echo -e "  ${CYAN}Upgrade detected:${NC} $INSTALLED_VERSION → $MEMORYFORGE_VERSION"
      fi
    fi
    echo "$MEMORYFORGE_VERSION" > "$VERSION_FILE"
  fi
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
if [ "$DRY_RUN" = true ]; then
  echo -e "${BOLD}${CYAN}  Dry run complete. No files were modified.${NC}"
  echo -e "  ${DIM}Run without --dry-run to apply changes.${NC}"
else
  echo -e "${BOLD}${GREEN}  Installation complete. (v$MEMORYFORGE_VERSION)${NC}"
fi
echo ""

echo -e "  ${BOLD}Installed:${NC}"
echo -e "    ${GREEN}+${NC} 3 hook scripts"
echo -e "    ${GREEN}+${NC} .claude/settings.json ${DIM}(smart-merged if existing)${NC}"
echo -e "    ${GREEN}+${NC} MCP memory server ${DIM}(6 tools for querying/updating .mind/)${NC}"
if [ "$GLOBAL" != true ]; then
  echo -e "    ${GREEN}+${NC} .mind/ state files (4 templates)"
  echo -e "    ${GREEN}+${NC} .gitignore entries"
  if [ "$NO_CLAUDE_MD" != true ]; then
    echo -e "    ${GREEN}+${NC} Mind Protocol in CLAUDE.md"
  fi
fi

echo ""
echo -e "  ${BOLD}Next steps:${NC}"
if [ "$GLOBAL" != true ]; then
  echo -e "    1. Edit .mind/STATE.md with your project's current state"
  echo -e "    2. Run ${CYAN}claude${NC} — the session-start hook fires automatically"
else
  echo -e "    1. Run ${CYAN}claude${NC} in any project — hooks fire automatically"
  echo -e "    2. Create .mind/ per-project: ${CYAN}bash install.sh /path/to/project${NC}"
fi
echo ""
echo -e "  ${DIM}Docs: https://github.com/marolinik/MemoryForge${NC}"
echo ""
