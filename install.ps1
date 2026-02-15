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
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

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

    # 3. Remove agents (only if they contain MemoryForge signatures)
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

    # 4. Remove tracking files (NOT state files - those are user data)
    if (-not $Global) {
        $trackingFiles = @(".mind\.last-activity", ".mind\.agent-activity",
                          ".mind\.task-completions", ".mind\.session-tracking")
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

    # 5. Remove reference/backup configs
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
# Base: 5 steps + CLAUDE.md (step 6) for project-level installs (unless --no-claude-md)
$totalSteps = 5 + $extNames.Count
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
# STEP 3: .mind/ state files
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
# STEP 4: Mind agent
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
# STEP 6: CLAUDE.md — Mind Protocol (default for project-level installs)
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
Write-Host ""
if ($DryRun) {
    Write-Host "  Dry run complete. No files were modified." -ForegroundColor Cyan
    Write-Host "  Run without -DryRun to apply changes." -ForegroundColor DarkGray
} else {
    Write-Host "  Installation complete." -ForegroundColor Green
}
Write-Host ""

Write-Host "  Installed:" -ForegroundColor White
Write-Host "    + 8 hook scripts" -ForegroundColor Green
Write-Host "    + .claude\settings.json (smart-merged if existing)" -ForegroundColor Green
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
