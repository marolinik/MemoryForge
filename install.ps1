# =============================================================================
# MemoryForge Installer (Windows PowerShell)
# =============================================================================
# Usage: .\install.ps1 [-TargetDir "C:\path\to\project"]
#
# If no target directory is provided, installs into the current directory.
# =============================================================================

param(
    [string]$TargetDir = "."
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetDir = (Resolve-Path $TargetDir).Path

Write-Host "=== MemoryForge Installer ===" -ForegroundColor Blue
Write-Host "Source:  $ScriptDir"
Write-Host "Target:  $TargetDir"
Write-Host ""

# --- 1. Copy hook scripts ---
Write-Host "[1/5] Installing hook scripts..." -ForegroundColor Yellow
$hooksDir = Join-Path $TargetDir "scripts\hooks"
New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
Copy-Item "$ScriptDir\scripts\hooks\*.sh" $hooksDir -Force
Write-Host "  Copied 8 hook scripts to scripts\hooks\" -ForegroundColor Green

# --- 2. Install or merge .claude/settings.json ---
Write-Host "[2/5] Configuring hooks in .claude\settings.json..." -ForegroundColor Yellow
$claudeDir = Join-Path $TargetDir ".claude"
New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null

$settingsPath = Join-Path $claudeDir "settings.json"
if (Test-Path $settingsPath) {
    $content = Get-Content $settingsPath -Raw
    if ($content -match "session-start\.sh") {
        Write-Host "  Hooks already configured in .claude\settings.json (skipped)" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: .claude\settings.json exists but has no MemoryForge hooks." -ForegroundColor Yellow
        Write-Host "  Manually merge hooks from: $ScriptDir\.claude\settings.json" -ForegroundColor Yellow
        Copy-Item "$ScriptDir\.claude\settings.json" (Join-Path $claudeDir "settings.memoryforge.json")
        Write-Host "  Saved reference config to .claude\settings.memoryforge.json" -ForegroundColor Green
    }
} else {
    Copy-Item "$ScriptDir\.claude\settings.json" $settingsPath
    Write-Host "  Created .claude\settings.json with hook configuration" -ForegroundColor Green
}

# --- 3. Create .mind/ directory with templates ---
Write-Host "[3/5] Creating .mind\ directory..." -ForegroundColor Yellow
$mindDir = Join-Path $TargetDir ".mind"
$checkpointDir = Join-Path $mindDir "checkpoints"
New-Item -ItemType Directory -Force -Path $checkpointDir | Out-Null

foreach ($file in @("STATE.md", "DECISIONS.md", "PROGRESS.md", "SESSION-LOG.md")) {
    $dest = Join-Path $mindDir $file
    if (Test-Path $dest) {
        Write-Host "  .mind\$file already exists (skipped)" -ForegroundColor Green
    } else {
        Copy-Item (Join-Path $ScriptDir "templates\.mind\$file") $dest
        Write-Host "  Created .mind\$file" -ForegroundColor Green
    }
}

# --- 4. Install Mind agent ---
Write-Host "[4/5] Installing Mind agent..." -ForegroundColor Yellow
$agentsDir = Join-Path $claudeDir "agents"
New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null

$mindAgent = Join-Path $agentsDir "mind.md"
if (Test-Path $mindAgent) {
    Write-Host "  .claude\agents\mind.md already exists (skipped)" -ForegroundColor Green
} else {
    Copy-Item "$ScriptDir\.claude\agents\mind.md" $mindAgent
    Write-Host "  Created .claude\agents\mind.md" -ForegroundColor Green
}

# --- 5. Update .gitignore ---
Write-Host "[5/5] Updating .gitignore..." -ForegroundColor Yellow

$gitignoreEntries = @(
    "",
    "# MemoryForge auto-generated tracking files",
    ".mind/.last-activity",
    ".mind/.agent-activity",
    ".mind/.task-completions",
    ".mind/.session-tracking",
    ".mind/checkpoints/"
)

$gitignorePath = Join-Path $TargetDir ".gitignore"
if (Test-Path $gitignorePath) {
    $content = Get-Content $gitignorePath -Raw
    if ($content -match "MemoryForge") {
        Write-Host "  .gitignore already has MemoryForge entries (skipped)" -ForegroundColor Green
    } else {
        $gitignoreEntries | Out-File -Append -Encoding utf8 $gitignorePath
        Write-Host "  Updated .gitignore with MemoryForge entries" -ForegroundColor Green
    }
} else {
    $gitignoreEntries | Out-File -Encoding utf8 $gitignorePath
    Write-Host "  Created .gitignore with MemoryForge entries" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== MemoryForge installed successfully! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Add the Mind Protocol section to your CLAUDE.md"
Write-Host "     (see templates\CLAUDE.md.template for reference)"
Write-Host "  2. Edit .mind\STATE.md with your project's current state"
Write-Host "  3. Start Claude Code in your project directory"
Write-Host "  4. The session-start hook will inject your .mind\ state automatically"
Write-Host ""
Write-Host "Files installed:"
Write-Host "  scripts\hooks\*.sh        - 8 hook scripts"
Write-Host "  .claude\settings.json     - Hook configuration"
Write-Host "  .claude\agents\mind.md    - Mind agent definition"
Write-Host "  .mind\*.md                - State tracking files"
Write-Host ""
Write-Host "Tip: Commit .mind\STATE.md, PROGRESS.md, DECISIONS.md, and SESSION-LOG.md" -ForegroundColor Blue
Write-Host "to version control. The auto-generated tracking files are gitignored." -ForegroundColor Blue
