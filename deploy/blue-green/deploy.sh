#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INFRA_COMPOSE_FILE="$SCRIPT_DIR/compose.infra.yml"
APP_COMPOSE_FILE="$SCRIPT_DIR/compose.app.yml"
SHARED_ENV_FILE="${DEPLOY_SHARED_ENV_FILE:-$SCRIPT_DIR/shared.env}"
RUNTIME_DIR="$SCRIPT_DIR/.runtime"
STATE_FILE="$RUNTIME_DIR/active-color"
INFRA_PROJECT_NAME="${INFRA_PROJECT_NAME:-groundpath-infra}"
APP_PROJECT_PREFIX="${APP_PROJECT_PREFIX:-groundpath}"

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  log "$*"
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

source_shared_env() {
  [ -f "$SHARED_ENV_FILE" ] || fail "Missing shared env file: $SHARED_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$SHARED_ENV_FILE"
  set +a
}

lowercase() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

current_color() {
  if [ -f "$STATE_FILE" ]; then
    tr -d '[:space:]' < "$STATE_FILE"
  fi
}

next_color() {
  local current="$1"

  if [ "$current" = "blue" ]; then
    printf 'green'
    return
  fi

  printf 'blue'
}

port_for_color() {
  local color="$1"

  if [ "$color" = "green" ]; then
    printf '%s' "${GREEN_CLIENT_PORT:-18082}"
    return
  fi

  printf '%s' "${BLUE_CLIENT_PORT:-18081}"
}

project_for_color() {
  printf '%s-%s' "$APP_PROJECT_PREFIX" "$1"
}

compose_infra() {
  docker compose -f "$INFRA_COMPOSE_FILE" --project-name "$INFRA_PROJECT_NAME" "$@"
}

compose_app() {
  local color="$1"
  local env_file="$2"

  shift 2
  docker compose --env-file "$env_file" -f "$APP_COMPOSE_FILE" --project-name "$(project_for_color "$color")" "$@"
}

wait_for_infra_service() {
  local service="$1"
  local desired_state="$2"
  local timeout_seconds="${INFRA_WAIT_TIMEOUT_SECONDS:-180}"
  local deadline=$((SECONDS + timeout_seconds))

  while [ "$SECONDS" -lt "$deadline" ]; do
    local container_id
    container_id="$(compose_infra ps -q "$service" | tail -n 1)"

    if [ -n "$container_id" ]; then
      local state
      state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"

      if [ "$state" = "$desired_state" ] || { [ "$desired_state" = "running" ] && [ "$state" = "healthy" ]; }; then
        return 0
      fi
    fi

    sleep 5
  done

  fail "Timed out waiting for infra service '$service' to become $desired_state"
}

login_to_ghcr_if_needed() {
  if [ -n "${GHCR_USERNAME:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
    log 'Logging in to ghcr.io'
    printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null
  fi
}

image_repository_for() {
  local service="$1"
  local default_suffix
  local override

  case "$service" in
    server)
      default_suffix='-server'
      override="${SERVER_IMAGE_REPOSITORY:-}"
      ;;
    client)
      default_suffix='-client'
      override="${CLIENT_IMAGE_REPOSITORY:-}"
      ;;
    *)
      fail "Unknown image service: $service"
      ;;
  esac

  if [ -n "$override" ]; then
    printf '%s' "$override"
    return
  fi

  [ -n "${GHCR_NAMESPACE:-}" ] || fail 'GHCR_NAMESPACE is required when image repository override is not set'
  [ -n "${GHCR_REPOSITORY:-}" ] || fail 'GHCR_REPOSITORY is required when image repository override is not set'

  printf 'ghcr.io/%s/%s%s' "$(lowercase "$GHCR_NAMESPACE")" "$(lowercase "$GHCR_REPOSITORY")" "$default_suffix"
}

image_ref_for() {
  local service="$1"
  [ -n "${DEPLOY_IMAGE_TAG:-}" ] || fail 'DEPLOY_IMAGE_TAG is required'
  printf '%s:%s' "$(image_repository_for "$service")" "$DEPLOY_IMAGE_TAG"
}

create_runtime_env_file() {
  local color="$1"
  local port="$2"
  local server_image="$3"
  local client_image="$4"
  local env_file="$RUNTIME_DIR/${color}.env"

  cp "$SHARED_ENV_FILE" "$env_file"

  cat >> "$env_file" <<EOF
DEPLOY_SHARED_ENV_FILE=$env_file
CLIENT_HOST_BIND=${CLIENT_HOST_BIND:-127.0.0.1}
CLIENT_PORT=$port
SERVER_IMAGE=$server_image
CLIENT_IMAGE=$client_image
EOF

  printf '%s' "$env_file"
}

wait_for_ready_endpoint() {
  local port="$1"
  local timeout_seconds="${HEALTHCHECK_TIMEOUT_SECONDS:-180}"
  local deadline=$((SECONDS + timeout_seconds))
  local url="http://${CLIENT_HOST_BIND:-127.0.0.1}:${port}/health/ready"

  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null; then
      return 0
    fi

    sleep 5
  done

  fail "Timed out waiting for ready endpoint: $url"
}

switch_openresty_upstream() {
  local port="$1"
  local include_path="${OPENRESTY_INCLUDE_PATH:-/www/sites/groundpath.one/proxy/groundpath-active.inc}"
  local tmp_path="${include_path}.tmp"
  local reload_command="${OPENRESTY_RELOAD_COMMAND:-openresty -s reload}"

  mkdir -p "$(dirname "$include_path")"
  printf 'set $groundpath_client_upstream http://127.0.0.1:%s;\n' "$port" > "$tmp_path"
  mv "$tmp_path" "$include_path"

  log "Reloading OpenResty with: $reload_command"
  sh -lc "$reload_command"
}

write_active_color() {
  printf '%s\n' "$1" > "$STATE_FILE"
}

established_connections_for_port() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -Htan state established "( dport = :${port} or sport = :${port} )" | wc -l | tr -d ' '
    return
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -tan | awk -v port=":${port}" '$4 ~ port || $5 ~ port {count++} END {print count+0}'
    return
  fi

  printf ''
}

drain_previous_stack() {
  local color="$1"

  [ -n "$color" ] || return 0

  local timeout_seconds="${OLD_STACK_DRAIN_TIMEOUT_SECONDS:-300}"
  local deadline=$((SECONDS + timeout_seconds))
  local port
  port="$(port_for_color "$color")"

  log "Waiting for previous stack connections on port $port to drain"

  while [ "$SECONDS" -lt "$deadline" ]; do
    local connection_count
    connection_count="$(established_connections_for_port "$port")"

    if [ -n "$connection_count" ] && [ "$connection_count" -eq 0 ]; then
      return 0
    fi

    sleep 5
  done

  log "Drain timeout reached for previous stack on port $port, continuing with shutdown"
}

ensure_infra() {
  if [ "${ENABLE_HYSTERIA_PROXY:-false}" = "true" ]; then
    compose_infra --profile proxy up -d mysql redis qdrant hy2-client
  else
    compose_infra up -d mysql redis qdrant
  fi

  wait_for_infra_service mysql healthy
  wait_for_infra_service redis healthy
  wait_for_infra_service qdrant running
}

main() {
  require_command docker
  require_command curl

  source_shared_env
  mkdir -p "$RUNTIME_DIR"

  local active
  active="$(current_color)"
  if [ "$active" != "blue" ] && [ "$active" != "green" ]; then
    active=''
  fi

  local target
  target="$(next_color "$active")"

  local target_port
  target_port="$(port_for_color "$target")"

  local server_image
  local client_image
  server_image="$(image_ref_for server)"
  client_image="$(image_ref_for client)"

  local target_env_file
  target_env_file="$(create_runtime_env_file "$target" "$target_port" "$server_image" "$client_image")"

  log "Deploying image tag $DEPLOY_IMAGE_TAG to color $target on port $target_port"
  login_to_ghcr_if_needed
  ensure_infra

  log "Cleaning stale target stack: $(project_for_color "$target")"
  compose_app "$target" "$target_env_file" down --remove-orphans || true

  log 'Pulling application images'
  compose_app "$target" "$target_env_file" pull server client

  log 'Running database migrations'
  compose_app "$target" "$target_env_file" run --rm migrate

  log 'Starting target application stack'
  compose_app "$target" "$target_env_file" up -d --remove-orphans server client
  wait_for_ready_endpoint "$target_port"

  log 'Switching traffic to target stack'
  switch_openresty_upstream "$target_port"
  write_active_color "$target"

  if [ -n "$active" ] && [ "$active" != "$target" ]; then
    local active_env_file
    active_env_file="$RUNTIME_DIR/${active}.env"

    drain_previous_stack "$active"
    log "Stopping previous stack: $(project_for_color "$active")"
    compose_app "$active" "$active_env_file" down --remove-orphans || true
  fi

  log 'Deployment complete'
}

main "$@"
