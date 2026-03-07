#!/usr/bin/env bash
# OpenClaw Multi-Agent Team Setup Validator
# Validates directory structure, configuration files, and environment variables

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_err() { echo -e "${RED}[ERROR]${NC} $1"; ERRORS=$((ERRORS + 1)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
log_info() { echo -e "     $1"; }

echo "========================================="
echo " OpenClaw Multi-Agent Team Setup Check"
echo "========================================="
echo ""

# 1. Check OpenClaw CLI
echo "--- CLI Environment ---"
if command -v openclaw &>/dev/null; then
  VERSION=$(openclaw --version 2>/dev/null || echo "unknown")
  log_ok "OpenClaw CLI installed: $VERSION"
else
  log_err "OpenClaw CLI not found. Install with: npm install -g openclaw"
fi

# 2. Check directory structure
echo ""
echo "--- Directory Structure ---"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENCLAW_DIR="$PROJECT_ROOT/.openclaw"

if [ -d "$OPENCLAW_DIR" ]; then
  log_ok ".openclaw/ directory exists"
else
  log_err ".openclaw/ directory not found"
fi

WORKSPACES=("workspace-pm" "workspace-architect" "workspace-dev-manager" "workspace-backend" "workspace-frontend")
for ws in "${WORKSPACES[@]}"; do
  if [ -d "$OPENCLAW_DIR/$ws" ]; then
    log_ok "$ws/ directory exists"
  else
    log_err "$ws/ directory not found"
  fi
done

# 3. Check workspace files
echo ""
echo "--- Workspace Files ---"
WORKSPACE_FILES=("SOUL.md" "AGENTS.md" "USER.md" "IDENTITY.md")
for ws in "${WORKSPACES[@]}"; do
  for f in "${WORKSPACE_FILES[@]}"; do
    filepath="$OPENCLAW_DIR/$ws/$f"
    if [ -f "$filepath" ]; then
      log_ok "$ws/$f"
    else
      log_err "Missing: $ws/$f"
    fi
  done
done

# 4. Check core configuration
echo ""
echo "--- Core Configuration ---"
if [ -f "$OPENCLAW_DIR/openclaw.json" ]; then
  log_ok "openclaw.json exists"
  # Validate JSON syntax
  if command -v node &>/dev/null; then
    if node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" -- "$OPENCLAW_DIR/openclaw.json" 2>/dev/null; then
      log_ok "openclaw.json is valid JSON"
    else
      log_err "openclaw.json has invalid JSON syntax"
    fi
  fi
else
  log_err "openclaw.json not found"
fi

if [ -f "$OPENCLAW_DIR/.env.example" ]; then
  log_ok ".env.example exists"
else
  log_warn ".env.example not found"
fi

# 5. Check environment variables
echo ""
echo "--- Environment Variables ---"
if [ -f "$OPENCLAW_DIR/.env" ]; then
  log_ok ".env file exists"

  # Check required variables
  ENV_VARS=("RELAY_CLAUDE_BASE_URL" "RELAY_CLAUDE_API_KEY" "RELAY_CODE_BASE_URL" "RELAY_CODE_API_KEY")
  for var in "${ENV_VARS[@]}"; do
    if grep -q "^${var}=" "$OPENCLAW_DIR/.env" 2>/dev/null; then
      VALUE=$(grep "^${var}=" "$OPENCLAW_DIR/.env" | cut -d'=' -f2)
      if [[ "$VALUE" == *"your-"* ]] || [[ "$VALUE" == *"example"* ]] || [ -z "$VALUE" ]; then
        log_warn "$var is set but appears to be a placeholder"
      else
        log_ok "$var is configured"
      fi
    else
      log_warn "$var not found in .env"
    fi
  done
else
  log_warn ".env file not found. Copy from .env.example and configure API keys"
fi

# 6. Check .gitignore
echo ""
echo "--- Git Configuration ---"
if [ -f "$PROJECT_ROOT/.gitignore" ]; then
  if grep -q ".openclaw/agents/" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
    log_ok ".gitignore excludes OpenClaw runtime data"
  else
    log_warn ".gitignore may not exclude OpenClaw runtime directories"
  fi
  if grep -q ".openclaw/.env" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
    log_ok ".gitignore excludes .openclaw/.env"
  else
    log_warn ".gitignore should exclude .openclaw/.env (contains API keys)"
  fi
else
  log_warn ".gitignore not found"
fi

# 7. OpenClaw doctor hint (interactive, don't run automatically)
echo ""
echo "--- OpenClaw Diagnostics ---"
if command -v openclaw &>/dev/null; then
  log_info "Run 'openclaw doctor' manually for full diagnostics (interactive)."
else
  log_info "Skipping openclaw doctor (CLI not installed)"
fi

# Summary
echo ""
echo "========================================="
echo " Setup Check Summary"
echo "========================================="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}All checks passed!${NC}"
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}$WARNINGS warning(s), no errors.${NC}"
else
  echo -e "${RED}$ERRORS error(s), $WARNINGS warning(s).${NC}"
  echo "Fix the errors above before starting the OpenClaw gateway."
fi
echo ""
exit $ERRORS
