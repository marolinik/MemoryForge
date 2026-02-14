#!/usr/bin/env bash
# =============================================================================
# MemoryForge Installer
# =============================================================================
# Persistent memory for Claude Code — hooks + state files + extensions.
#
# Usage:
#   bash install.sh [target-dir]                  # Core (project-level)
#   bash install.sh [target-dir] --with-team      # Core + Team agents
#   bash install.sh [target-dir] --with-vector    # Core + Vector memory
#   bash install.sh [target-dir] --with-graph     # Core + Graph memory
#   bash install.sh [target-dir] --full           # Core + all extensions
#   bash install.sh --global                      # Core (user-level, all projects)
#   bash install.sh --global --with-team          # User-level + Team agents
#   bash install.sh --global --full               # User-level + all extensions
#
# Project-level: installs into a specific project directory.
# User-level (--global): installs hooks into ~/.claude/ so ALL projects get memory.
#   Note: .mind/ state files are always per-project (created on first session).
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
TARGET_ARG=""

for arg in "$@"; do
  case "$arg" in
    --global)      GLOBAL=true ;;
    --with-team)   WITH_TEAM=true ;;
    --with-vector) WITH_VECTOR=true ;;
    --with-graph)  WITH_GRAPH=true ;;
    --full)        WITH_TEAM=true; WITH_VECTOR=true; WITH_GRAPH=true ;;
    --help|-h)
      echo "Usage: bash install.sh [target-dir] [flags]"
      echo ""
      echo "Flags:"
      echo "  --global        Install to ~/.claude/ (all projects)"
      echo "  --with-team     Include team agents (orchestrator + builder)"
      echo "  --with-vector   Include vector memory extension"
      echo "  --with-graph    Include graph memory extension (Neo4j)"
      echo "  --full          Include all extensions"
      echo "  --help          Show this help"
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
  HOOKS_BASE="$HOME/.claude"
  TARGET_DIR="(global — all projects)"
  SCOPE="user"
else
  if [ -n "$TARGET_ARG" ]; then
    TARGET_DIR="$(cd "$TARGET_ARG" && pwd)"
  else
    TARGET_DIR="$(pwd)"
  fi
  CLAUDE_DIR="$TARGET_DIR/.claude"
  HOOKS_BASE="$TARGET_DIR"
  SCOPE="project"
fi

# --- Count extensions ---
EXT_COUNT=0
EXT_LIST=""
[ "$WITH_TEAM" = true ]   && EXT_COUNT=$((EXT_COUNT + 1)) && EXT_LIST+="team "
[ "$WITH_VECTOR" = true ] && EXT_COUNT=$((EXT_COUNT + 1)) && EXT_LIST+="vector "
[ "$WITH_GRAPH" = true ]  && EXT_COUNT=$((EXT_COUNT + 1)) && EXT_LIST+="graph "

# --- Header ---
echo ""
echo -e "${BOLD}${BLUE}  MemoryForge Installer${NC}"
echo -e "${DIM}  Persistent memory for Claude Code${NC}"
echo ""
echo -e "  ${CYAN}Source${NC}  $SCRIPT_DIR"
if [ "$GLOBAL" = true ]; then
  echo -e "  ${CYAN}Target${NC}  ~/.claude/ ${DIM}(user-level — all projects)${NC}"
else
  echo -e "  ${CYAN}Target${NC}  $TARGET_DIR ${DIM}(project-level)${NC}"
fi
echo -e "  ${CYAN}Scope${NC}   Core + ${EXT_COUNT} extension(s)${DIM}${EXT_LIST:+ ($EXT_LIST)}${NC}"
echo ""

# --- Calculate total steps ---
TOTAL_STEPS=5
[ "$WITH_TEAM" = true ]   && TOTAL_STEPS=$((TOTAL_STEPS + 1))
[ "$WITH_VECTOR" = true ] && TOTAL_STEPS=$((TOTAL_STEPS + 1))
[ "$WITH_GRAPH" = true ]  && TOTAL_STEPS=$((TOTAL_STEPS + 1))
STEP=0

step() {
  STEP=$((STEP + 1))
  echo -e "${YELLOW}[$STEP/$TOTAL_STEPS]${NC} $1"
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

# =============================================================================
# STEP 1: Hook scripts
# =============================================================================
step "Installing hook scripts..."

if [ "$GLOBAL" = true ]; then
  HOOKS_DIR="$HOME/.claude/hooks"
else
  HOOKS_DIR="$HOOKS_BASE/scripts/hooks"
fi

mkdir -p "$HOOKS_DIR"
cp "$SCRIPT_DIR/scripts/hooks/"*.sh "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR/"*.sh
ok "Copied 8 hooks to ${HOOKS_DIR/$HOME/\~}"

# =============================================================================
# STEP 2: Hook configuration (.claude/settings.json)
# =============================================================================
step "Configuring .claude/settings.json..."
mkdir -p "$CLAUDE_DIR"

SETTINGS_PATH="$CLAUDE_DIR/settings.json"

if [ "$GLOBAL" = true ]; then
  # Global install: hooks reference ~/.claude/hooks/ via $HOME
  HOOK_PREFIX='bash \"$HOME/.claude/hooks'
else
  HOOK_PREFIX='bash \"$CLAUDE_PROJECT_DIR/scripts/hooks'
fi

if [ -f "$SETTINGS_PATH" ]; then
  if grep -q "session-start.sh" "$SETTINGS_PATH" 2>/dev/null; then
    skip ".claude/settings.json already has MemoryForge hooks"
  else
    warn "Existing .claude/settings.json found without MemoryForge hooks."
    warn "Saving reference config — merge manually."
    cp "$SCRIPT_DIR/.claude/settings.json" "$CLAUDE_DIR/settings.memoryforge.json"
    # If global, patch the reference config with correct paths
    if [ "$GLOBAL" = true ]; then
      sed -i.bak 's|\$CLAUDE_PROJECT_DIR/scripts/hooks|\$HOME/.claude/hooks|g' "$CLAUDE_DIR/settings.memoryforge.json" 2>/dev/null || true
      rm -f "$CLAUDE_DIR/settings.memoryforge.json.bak"
    fi
    ok "Saved reference: .claude/settings.memoryforge.json"
  fi
else
  cp "$SCRIPT_DIR/.claude/settings.json" "$SETTINGS_PATH"
  # If global, patch paths to use ~/.claude/hooks/
  if [ "$GLOBAL" = true ]; then
    sed -i.bak 's|\$CLAUDE_PROJECT_DIR/scripts/hooks|\$HOME/.claude/hooks|g' "$SETTINGS_PATH" 2>/dev/null || true
    rm -f "$SETTINGS_PATH.bak"
  fi
  ok "Created .claude/settings.json"
fi

# =============================================================================
# STEP 3: .mind/ state files (always project-level)
# =============================================================================
step "Creating .mind/ state files..."

if [ "$GLOBAL" = true ]; then
  ok "Skipped — .mind/ is always per-project."
  ok "State files will be created when you run the installer on a project,"
  ok "or you can manually copy templates/.mind/ into any project."
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

# =============================================================================
# STEP 4: Mind agent
# =============================================================================
step "Installing Mind agent..."
mkdir -p "$CLAUDE_DIR/agents"

MIND_AGENT="$CLAUDE_DIR/agents/mind.md"
if [ -f "$MIND_AGENT" ]; then
  skip ".claude/agents/mind.md"
else
  cp "$SCRIPT_DIR/.claude/agents/mind.md" "$MIND_AGENT"
  ok "Created .claude/agents/mind.md"
fi

# =============================================================================
# STEP 5: .gitignore (project-level only)
# =============================================================================
step "Updating .gitignore..."

if [ "$GLOBAL" = true ]; then
  ok "Skipped — .gitignore is per-project."
  ok "Add these lines to your project's .gitignore:"
  echo -e "    ${DIM}.mind/.last-activity${NC}"
  echo -e "    ${DIM}.mind/.agent-activity${NC}"
  echo -e "    ${DIM}.mind/.task-completions${NC}"
  echo -e "    ${DIM}.mind/.session-tracking${NC}"
  echo -e "    ${DIM}.mind/checkpoints/${NC}"
else
  GITIGNORE="$TARGET_DIR/.gitignore"
  ENTRIES=(
    "# MemoryForge auto-generated tracking files"
    ".mind/.last-activity"
    ".mind/.agent-activity"
    ".mind/.task-completions"
    ".mind/.session-tracking"
    ".mind/checkpoints/"
  )

  if [ -f "$GITIGNORE" ] && grep -qF "MemoryForge" "$GITIGNORE" 2>/dev/null; then
    skip ".gitignore already has MemoryForge entries"
  else
    echo "" >> "$GITIGNORE"
    for entry in "${ENTRIES[@]}"; do
      echo "$entry" >> "$GITIGNORE"
    done
    ok "Updated .gitignore"
  fi
fi

# =============================================================================
# EXTENSIONS
# =============================================================================

if [ "$WITH_TEAM" = true ]; then
  step "Installing Team Memory extension..."
  mkdir -p "$CLAUDE_DIR/agents"

  for agent in orchestrator.md builder.md; do
    DEST="$CLAUDE_DIR/agents/$agent"
    if [ -f "$DEST" ]; then
      skip ".claude/agents/$agent"
    else
      cp "$SCRIPT_DIR/extensions/team-memory/agents/$agent" "$DEST"
      ok "Created .claude/agents/$agent"
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

  mkdir -p "$VECTOR_DIR"
  cp "$SCRIPT_DIR/extensions/vector-memory/README.md" "$VECTOR_DIR/README.md"
  ok "Installed vector-memory extension"
  ok "See $VECTOR_DIR/README.md for setup instructions"
fi

if [ "$WITH_GRAPH" = true ]; then
  step "Installing Graph Memory extension..."

  if [ "$GLOBAL" = true ]; then
    GRAPH_DIR="$HOME/.claude/extensions/graph-memory"
  else
    GRAPH_DIR="$TARGET_DIR/extensions/graph-memory"
  fi

  mkdir -p "$GRAPH_DIR"
  cp "$SCRIPT_DIR/extensions/graph-memory/README.md" "$GRAPH_DIR/README.md"
  cp "$SCRIPT_DIR/extensions/graph-memory/docker-compose.yml" "$GRAPH_DIR/docker-compose.yml"
  ok "Installed graph-memory extension"
  ok "Run 'docker compose up -d' in $GRAPH_DIR to start Neo4j"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BOLD}${GREEN}  Installation complete.${NC}"
echo ""

# What was installed
echo -e "  ${BOLD}Installed:${NC}"
echo -e "    ${GREEN}+${NC} 8 hook scripts"
echo -e "    ${GREEN}+${NC} .claude/settings.json"
echo -e "    ${GREEN}+${NC} Mind agent"
if [ "$GLOBAL" != true ]; then
  echo -e "    ${GREEN}+${NC} .mind/ state files (4 templates)"
  echo -e "    ${GREEN}+${NC} .gitignore entries"
fi
[ "$WITH_TEAM" = true ]   && echo -e "    ${GREEN}+${NC} Team agents (orchestrator + builder)"
[ "$WITH_VECTOR" = true ] && echo -e "    ${GREEN}+${NC} Vector memory extension"
[ "$WITH_GRAPH" = true ]  && echo -e "    ${GREEN}+${NC} Graph memory extension (Neo4j)"

echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "    1. Add the Mind Protocol to your CLAUDE.md"
echo -e "       ${DIM}See templates/CLAUDE.md.template${NC}"
if [ "$GLOBAL" != true ]; then
  echo -e "    2. Edit .mind/STATE.md with your project's current state"
  echo -e "    3. Run ${CYAN}claude${NC} — the session-start hook fires automatically"
else
  echo -e "    2. Run ${CYAN}claude${NC} in any project — hooks fire automatically"
  echo -e "    3. Create .mind/ in each project: ${CYAN}bash install.sh /path/to/project${NC}"
fi
echo ""
echo -e "  ${DIM}Docs: https://github.com/marolinik/MemoryForge${NC}"
echo ""
