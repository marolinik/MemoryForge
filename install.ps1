# =============================================================================
# MemoryForge Installer (Windows PowerShell)
# =============================================================================
# Usage:
#   .\install.ps1                                        # Core (current dir)
#   .\install.ps1 -TargetDir "C:\my\project"             # Core (specific project)
#   .\install.ps1 -Global                                # Core (user-level)
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
    [switch]$DryRun,
    [switch]$NoClaudeMd,
    [switch]$Uninstall,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$MemoryForgeVersion = "2.0.1"

# --- Help ---
if ($Help) {
    Write-Host ""
    Write-Host "  MemoryForge Installer v$MemoryForgeVersion"
    Write-Host ""
    Write-Host "  Usage: .\install.ps1 [options]"
    Write-Host ""
    Write-Host "  Options:"
    Write-Host "    -Global       Install to ~/.claude/ (user-level)"
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
    Write-Host "MemoryForge hooks use Node.js for JSON parsing and the MCP server."
    Write-Host "Install Node.js 18+ from: https://nodejs.org/"
    exit 1
}

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

    $MfHooks = @("session-start.sh", "pre-compact.sh", "session-end.sh",
                  "session-start.js", "pre-compact.js", "session-end.js",
                  "check-update.js")

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
        if ((Get-Content $settingsPath -Raw) -match "session-start\.(sh|js)") {
            if ($DryRun) {
                Dry "Would remove MemoryForge hooks from settings.json"
            } else {
                Copy-Item $settingsPath "${settingsPath}.backup" -Force
                $env:SETTINGS_FILE = ($settingsPath -replace '\\','/')
                try {
                    & node -e "const fs=require('fs');const p=process.env.SETTINGS_FILE;const s=JSON.parse(fs.readFileSync(p,'utf-8'));if(s.hooks){for(const[event,handlers]of Object.entries(s.hooks)){s.hooks[event]=handlers.filter(h=>{const t=JSON.stringify(h);return !t.includes('memoryforge')&&!t.includes('session-start.sh')&&!t.includes('session-start.js')&&!t.includes('pre-compact.sh')&&!t.includes('pre-compact.js')&&!t.includes('session-end.sh')&&!t.includes('session-end.js')});if(s.hooks[event].length===0)delete s.hooks[event]}if(Object.keys(s.hooks).length===0)delete s.hooks}fs.writeFileSync(p,JSON.stringify(s,null,2)+'\n')" 2>$null
                    $env:SETTINGS_FILE = $null
                    Ok "Removed MemoryForge hooks from settings.json"
                } catch {
                    $env:SETTINGS_FILE = $null
                    Warn "Could not process settings.json: $_"
                }
            }
            $Removed++
        } else {
            Skip "No MemoryForge hooks in settings.json"
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
        # Remove MCP server and supporting scripts
        foreach ($script in @("mcp-memory-server.js", "compress-sessions.js", "config-keys.js")) {
            $scriptPath = Join-Path $TargetDir "scripts\$script"
            if (Test-Path $scriptPath) {
                if ($DryRun) {
                    Dry "Would remove scripts\$script"
                } else {
                    Remove-Item $scriptPath -Force
                    Ok "Removed scripts\$script"
                }
                $Removed++
            }
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
                    $env:MCP_FILE = $null
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
    $mindAgent = Join-Path $ClaudeDir "agents\mind.md"
    if (Test-Path $mindAgent) {
        $content = Get-Content $mindAgent -Raw -ErrorAction SilentlyContinue
        if ($content -match "MemoryForge|\.mind/") {
            if ($DryRun) {
                Dry "Would remove $mindAgent"
            } else {
                Remove-Item $mindAgent -Force
                Ok "Removed agents\mind.md"
            }
            $Removed++
        } else {
            Skip "agents\mind.md doesn't appear to be from MemoryForge"
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
Write-Host ""

# Calculate total steps (6 base for project, 5 for global or no-claude-md)
if ($Global -or $NoClaudeMd) {
    $totalSteps = 5
} else {
    $totalSteps = 6
}

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
    Dry "Would copy 3 hooks to $hooksDir"
} else {
    New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
    Copy-Item "$ScriptDir\scripts\hooks\*.sh" $hooksDir -Force
    Copy-Item "$ScriptDir\scripts\hooks\*.js" $hooksDir -Force
    Ok "Copied hooks (sh + js) to $hooksDir"
}

# =============================================================================
# STEP 2: Hook configuration - SMART MERGE
# =============================================================================
Step "Configuring .claude\settings.json..."

$settingsPath = Join-Path $ClaudeDir "settings.json"
$mfSettings = "$ScriptDir\.claude\settings.json"

# Prepare temp copy with absolute paths for global install (Node.js, no bash needed)
$mfSettingsTemp = $null
if ($Global) {
    $mfSettingsTemp = [System.IO.Path]::GetTempFileName()
    $absHooksDir = ($hooksDir -replace '\\','/')
    (Get-Content $mfSettings -Raw) `
        -replace 'node scripts/hooks/session-start\.js', "node `"$absHooksDir/session-start.js`"" `
        -replace 'node scripts/hooks/pre-compact\.js', "node `"$absHooksDir/pre-compact.js`"" `
        -replace 'node scripts/hooks/session-end\.js', "node `"$absHooksDir/session-end.js`"" |
        Set-Content -Path $mfSettingsTemp -Encoding UTF8
    $mfSettings = $mfSettingsTemp
}

if (Test-Path $settingsPath) {
    $content = Get-Content $settingsPath -Raw
    if ($content -match "session-start\.(sh|js)") {
        Skip ".claude\settings.json already has MemoryForge hooks"
    } else {
        # Smart merge using inline Node.js
        if ($DryRun) {
            Dry "Would merge MemoryForge hooks into existing settings.json"
        } else {
            New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
            Copy-Item $settingsPath "${settingsPath}.backup" -Force
            $env:EXISTING_FILE = ($settingsPath -replace '\\','/')
            $env:MF_FILE = ($mfSettings -replace '\\','/')
            try {
                & node -e "const fs=require('fs');const existing=JSON.parse(fs.readFileSync(process.env.EXISTING_FILE,'utf-8'));const mf=JSON.parse(fs.readFileSync(process.env.MF_FILE,'utf-8'));existing.hooks=existing.hooks||{};for(const[event,handlers]of Object.entries(mf.hooks||{})){if(!existing.hooks[event]){existing.hooks[event]=handlers}else{const existingStr=JSON.stringify(existing.hooks[event]);for(const handler of handlers){if(!existingStr.includes(JSON.stringify(handler).slice(1,-1))){existing.hooks[event].push(handler)}}}}fs.writeFileSync(process.env.EXISTING_FILE,JSON.stringify(existing,null,2)+'\n')" 2>$null
                $env:EXISTING_FILE = $null
                $env:MF_FILE = $null
                Ok "Merged hooks into existing settings.json"
                Ok "Backup saved: settings.json.backup"
            } catch {
                $env:EXISTING_FILE = $null
                $env:MF_FILE = $null
                Warn "Merge failed - saving reference config instead."
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
            $env:MCP_FILE = $null
            $env:MF_FILE = $null
            Warn "Could not merge .mcp.json - saving reference copy"
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
        foreach ($script in @("mcp-memory-server.js", "config-keys.js", "compress-sessions.js")) {
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
# STEP 5: .gitignore
# =============================================================================
Step "Updating .gitignore..."

if ($Global) {
    Ok "Skipped - .gitignore is per-project."
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
        ".mind/.write-lock",
        ".mind/.prompt-context",
        ".mind/.mcp-errors.log",
        ".mind/ARCHIVE.md",
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
# STEP 6: CLAUDE.md (default for project-level installs)
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
# VERSION TRACKING
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

# =============================================================================
# Summary
# =============================================================================
Write-Host ""
if ($DryRun) {
    Write-Host "  Dry run complete. No files were modified." -ForegroundColor Cyan
    Write-Host "  Run without -DryRun to apply changes." -ForegroundColor DarkGray
} else {
    Write-Host "  Installation complete. (v$MemoryForgeVersion)" -ForegroundColor Green
}
Write-Host ""

Write-Host "  Installed:" -ForegroundColor White
Write-Host "    + 3 hook scripts" -ForegroundColor Green
Write-Host "    + .claude\settings.json (smart-merged if existing)" -ForegroundColor Green
Write-Host "    + MCP memory server (6 tools for querying/updating .mind/)" -ForegroundColor Green
if (-not $Global) {
    Write-Host "    + .mind\ state files (4 templates)" -ForegroundColor Green
    Write-Host "    + .gitignore entries" -ForegroundColor Green
}
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
