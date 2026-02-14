# =============================================================================
# MemoryForge Installer (Windows PowerShell)
# =============================================================================
# Usage:
#   .\install.ps1                                        # Core (current dir)
#   .\install.ps1 -TargetDir "C:\my\project"             # Core (specific project)
#   .\install.ps1 -TargetDir "C:\my\project" -WithTeam   # Core + Team agents
#   .\install.ps1 -TargetDir "C:\my\project" -Full       # Core + all extensions
#   .\install.ps1 -Global                                # Core (user-level)
#   .\install.ps1 -Global -Full                          # User-level + everything
#
# Docs: https://github.com/marolinik/MemoryForge
# =============================================================================

param(
    [string]$TargetDir = ".",
    [switch]$Global,
    [switch]$WithTeam,
    [switch]$WithVector,
    [switch]$WithGraph,
    [switch]$Full
)

$ErrorActionPreference = "Stop"

# Expand -Full into individual flags
if ($Full) { $WithTeam = $true; $WithVector = $true; $WithGraph = $true }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Determine target
if ($Global) {
    $ClaudeDir = Join-Path $env:USERPROFILE ".claude"
    $Scope = "user"
} else {
    $TargetDir = (Resolve-Path $TargetDir).Path
    $ClaudeDir = Join-Path $TargetDir ".claude"
    $Scope = "project"
}

# Count extensions
$extNames = @()
if ($WithTeam)   { $extNames += "team" }
if ($WithVector) { $extNames += "vector" }
if ($WithGraph)  { $extNames += "graph" }

# Header
Write-Host ""
Write-Host "  MemoryForge Installer" -ForegroundColor Blue
Write-Host "  Persistent memory for Claude Code" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Source  $ScriptDir" -ForegroundColor Cyan
if ($Global) {
    Write-Host "  Target  ~/.claude/ (user-level - all projects)" -ForegroundColor Cyan
} else {
    Write-Host "  Target  $TargetDir (project-level)" -ForegroundColor Cyan
}
Write-Host "  Scope   Core + $($extNames.Count) extension(s) $($extNames -join ', ')" -ForegroundColor Cyan
Write-Host ""

# Step counter
$totalSteps = 5 + $extNames.Count
$currentStep = 0

function Step($msg) {
    $script:currentStep++
    Write-Host "[$script:currentStep/$totalSteps] $msg" -ForegroundColor Yellow
}
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Skip($msg) { Write-Host "    $msg (skipped - already exists)" -ForegroundColor DarkGray }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# =============================================================================
# STEP 1: Hook scripts
# =============================================================================
Step "Installing hook scripts..."

if ($Global) {
    $hooksDir = Join-Path $env:USERPROFILE ".claude\hooks"
} else {
    $hooksDir = Join-Path $TargetDir "scripts\hooks"
}

New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
Copy-Item "$ScriptDir\scripts\hooks\*.sh" $hooksDir -Force
Ok "Copied 8 hooks to $hooksDir"

# =============================================================================
# STEP 2: Hook configuration
# =============================================================================
Step "Configuring .claude\settings.json..."
New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null

$settingsPath = Join-Path $ClaudeDir "settings.json"

if (Test-Path $settingsPath) {
    $content = Get-Content $settingsPath -Raw
    if ($content -match "session-start\.sh") {
        Skip ".claude\settings.json already has MemoryForge hooks"
    } else {
        Warn "Existing .claude\settings.json found without MemoryForge hooks."
        Warn "Saving reference config - merge manually."
        $refPath = Join-Path $ClaudeDir "settings.memoryforge.json"
        Copy-Item "$ScriptDir\.claude\settings.json" $refPath
        if ($Global) {
            $refContent = Get-Content $refPath -Raw
            $refContent = $refContent -replace '\$CLAUDE_PROJECT_DIR/scripts/hooks', '$HOME/.claude/hooks'
            Set-Content -Path $refPath -Value $refContent -Encoding UTF8
        }
        Ok "Saved reference: settings.memoryforge.json"
    }
} else {
    Copy-Item "$ScriptDir\.claude\settings.json" $settingsPath
    if ($Global) {
        $content = Get-Content $settingsPath -Raw
        $content = $content -replace '\$CLAUDE_PROJECT_DIR/scripts/hooks', '$HOME/.claude/hooks'
        Set-Content -Path $settingsPath -Value $content -Encoding UTF8
    }
    Ok "Created .claude\settings.json"
}

# =============================================================================
# STEP 3: .mind/ state files
# =============================================================================
Step "Creating .mind\ state files..."

if ($Global) {
    Ok "Skipped - .mind/ is always per-project."
    Ok "Run the installer on individual projects to create .mind/ files."
} else {
    $mindDir = Join-Path $TargetDir ".mind"
    New-Item -ItemType Directory -Force -Path (Join-Path $mindDir "checkpoints") | Out-Null

    foreach ($file in @("STATE.md", "DECISIONS.md", "PROGRESS.md", "SESSION-LOG.md")) {
        $dest = Join-Path $mindDir $file
        if (Test-Path $dest) {
            Skip ".mind\$file"
        } else {
            Copy-Item (Join-Path $ScriptDir "templates\.mind\$file") $dest
            Ok "Created .mind\$file"
        }
    }
}

# =============================================================================
# STEP 4: Mind agent
# =============================================================================
Step "Installing Mind agent..."
$agentsDir = Join-Path $ClaudeDir "agents"
New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null

$mindAgent = Join-Path $agentsDir "mind.md"
if (Test-Path $mindAgent) {
    Skip ".claude\agents\mind.md"
} else {
    Copy-Item "$ScriptDir\.claude\agents\mind.md" $mindAgent
    Ok "Created .claude\agents\mind.md"
}

# =============================================================================
# STEP 5: .gitignore
# =============================================================================
Step "Updating .gitignore..."

if ($Global) {
    Ok "Skipped - .gitignore is per-project."
    Ok "Add to your projects: .mind/.last-activity, .mind/.agent-activity,"
    Ok ".mind/.task-completions, .mind/.session-tracking, .mind/checkpoints/"
} else {
    $gitignorePath = Join-Path $TargetDir ".gitignore"
    $entries = @(
        "",
        "# MemoryForge auto-generated tracking files",
        ".mind/.last-activity",
        ".mind/.agent-activity",
        ".mind/.task-completions",
        ".mind/.session-tracking",
        ".mind/checkpoints/"
    )

    if ((Test-Path $gitignorePath) -and ((Get-Content $gitignorePath -Raw) -match "MemoryForge")) {
        Skip ".gitignore already has MemoryForge entries"
    } else {
        $entries | Out-File -Append -Encoding utf8 $gitignorePath
        Ok "Updated .gitignore"
    }
}

# =============================================================================
# EXTENSIONS
# =============================================================================

if ($WithTeam) {
    Step "Installing Team Memory extension..."
    New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null

    foreach ($agent in @("orchestrator.md", "builder.md")) {
        $dest = Join-Path $agentsDir $agent
        if (Test-Path $dest) {
            Skip ".claude\agents\$agent"
        } else {
            Copy-Item (Join-Path $ScriptDir "extensions\team-memory\agents\$agent") $dest
            Ok "Created .claude\agents\$agent"
        }
    }
}

if ($WithVector) {
    Step "Installing Vector Memory extension..."
    if ($Global) {
        $vectorDir = Join-Path $env:USERPROFILE ".claude\extensions\vector-memory"
    } else {
        $vectorDir = Join-Path $TargetDir "extensions\vector-memory"
    }
    New-Item -ItemType Directory -Force -Path $vectorDir | Out-Null
    Copy-Item "$ScriptDir\extensions\vector-memory\README.md" "$vectorDir\README.md" -Force
    Ok "Installed vector-memory extension"
    Ok "See $vectorDir\README.md for setup"
}

if ($WithGraph) {
    Step "Installing Graph Memory extension..."
    if ($Global) {
        $graphDir = Join-Path $env:USERPROFILE ".claude\extensions\graph-memory"
    } else {
        $graphDir = Join-Path $TargetDir "extensions\graph-memory"
    }
    New-Item -ItemType Directory -Force -Path $graphDir | Out-Null
    Copy-Item "$ScriptDir\extensions\graph-memory\README.md" "$graphDir\README.md" -Force
    Copy-Item "$ScriptDir\extensions\graph-memory\docker-compose.yml" "$graphDir\docker-compose.yml" -Force
    Ok "Installed graph-memory extension"
    Ok "Run 'docker compose up -d' in $graphDir to start Neo4j"
}

# =============================================================================
# Summary
# =============================================================================
Write-Host ""
Write-Host "  Installation complete." -ForegroundColor Green
Write-Host ""
Write-Host "  Installed:" -ForegroundColor White
Write-Host "    + 8 hook scripts" -ForegroundColor Green
Write-Host "    + .claude\settings.json" -ForegroundColor Green
Write-Host "    + Mind agent" -ForegroundColor Green
if (-not $Global) {
    Write-Host "    + .mind\ state files (4 templates)" -ForegroundColor Green
    Write-Host "    + .gitignore entries" -ForegroundColor Green
}
if ($WithTeam)   { Write-Host "    + Team agents (orchestrator + builder)" -ForegroundColor Green }
if ($WithVector) { Write-Host "    + Vector memory extension" -ForegroundColor Green }
if ($WithGraph)  { Write-Host "    + Graph memory extension (Neo4j)" -ForegroundColor Green }

Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Add the Mind Protocol to your CLAUDE.md"
Write-Host "       See templates\CLAUDE.md.template" -ForegroundColor DarkGray
if (-not $Global) {
    Write-Host "    2. Edit .mind\STATE.md with your project's current state"
    Write-Host "    3. Run 'claude' - the session-start hook fires automatically"
} else {
    Write-Host "    2. Run 'claude' in any project - hooks fire automatically"
    Write-Host "    3. Create .mind/ per-project: .\install.ps1 -TargetDir C:\project"
}
Write-Host ""
Write-Host "  Docs: https://github.com/marolinik/MemoryForge" -ForegroundColor DarkGray
Write-Host ""
