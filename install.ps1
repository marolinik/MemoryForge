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
# Brownfield features:
#   .\install.ps1 -DryRun                                # Preview changes only
#   .\install.ps1 -NoClaudeMd                            # Skip CLAUDE.md injection
#   .\install.ps1 -Uninstall                             # Remove MemoryForge cleanly
#
# Docs: https://github.com/marolinik/MemoryForge
# =============================================================================

param(
    [string]$TargetDir = ".",
    [switch]$Global,
    [switch]$WithTeam,
    [switch]$WithVector,
    [switch]$WithGraph,
    [switch]$Full,
    [switch]$DryRun,
    [switch]$NoClaudeMd,
    [switch]$Uninstall,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$MemoryForgeVersion = "1.9.0"

# --- Help ---
if ($Help) {
    Write-Host ""
    Write-Host "  MemoryForge Installer v$MemoryForgeVersion"
    Write-Host ""
    Write-Host "  Usage: .\install.ps1 [options]"
    Write-Host ""
    Write-Host "  Options:"
    Write-Host "    -Global       Install to ~/.claude/ (user-level)"
    Write-Host "    -WithTeam     Include team agent templates"
    Write-Host "    -WithVector   Include vector search extension"
    Write-Host "    -WithGraph    Include graph memory extension"
    Write-Host "    -Full         Enable all extensions"
    Write-Host "    -DryRun       Preview changes without modifying files"
    Write-Host "    -NoClaudeMd   Skip CLAUDE.md modifications"
    Write-Host "    -Uninstall    Remove MemoryForge from project"
    Write-Host "    -Help         Show this help message"
    Write-Host ""
    exit 0
}

# --- Check Node.js prerequisite ---
try {
    $null = Get-Command node -ErrorAction Stop
    $NodeVersion = (node -e "console.log(process.versions.node.split('.')[0])") 2>$null
    if ([int]$NodeVersion -lt 18) {
        Write-Host "WARNING: Node.js $NodeVersion detected, but 18+ is recommended." -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR: Node.js is required but not found." -ForegroundColor Red
    Write-Host "MemoryForge hooks use Node.js for JSON parsing, MCP server, and search."
    Write-Host "Install Node.js 18+ from: https://nodejs.org/"
    exit 1
}

# Expand -Full into individual flags
if ($Full) { $WithTeam = $true; $WithVector = $true; $WithGraph = $true }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Determine target
if ($Global) {
    $ClaudeDir = Join-Path $env:USERPROFILE ".claude"
    $TargetDir = $env:USERPROFILE
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

# Step counter
$totalSteps = 0
$currentStep = 0

function Step($msg) {
    $script:currentStep++
    Write-Host "[$script:currentStep/$script:totalSteps] $msg" -ForegroundColor Yellow
}
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Skip($msg) { Write-Host "    $msg (skipped - already exists)" -ForegroundColor DarkGray }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Dry($msg)  { Write-Host "    [dry-run] $msg" -ForegroundColor Cyan }

# =============================================================================
# UNINSTALL MODE
# =============================================================================
if ($Uninstall) {
    Write-Host ""
    Write-Host "  MemoryForge Uninstaller" -ForegroundColor Red
    if ($Global) {
        Write-Host "  Removing from ~/.claude/ (user-level)" -ForegroundColor DarkGray
    } else {
        Write-Host "  Removing from $TargetDir" -ForegroundColor DarkGray
    }
    if ($DryRun) {
        Write-Host "  DRY RUN - no files will be modified" -ForegroundColor Cyan
    }
    Write-Host ""

    if (-not $DryRun) {
        $confirm = Read-Host "  Continue? (y/N)"
        if ($confirm -ne 'y' -and $confirm -ne 'Y') {
            Write-Host "  Cancelled." -ForegroundColor DarkGray
            exit 0
        }
        Write-Host ""
    }

    $Removed = 0

    # 1. Remove hook scripts
    if ($Global) {
        $hooksDir = Join-Path $env:USERPROFILE ".claude\hooks"
    } else {
        $hooksDir = Join-Path $TargetDir "scripts\hooks"
    }

    $MfHooks = @("session-start.sh", "pre-compact.sh", "user-prompt-context.sh",
                  "stop-checkpoint.sh", "session-end.sh", "subagent-start.sh",
                  "subagent-stop.sh", "task-completed.sh")

    foreach ($hook in $MfHooks) {
        $hookPath = Join-Path $hooksDir $hook
        if (Test-Path $hookPath) {
            if ($DryRun) {
                Dry "Would remove $hookPath"
            } else {
                Remove-Item $hookPath -Force
                Ok "Removed $hook"
            }
            $Removed++
        }
    }

    # Remove empty hooks/scripts dirs
    if ((Test-Path $hooksDir) -and (@(Get-ChildItem $hooksDir -Force).Count -eq 0)) {
        if (-not $DryRun) {
            Remove-Item $hooksDir -Force
            $scriptsDir = Split-Path -Parent $hooksDir
            if ((Split-Path -Leaf $scriptsDir) -eq "scripts" -and (@(Get-ChildItem $scriptsDir -Force).Count -eq 0)) {
                Remove-Item $scriptsDir -Force
            }
        }
    }

    # 2. Remove MemoryForge hooks from settings.json
    $settingsPath = Join-Path $ClaudeDir "settings.json"
    if (Test-Path $settingsPath) {
        $mergeArgs = @("$ScriptDir\scripts\merge-settings.js", $settingsPath, "--uninstall")
        if ($DryRun) { $mergeArgs += "--dry-run" }

        try {
            $mergeResult = & node @mergeArgs 2>$null | ConvertFrom-Json
            if ($mergeResult.result -eq "uninstalled" -or $mergeResult.result -eq "dry-run") {
                if ($DryRun) {
                    Dry "Would remove MemoryForge hooks from settings.json"
                } else {
                    Ok "Removed MemoryForge hooks from settings.json"
                }
                $Removed++
            } elseif ($mergeResult.result -eq "skip") {
                Skip "No MemoryForge hooks in settings.json"
            }
        } catch {
            Warn "Could not process settings.json: $_"
        }
    }

    # 3. Remove MCP memory server
    if ($Global) {
        $mcpServer = Join-Path $env:USERPROFILE ".claude\mcp-memory-server.js"
        if (Test-Path $mcpServer) {
            if ($DryRun) {
                Dry "Would remove $mcpServer"
            } else {
                Remove-Item $mcpServer -Force
                Ok "Removed ~/.claude/mcp-memory-server.js"
            }
            $Removed++
        }
    } else {
        # Remove MCP server script from scripts/
        $mcpServer = Join-Path $TargetDir "scripts\mcp-memory-server.js"
        if (Test-Path $mcpServer) {
            if ($DryRun) {
                Dry "Would remove $mcpServer"
            } else {
                Remove-Item $mcpServer -Force
                Ok "Removed scripts\mcp-memory-server.js"
            }
            $Removed++
        }

        # Remove "memory" entry from .mcp.json (smart removal)
        $mcpJsonPath = Join-Path $TargetDir ".mcp.json"
        if ((Test-Path $mcpJsonPath) -and ((Get-Content $mcpJsonPath -Raw) -match "mcp-memory-server|memoryforge")) {
            if ($DryRun) {
                Dry "Would remove memory server from .mcp.json"
            } else {
                Copy-Item $mcpJsonPath "${mcpJsonPath}.backup" -Force
                try {
                    $env:MCP_FILE = ($mcpJsonPath -replace '\\','/')
                    & node -e "const fs=require('fs');const p=process.env.MCP_FILE;const mcp=JSON.parse(fs.readFileSync(p,'utf-8'));if(mcp.mcpServers&&mcp.mcpServers.memory){delete mcp.mcpServers.memory}if(Object.keys(mcp.mcpServers||{}).length===0){fs.unlinkSync(p)}else{fs.writeFileSync(p,JSON.stringify(mcp,null,2)+'\n')}" 2>$null
                    $env:MCP_FILE = $null
                    if (Test-Path $mcpJsonPath) {
                        Ok "Removed memory server from .mcp.json (other servers preserved)"
                    } else {
                        Ok "Removed .mcp.json (no other servers)"
                    }
                } catch {
                    Warn "Could not clean .mcp.json - remove 'memory' entry manually"
                }
            }
            $Removed++
        }

        # Remove .mcp.json backup/reference
        foreach ($ref in @("${mcpJsonPath}.backup", (Join-Path $TargetDir ".mcp.memoryforge.json"))) {
            if (Test-Path $ref) {
                if ($DryRun) {
                    Dry "Would remove $(Split-Path -Leaf $ref)"
                } else {
                    Remove-Item $ref -Force
                }
            }
        }
    }

    # 4. Remove agents (only if they contain MemoryForge signatures)
    $MfAgents = @("mind.md", "orchestrator.md", "builder.md")
    foreach ($agent in $MfAgents) {
        $agentPath = Join-Path $ClaudeDir "agents\$agent"
        if (Test-Path $agentPath) {
            $content = Get-Content $agentPath -Raw -ErrorAction SilentlyContinue
            if ($content -match "MemoryForge|\.mind/") {
                if ($DryRun) {
                    Dry "Would remove $agentPath"
                } else {
                    Remove-Item $agentPath -Force
                    Ok "Removed agents\$agent"
                }
                $Removed++
            } else {
                Skip "agents\$agent doesn't appear to be from MemoryForge"
            }
        }
    }

    # 5. Remove tracking files (NOT state files - those are user data)
    if (-not $Global) {
        $trackingFiles = @(".mind\.last-activity", ".mind\.agent-activity",
                          ".mind\.task-completions", ".mind\.session-tracking",
                          ".mind\.file-tracker")
        foreach ($tf in $trackingFiles) {
            $tfPath = Join-Path $TargetDir $tf
            if (Test-Path $tfPath) {
                if ($DryRun) {
                    Dry "Would remove $tfPath"
                } else {
                    Remove-Item $tfPath -Force
                    Ok "Removed $tf"
                }
                $Removed++
            }
        }

        # Remove checkpoints directory
        $checkpointsDir = Join-Path $TargetDir ".mind\checkpoints"
        if (Test-Path $checkpointsDir) {
            if ($DryRun) {
                Dry "Would remove .mind\checkpoints\"
            } else {
                Remove-Item $checkpointsDir -Recurse -Force
                Ok "Removed .mind\checkpoints\"
            }
            $Removed++
        }

        Write-Host ""
        Write-Host "    Preserved: .mind\STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md" -ForegroundColor White
        Write-Host "    These are your project data. Delete manually if you want them gone." -ForegroundColor DarkGray
    }

    # 6. Remove reference/backup configs
    foreach ($ref in @("settings.memoryforge.json", "settings.json.backup")) {
        $refPath = Join-Path $ClaudeDir $ref
        if (Test-Path $refPath) {
            if ($DryRun) {
                Dry "Would remove $ref"
            } else {
                Remove-Item $refPath -Force
                Ok "Removed $ref"
            }
        }
    }

    Write-Host ""
    if ($DryRun) {
        Write-Host "  Dry run complete. No files were modified." -ForegroundColor Cyan
    } elseif ($Removed -gt 0) {
        Write-Host "  MemoryForge removed ($Removed items)." -ForegroundColor Green
    } else {
        Write-Host "  Nothing to remove - MemoryForge doesn't appear to be installed." -ForegroundColor DarkGray
    }
    Write-Host ""
    exit 0
}

# =============================================================================
# INSTALL MODE
# =============================================================================

# Header
Write-Host ""
Write-Host "  MemoryForge Installer" -ForegroundColor Blue
Write-Host "  Persistent memory for Claude Code" -ForegroundColor DarkGray
if ($DryRun) {
    Write-Host "  DRY RUN - no files will be modified" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  Source  $ScriptDir" -ForegroundColor Cyan
if ($Global) {
    Write-Host "  Target  ~/.claude/ (user-level - all projects)" -ForegroundColor Cyan
} else {
    Write-Host "  Target  $TargetDir (project-level)" -ForegroundColor Cyan
}
Write-Host "  Scope   Core + $($extNames.Count) extension(s) $($extNames -join ', ')" -ForegroundColor Cyan
Write-Host ""

# --- Detect existing memory systems ---
if (-not $Global) {
    try {
        $detectResult = & node "$ScriptDir\scripts\detect-existing.js" $TargetDir 2>$null | ConvertFrom-Json
        if ($detectResult.findings_count -gt 0) {
            Write-Host "  Existing memory systems detected:" -ForegroundColor Yellow
            foreach ($finding in $detectResult.findings) {
                Write-Host "    - $($finding.system): $($finding.note)" -ForegroundColor DarkGray
            }
            Write-Host ""
        }
    } catch {
        # Detection failed silently - not critical
    }
}

# Calculate total steps
# Base: 6 steps + CLAUDE.md (step 7) for project-level installs (unless --no-claude-md)
$totalSteps = 6 + $extNames.Count
if (-not $Global -and -not $NoClaudeMd) { $totalSteps++ }

# =============================================================================
# STEP 1: Hook scripts
# =============================================================================
Step "Installing hook scripts..."

if ($Global) {
    $hooksDir = Join-Path $env:USERPROFILE ".claude\hooks"
} else {
    $hooksDir = Join-Path $TargetDir "scripts\hooks"
}

if ($DryRun) {
    Dry "Would copy 8 hooks to $hooksDir"
} else {
    New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
    Copy-Item "$ScriptDir\scripts\hooks\*.sh" $hooksDir -Force
    Ok "Copied 8 hooks to $hooksDir"
}

# =============================================================================
# STEP 2: Hook configuration - SMART MERGE
# =============================================================================
Step "Configuring .claude\settings.json..."

$settingsPath = Join-Path $ClaudeDir "settings.json"
$mfSettings = "$ScriptDir\.claude\settings.json"

# Prepare temp copy with global paths if needed
$mfSettingsTemp = $null
if ($Global) {
    $mfSettingsTemp = [System.IO.Path]::GetTempFileName()
    (Get-Content $mfSettings -Raw) -replace '\$CLAUDE_PROJECT_DIR/scripts/hooks', '$HOME/.claude/hooks' |
        Set-Content -Path $mfSettingsTemp -Encoding UTF8
    $mfSettings = $mfSettingsTemp
}

if (Test-Path $settingsPath) {
    $content = Get-Content $settingsPath -Raw
    if ($content -match "session-start\.sh") {
        Skip ".claude\settings.json already has MemoryForge hooks"
    } else {
        # Smart merge
        if ($DryRun) {
            Dry "Would smart-merge MemoryForge hooks into existing settings.json"
            try {
                $preview = & node "$ScriptDir\scripts\merge-settings.js" $settingsPath $mfSettings --dry-run 2>$null | ConvertFrom-Json
                if ($preview.changes) {
                    foreach ($change in $preview.changes) {
                        Write-Host "      $change" -ForegroundColor DarkGray
                    }
                }
            } catch {}
        } else {
            New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
            try {
                $mergeResult = & node "$ScriptDir\scripts\merge-settings.js" $settingsPath $mfSettings 2>$null | ConvertFrom-Json
                if ($mergeResult.result -eq "merged") {
                    Ok "Smart-merged hooks into existing settings.json"
                    Ok "Backup saved: settings.json.backup"
                } elseif ($mergeResult.result -eq "skip") {
                    Skip "All hooks already present"
                } else {
                    Warn "Smart merge failed - saving reference config instead."
                    Copy-Item $mfSettings (Join-Path $ClaudeDir "settings.memoryforge.json")
                    Ok "Saved reference: .claude\settings.memoryforge.json"
                }
            } catch {
                Warn "Smart merge error - saving reference config instead."
                Copy-Item $mfSettings (Join-Path $ClaudeDir "settings.memoryforge.json")
                Ok "Saved reference: .claude\settings.memoryforge.json"
            }
        }
    }
} else {
    if ($DryRun) {
        Dry "Would create .claude\settings.json"
    } else {
        New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
        Copy-Item $mfSettings $settingsPath
        Ok "Created .claude\settings.json"
    }
}

# Clean up temp file
if ($mfSettingsTemp -and (Test-Path $mfSettingsTemp)) {
    Remove-Item $mfSettingsTemp -Force -ErrorAction SilentlyContinue
}

# =============================================================================
# STEP 3: MCP Memory Server (.mcp.json)
# =============================================================================
Step "Configuring MCP memory server..."

$mcpJson = Join-Path $TargetDir ".mcp.json"
$mfMcpJson = Join-Path $ScriptDir ".mcp.json"

if ($Global) {
    $mcpServerDest = Join-Path $env:USERPROFILE ".claude\mcp-memory-server.js"
    if ($DryRun) {
        Dry "Would copy MCP server to $mcpServerDest"
    } else {
        Copy-Item "$ScriptDir\scripts\mcp-memory-server.js" $mcpServerDest -Force
        Ok "Copied MCP server to ~/.claude/"
    }
    Ok "Note: Add to each project's .mcp.json:"
    Ok '  {"mcpServers":{"memory":{"command":"node","args":["~/.claude/mcp-memory-server.js"]}}}'
} elseif ((Test-Path $mcpJson) -and ((Get-Content $mcpJson -Raw) -match "mcp-memory-server|memoryforge")) {
    Skip ".mcp.json already has MemoryForge memory server"
} elseif (Test-Path $mcpJson) {
    # Smart merge: add our server to existing .mcp.json
    if ($DryRun) {
        Dry "Would add memory server to existing .mcp.json"
    } else {
        Copy-Item $mcpJson "${mcpJson}.backup" -Force
        try {
            $env:MCP_FILE = ($mcpJson -replace '\\','/')
            $env:MF_FILE = ($mfMcpJson -replace '\\','/')
            & node -e "const fs=require('fs');const existing=JSON.parse(fs.readFileSync(process.env.MCP_FILE,'utf-8'));const mf=JSON.parse(fs.readFileSync(process.env.MF_FILE,'utf-8'));existing.mcpServers=existing.mcpServers||{};Object.assign(existing.mcpServers,mf.mcpServers);fs.writeFileSync(process.env.MCP_FILE,JSON.stringify(existing,null,2)+'\n')" 2>$null
            $env:MCP_FILE = $null
            $env:MF_FILE = $null
            Ok "Added memory server to existing .mcp.json"
        } catch {
            Warn "Could not merge .mcp.json — saving reference copy"
            Copy-Item $mfMcpJson (Join-Path $TargetDir ".mcp.memoryforge.json")
        }
    }
} else {
    if ($DryRun) {
        Dry "Would create .mcp.json with memory server"
    } else {
        Copy-Item $mfMcpJson $mcpJson
        Ok "Created .mcp.json with MCP memory server"
    }
}

# Copy MCP server and supporting scripts to project
if (-not $Global) {
    if ($DryRun) {
        Dry "Would copy scripts to $TargetDir\scripts\"
    } else {
        New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "scripts") | Out-Null
        foreach ($script in @("mcp-memory-server.js", "vector-memory.js", "config-keys.js", "compress-sessions.js", "health-check.js")) {
            $src = Join-Path $ScriptDir "scripts\$script"
            if (Test-Path $src) {
                Copy-Item $src (Join-Path $TargetDir "scripts\$script") -Force
            }
        }
        Ok "Copied MCP server and supporting scripts to scripts\"
    }
}

# =============================================================================
# STEP 4: .mind/ state files
# =============================================================================
Step "Creating .mind\ state files..."

if ($Global) {
    Ok "Skipped - .mind/ is always per-project."
    Ok "Run the installer on individual projects to create .mind/ files."
} else {
    $mindDir = Join-Path $TargetDir ".mind"
    $stateFiles = @("STATE.md", "DECISIONS.md", "PROGRESS.md", "SESSION-LOG.md")

    if ($DryRun) {
        foreach ($file in $stateFiles) {
            $dest = Join-Path $mindDir $file
            if (Test-Path $dest) {
                Skip ".mind\$file"
            } else {
                Dry "Would create .mind\$file"
            }
        }
    } else {
        New-Item -ItemType Directory -Force -Path (Join-Path $mindDir "checkpoints") | Out-Null
        foreach ($file in $stateFiles) {
            $dest = Join-Path $mindDir $file
            if (Test-Path $dest) {
                Skip ".mind\$file"
            } else {
                Copy-Item (Join-Path $ScriptDir "templates\.mind\$file") $dest
                Ok "Created .mind\$file"
            }
        }
    }
}

# =============================================================================
# STEP 5: Mind agent
# =============================================================================
Step "Installing Mind agent..."
$agentsDir = Join-Path $ClaudeDir "agents"
$mindAgent = Join-Path $agentsDir "mind.md"

if (Test-Path $mindAgent) {
    Skip ".claude\agents\mind.md"
} else {
    if ($DryRun) {
        Dry "Would create .claude\agents\mind.md"
    } else {
        New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null
        Copy-Item "$ScriptDir\.claude\agents\mind.md" $mindAgent
        Ok "Created .claude\agents\mind.md"
    }
}

# =============================================================================
# STEP 6: .gitignore
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
        ".mind/.file-tracker",
        ".mind/.prompt-context",
        ".mind/.mcp-errors.log",
        ".mind/.write-lock",
        ".mind/ARCHIVE.md",
        ".mind/dashboard.html",
        ".mind/checkpoints/",
        "*.pre-compress"
    )

    if ((Test-Path $gitignorePath) -and ((Get-Content $gitignorePath -Raw) -match "MemoryForge")) {
        Skip ".gitignore already has MemoryForge entries"
    } else {
        if ($DryRun) {
            Dry "Would add MemoryForge entries to .gitignore"
        } else {
            $entries | Out-File -Append -Encoding utf8 $gitignorePath
            Ok "Updated .gitignore"
        }
    }
}

# =============================================================================
# EXTENSIONS
# =============================================================================

if ($WithTeam) {
    Step "Installing Team Memory extension..."
    foreach ($agent in @("orchestrator.md", "builder.md")) {
        $dest = Join-Path $agentsDir $agent
        if (Test-Path $dest) {
            Skip ".claude\agents\$agent"
        } else {
            if ($DryRun) {
                Dry "Would create .claude\agents\$agent"
            } else {
                New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null
                Copy-Item (Join-Path $ScriptDir "extensions\team-memory\agents\$agent") $dest
                Ok "Created .claude\agents\$agent"
            }
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

    if ($DryRun) {
        Dry "Would install vector-memory extension to $vectorDir"
    } else {
        New-Item -ItemType Directory -Force -Path $vectorDir | Out-Null
        Copy-Item "$ScriptDir\extensions\vector-memory\README.md" "$vectorDir\README.md" -Force
        Ok "Installed vector-memory extension"
        Ok "See $vectorDir\README.md for setup"
    }
}

if ($WithGraph) {
    Step "Installing Graph Memory extension..."
    if ($Global) {
        $graphDir = Join-Path $env:USERPROFILE ".claude\extensions\graph-memory"
    } else {
        $graphDir = Join-Path $TargetDir "extensions\graph-memory"
    }

    if ($DryRun) {
        Dry "Would install graph-memory extension to $graphDir"
    } else {
        New-Item -ItemType Directory -Force -Path $graphDir | Out-Null
        Copy-Item "$ScriptDir\extensions\graph-memory\README.md" "$graphDir\README.md" -Force
        Copy-Item "$ScriptDir\extensions\graph-memory\docker-compose.yml" "$graphDir\docker-compose.yml" -Force
        Ok "Installed graph-memory extension"
        Ok "Run 'docker compose up -d' in $graphDir to start Neo4j"
    }
}

# =============================================================================
# STEP 7: CLAUDE.md — Mind Protocol (default for project-level installs)
# =============================================================================
if (-not $Global -and -not $NoClaudeMd) {
    Step "Adding Mind Protocol to CLAUDE.md..."

    $claudeMdPath = Join-Path $TargetDir "CLAUDE.md"
    $templatePath = Join-Path $ScriptDir "templates\CLAUDE.md.template"

    if (-not (Test-Path $templatePath)) {
        Warn "Template not found: $templatePath"
    } elseif ((Test-Path $claudeMdPath) -and ((Get-Content $claudeMdPath -Raw) -match "\.mind/STATE\.md|Mind Protocol|MemoryForge")) {
        Skip "CLAUDE.md already has Mind Protocol / MemoryForge references"
    } elseif (Test-Path $claudeMdPath) {
        if ($DryRun) {
            Dry "Would append Mind Protocol section to existing CLAUDE.md"
            $templateLines = (Get-Content $templatePath).Count
            Dry "(~$templateLines lines from templates\CLAUDE.md.template)"
        } else {
            "`n`n" | Out-File -Append -Encoding utf8 $claudeMdPath -NoNewline
            Get-Content $templatePath -Raw | Out-File -Append -Encoding utf8 $claudeMdPath
            Ok "Appended Mind Protocol section to CLAUDE.md"
        }
    } else {
        if ($DryRun) {
            Dry "Would create CLAUDE.md from template"
        } else {
            Copy-Item $templatePath $claudeMdPath
            Ok "Created CLAUDE.md with Mind Protocol section"
        }
    }
}

# =============================================================================
# Summary
# =============================================================================
# =============================================================================
# VERSION TRACKING (Wave 16)
# =============================================================================
if (-not $Global) {
    $versionFile = Join-Path $TargetDir ".memoryforge-version"
    if ($DryRun) {
        if (Test-Path $versionFile) {
            $installedVersion = (Get-Content $versionFile -Raw).Trim()
            if ($installedVersion -ne $MemoryForgeVersion) {
                Dry "Would upgrade version tracking: $installedVersion -> $MemoryForgeVersion"
            }
        } else {
            Dry "Would create .memoryforge-version ($MemoryForgeVersion)"
        }
    } else {
        if (Test-Path $versionFile) {
            $installedVersion = (Get-Content $versionFile -Raw).Trim()
            if ($installedVersion -ne $MemoryForgeVersion) {
                Write-Host "  Upgrade detected: $installedVersion -> $MemoryForgeVersion" -ForegroundColor Cyan
            }
        }
        $MemoryForgeVersion | Set-Content -Path $versionFile -Encoding UTF8 -NoNewline
    }
}

Write-Host ""
if ($DryRun) {
    Write-Host "  Dry run complete. No files were modified." -ForegroundColor Cyan
    Write-Host "  Run without -DryRun to apply changes." -ForegroundColor DarkGray
} else {
    Write-Host "  Installation complete. (v$MemoryForgeVersion)" -ForegroundColor Green
}
Write-Host ""

Write-Host "  Installed:" -ForegroundColor White
Write-Host "    + 8 hook scripts" -ForegroundColor Green
Write-Host "    + .claude\settings.json (smart-merged if existing)" -ForegroundColor Green
Write-Host "    + MCP memory server (6 tools for querying/updating .mind/)" -ForegroundColor Green
Write-Host "    + Mind agent" -ForegroundColor Green
if (-not $Global) {
    Write-Host "    + .mind\ state files (4 templates)" -ForegroundColor Green
    Write-Host "    + .gitignore entries" -ForegroundColor Green
}
if ($WithTeam)   { Write-Host "    + Team agents (orchestrator + builder)" -ForegroundColor Green }
if ($WithVector) { Write-Host "    + Vector memory extension" -ForegroundColor Green }
if ($WithGraph)  { Write-Host "    + Graph memory extension (Neo4j)" -ForegroundColor Green }
if (-not $Global -and -not $NoClaudeMd) { Write-Host "    + Mind Protocol in CLAUDE.md" -ForegroundColor Green }

Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
if (-not $Global -and -not $NoClaudeMd) {
    Write-Host "    1. Review the Mind Protocol section in your CLAUDE.md"
} else {
    Write-Host "    1. Add the Mind Protocol to your CLAUDE.md"
    Write-Host "       See templates\CLAUDE.md.template" -ForegroundColor DarkGray
}
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
