#!/usr/bin/env bash
# =============================================================================
# MemoryForge Installer
# =============================================================================
# Persistent memory for Claude Code — hooks + state files + extensions.
#
# Install modes:
#   bash install.sh [target-dir]                  # Core (project-level)
#   bash install.sh [target-dir] --with-team      # Core + Team agents
#   bash install.sh [target-dir] --full           # Core + all extensions
#   bash install.sh --global                      # Core (user-level, all projects)
#   bash install.sh --global --full               # User-level + all extensions
#
# Brownfield features:
#   bash install.sh [target-dir] --dry-run        # Preview changes only
#   bash install.sh [target-dir] --no-claude-md   # Skip CLAUDE.md injection
#   bash install.sh [target-dir] --uninstall      # Remove MemoryForge cleanly
#
# Docs: https://github.com/marolinik/MemoryForge
# =============================================================================

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# --- Parse flags ---
GLOBAL=false
WITH_TEAM=false
WITH_VECTOR=false
WITH_GRAPH=false
DRY_RUN=false
NO_CLAUDE_MD=false
UNINSTALL=false
TARGET_ARG=""

for arg in "$@"; do
  case "$arg" in
    --global)           GLOBAL=true ;;
    --with-team)        WITH_TEAM=true ;;
    --with-vector)      WITH_VECTOR=true ;;
    --with-graph)       WITH_GRAPH=true ;;
    --full)             WITH_TEAM=true; WITH_VECTOR=true; WITH_GRAPH=true ;;
    --dry-run)          DRY_RUN=true ;;
    --no-claude-md)     NO_CLAUDE_MD=true ;;
    --uninstall)        UNINSTALL=true ;;
    --help|-h)
      echo "Usage: bash install.sh [target-dir] [flags]"
      echo ""
      echo "Install flags:"
      echo "  --global           Install to ~/.claude/ (all projects)"
      echo "  --with-team        Include team agents (orchestrator + builder)"
      echo "  --with-vector      Include vector memory extension"
      echo "  --with-graph       Include graph memory extension (Neo4j)"
      echo "  --full             Include all extensions"
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

  REMOVED=0

  # 1. Remove hook scripts
  if [ "$GLOBAL" = true ]; then
    HOOKS_DIR="$HOME/.claude/hooks"
  else
    HOOKS_DIR="$TARGET_DIR/scripts/hooks"
  fi

  MF_HOOKS="session-start.sh pre-compact.sh user-prompt-context.sh stop-checkpoint.sh session-end.sh subagent-start.sh subagent-stop.sh task-completed.sh"

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
      # Also try removing parent scripts/ if empty
      SCRIPTS_DIR="$(dirname "$HOOKS_DIR")"
      if [ "$(basename "$SCRIPTS_DIR")" = "scripts" ] && [ -z "$(ls -A "$SCRIPTS_DIR" 2>/dev/null)" ]; then
        rmdir "$SCRIPTS_DIR" 2>/dev/null || true
      fi
    fi
  fi

  # 2. Remove MemoryForge hooks from settings.json
  SETTINGS_PATH="$CLAUDE_DIR/settings.json"
  if [ -f "$SETTINGS_PATH" ]; then
    MERGE_FLAGS=""
    [ "$DRY_RUN" = true ] && MERGE_FLAGS="--dry-run"

    MERGE_RESULT=$(node "$SCRIPT_DIR/scripts/merge-settings.js" "$SETTINGS_PATH" --uninstall $MERGE_FLAGS 2>/dev/null || echo '{"result":"error"}')
    MERGE_STATUS=$(echo "$MERGE_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).result)}catch{console.log('error')}})" 2>/dev/null || echo "error")

    if [ "$MERGE_STATUS" = "uninstalled" ] || [ "$MERGE_STATUS" = "dry-run" ]; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove MemoryForge hooks from settings.json"
      else
        ok "Removed MemoryForge hooks from settings.json"
      fi
      REMOVED=$((REMOVED + 1))
    elif [ "$MERGE_STATUS" = "skip" ]; then
      skip "No MemoryForge hooks in settings.json"
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
    # Remove MCP server script from scripts/
    MCP_SERVER="$TARGET_DIR/scripts/mcp-memory-server.js"
    if [ -f "$MCP_SERVER" ]; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove $MCP_SERVER"
      else
        rm -f "$MCP_SERVER"
        ok "Removed scripts/mcp-memory-server.js"
      fi
      REMOVED=$((REMOVED + 1))
    fi

    # Remove "memory" entry from .mcp.json (smart removal)
    MCP_JSON="$TARGET_DIR/.mcp.json"
    if [ -f "$MCP_JSON" ] && grep -q "mcp-memory-server\|memoryforge" "$MCP_JSON" 2>/dev/null; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove memory server from .mcp.json"
      else
        cp "$MCP_JSON" "${MCP_JSON}.backup"
        node -e "
          const fs = require('fs');
          const mcp = JSON.parse(fs.readFileSync('$MCP_JSON', 'utf-8'));
          if (mcp.mcpServers && mcp.mcpServers.memory) {
            delete mcp.mcpServers.memory;
          }
          if (Object.keys(mcp.mcpServers || {}).length === 0) {
            fs.unlinkSync('$MCP_JSON');
          } else {
            fs.writeFileSync('$MCP_JSON', JSON.stringify(mcp, null, 2) + '\n');
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

    # Remove .mcp.json backup/reference
    for ref in "${MCP_JSON}.backup" "$TARGET_DIR/.mcp.memoryforge.json"; do
      if [ -f "$ref" ]; then
        if [ "$DRY_RUN" = true ]; then
          dry "Would remove $(basename "$ref")"
        else
          rm -f "$ref"
        fi
      fi
    done
  fi

  # 4. Remove agents
  MF_AGENTS="mind.md orchestrator.md builder.md"
  for agent in $MF_AGENTS; do
    AGENT_PATH="$CLAUDE_DIR/agents/$agent"
    if [ -f "$AGENT_PATH" ]; then
      # Only remove if it's a MemoryForge agent (check for signature)
      if grep -q "MemoryForge\|\.mind/" "$AGENT_PATH" 2>/dev/null; then
        if [ "$DRY_RUN" = true ]; then
          dry "Would remove $AGENT_PATH"
        else
          rm -f "$AGENT_PATH"
          ok "Removed agents/$agent"
        fi
        REMOVED=$((REMOVED + 1))
      else
        skip "agents/$agent doesn't appear to be from MemoryForge"
      fi
    fi
  done

  # 5. Remove tracking files (NOT state files — those are user data)
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

    # Remove checkpoints directory
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

  # 6. Remove reference config
  for ref in "$CLAUDE_DIR/settings.memoryforge.json" "$CLAUDE_DIR/settings.json.backup"; do
    if [ -f "$ref" ]; then
      if [ "$DRY_RUN" = true ]; then
        dry "Would remove $(basename "$ref")"
      else
        rm -f "$ref"
        ok "Removed $(basename "$ref")"
      fi
    fi
  done

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

# Count extensions
EXT_COUNT=0
EXT_LIST=""
[ "$WITH_TEAM" = true ]   && EXT_COUNT=$((EXT_COUNT + 1)) && EXT_LIST+="team "
[ "$WITH_VECTOR" = true ] && EXT_COUNT=$((EXT_COUNT + 1)) && EXT_LIST+="vector "
[ "$WITH_GRAPH" = true ]  && EXT_COUNT=$((EXT_COUNT + 1)) && EXT_LIST+="graph "

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
echo -e "  ${CYAN}Scope${NC}   Core + ${EXT_COUNT} extension(s)${DIM}${EXT_LIST:+ ($EXT_LIST)}${NC}"
echo ""

# --- Detect existing memory systems ---
if [ "$GLOBAL" != true ]; then
  DETECT_RESULT=$(node "$SCRIPT_DIR/scripts/detect-existing.js" "$TARGET_DIR" 2>/dev/null || echo '{"findings_count":0}')
  FINDINGS_COUNT=$(echo "$DETECT_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).findings_count)}catch{console.log(0)}})" 2>/dev/null || echo "0")

  if [ "$FINDINGS_COUNT" -gt 0 ] 2>/dev/null; then
    echo -e "${YELLOW}  Existing memory systems detected:${NC}"
    echo "$DETECT_RESULT" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        try {
          const r = JSON.parse(d);
          for (const f of r.findings) {
            console.log('    - ' + f.system + ': ' + f.note);
          }
        } catch {}
      })
    " 2>/dev/null || true
    echo ""
  fi
fi

# Calculate total steps (7 base steps for project-level, 6 for global)
if [ "$GLOBAL" = true ] || [ "$NO_CLAUDE_MD" = true ]; then
  total_steps=6
else
  total_steps=7
fi
[ "$WITH_TEAM" = true ]   && total_steps=$((total_steps + 1))
[ "$WITH_VECTOR" = true ] && total_steps=$((total_steps + 1))
[ "$WITH_GRAPH" = true ]  && total_steps=$((total_steps + 1))

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
  dry "Would copy 8 hooks to $HOOKS_DIR"
else
  mkdir -p "$HOOKS_DIR"
  cp "$SCRIPT_DIR/scripts/hooks/"*.sh "$HOOKS_DIR/"
  chmod +x "$HOOKS_DIR/"*.sh
  ok "Copied 8 hooks to ${HOOKS_DIR/$HOME/\~}"
fi

# =============================================================================
# STEP 2: Hook configuration (.claude/settings.json) — SMART MERGE
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
    # Smart merge
    if [ "$DRY_RUN" = true ]; then
      dry "Would smart-merge MemoryForge hooks into existing settings.json"
      node "$SCRIPT_DIR/scripts/merge-settings.js" "$SETTINGS_PATH" "$MF_SETTINGS" --dry-run 2>/dev/null | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
          try {
            const r = JSON.parse(d);
            if (r.changes) r.changes.forEach(c => console.log('      ' + c));
          } catch {}
        })
      " 2>/dev/null || true
    else
      mkdir -p "$CLAUDE_DIR"
      MERGE_RESULT=$(node "$SCRIPT_DIR/scripts/merge-settings.js" "$SETTINGS_PATH" "$MF_SETTINGS" 2>/dev/null || echo '{"result":"error"}')
      MERGE_STATUS=$(echo "$MERGE_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).result)}catch{console.log('error')}})" 2>/dev/null || echo "error")

      if [ "$MERGE_STATUS" = "merged" ]; then
        ok "Smart-merged hooks into existing settings.json"
        ok "Backup saved: settings.json.backup"
      elif [ "$MERGE_STATUS" = "skip" ]; then
        skip "All hooks already present"
      else
        warn "Smart merge failed — saving reference config instead."
        cp "$MF_SETTINGS" "$CLAUDE_DIR/settings.memoryforge.json"
        ok "Saved reference: .claude/settings.memoryforge.json"
      fi
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

# For global installs, copy MCP server script to ~/.claude/
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
    # Smart merge: add our server to existing .mcp.json
    if [ "$DRY_RUN" = true ]; then
      dry "Would add memory server to existing .mcp.json"
    else
      # Backup
      cp "$MCP_JSON" "${MCP_JSON}.backup"
      # Use node to merge
      node -e "
        const fs = require('fs');
        const existing = JSON.parse(fs.readFileSync('$MCP_JSON', 'utf-8'));
        const mf = JSON.parse(fs.readFileSync('$MF_MCP_JSON', 'utf-8'));
        existing.mcpServers = existing.mcpServers || {};
        Object.assign(existing.mcpServers, mf.mcpServers);
        fs.writeFileSync('$MCP_JSON', JSON.stringify(existing, null, 2) + '\n');
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

# Copy MCP server script to project
if [ "$GLOBAL" != true ]; then
  MCP_SERVER_DEST="$TARGET_DIR/scripts/mcp-memory-server.js"
  if [ "$DRY_RUN" = true ]; then
    dry "Would copy mcp-memory-server.js to scripts/"
  else
    mkdir -p "$TARGET_DIR/scripts"
    cp "$SCRIPT_DIR/scripts/mcp-memory-server.js" "$MCP_SERVER_DEST"
    ok "Copied MCP memory server to scripts/"
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
# STEP 5: Mind agent
# =============================================================================
step "Installing Mind agent..."

MIND_AGENT="$CLAUDE_DIR/agents/mind.md"
if [ -f "$MIND_AGENT" ]; then
  skip ".claude/agents/mind.md"
else
  if [ "$DRY_RUN" = true ]; then
    dry "Would create .claude/agents/mind.md"
  else
    mkdir -p "$CLAUDE_DIR/agents"
    cp "$SCRIPT_DIR/.claude/agents/mind.md" "$MIND_AGENT"
    ok "Created .claude/agents/mind.md"
  fi
fi

# =============================================================================
# STEP 6: .gitignore (project-level only)
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
    ".mind/checkpoints/"
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
# STEP 7: CLAUDE.md — Mind Protocol (default for project-level)
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
      TEMPLATE_LINES=$(wc -l < "$TEMPLATE")
      dry "(~$TEMPLATE_LINES lines from templates/CLAUDE.md.template)"
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
# EXTENSIONS
# =============================================================================

if [ "$WITH_TEAM" = true ]; then
  step "Installing Team Memory extension..."

  for agent in orchestrator.md builder.md; do
    DEST="$CLAUDE_DIR/agents/$agent"
    if [ -f "$DEST" ]; then
      skip ".claude/agents/$agent"
    else
      if [ "$DRY_RUN" = true ]; then
        dry "Would create .claude/agents/$agent"
      else
        mkdir -p "$CLAUDE_DIR/agents"
        cp "$SCRIPT_DIR/extensions/team-memory/agents/$agent" "$DEST"
        ok "Created .claude/agents/$agent"
      fi
    fi
  done
fi

if [ "$WITH_VECTOR" = true ]; then
  step "Installing Vector Memory extension..."

  if [ "$GLOBAL" = true ]; then
    VECTOR_DIR="$HOME/.claude/extensions/vector-memory"
  else
    VECTOR_DIR="$TARGET_DIR/extensions/vector-memory"
  fi

  if [ "$DRY_RUN" = true ]; then
    dry "Would install vector-memory extension to $VECTOR_DIR"
  else
    mkdir -p "$VECTOR_DIR"
    cp "$SCRIPT_DIR/extensions/vector-memory/README.md" "$VECTOR_DIR/README.md"
    ok "Installed vector-memory extension"
  fi
fi

if [ "$WITH_GRAPH" = true ]; then
  step "Installing Graph Memory extension..."

  if [ "$GLOBAL" = true ]; then
    GRAPH_DIR="$HOME/.claude/extensions/graph-memory"
  else
    GRAPH_DIR="$TARGET_DIR/extensions/graph-memory"
  fi

  if [ "$DRY_RUN" = true ]; then
    dry "Would install graph-memory extension to $GRAPH_DIR"
  else
    mkdir -p "$GRAPH_DIR"
    cp "$SCRIPT_DIR/extensions/graph-memory/README.md" "$GRAPH_DIR/README.md"
    cp "$SCRIPT_DIR/extensions/graph-memory/docker-compose.yml" "$GRAPH_DIR/docker-compose.yml"
    ok "Installed graph-memory extension"
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
  echo -e "${BOLD}${GREEN}  Installation complete.${NC}"
fi
echo ""

echo -e "  ${BOLD}Installed:${NC}"
echo -e "    ${GREEN}+${NC} 8 hook scripts"
echo -e "    ${GREEN}+${NC} .claude/settings.json ${DIM}(smart-merged if existing)${NC}"
echo -e "    ${GREEN}+${NC} MCP memory server ${DIM}(6 tools for querying/updating .mind/)${NC}"
echo -e "    ${GREEN}+${NC} Mind agent"
if [ "$GLOBAL" != true ]; then
  echo -e "    ${GREEN}+${NC} .mind/ state files (4 templates)"
  echo -e "    ${GREEN}+${NC} .gitignore entries"
  if [ "$NO_CLAUDE_MD" != true ]; then
    echo -e "    ${GREEN}+${NC} Mind Protocol in CLAUDE.md"
  fi
fi
[ "$WITH_TEAM" = true ]   && echo -e "    ${GREEN}+${NC} Team agents (orchestrator + builder)"
[ "$WITH_VECTOR" = true ] && echo -e "    ${GREEN}+${NC} Vector memory extension"
[ "$WITH_GRAPH" = true ]  && echo -e "    ${GREEN}+${NC} Graph memory extension (Neo4j)"

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
