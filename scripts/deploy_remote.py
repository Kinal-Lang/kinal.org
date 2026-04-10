#!/usr/bin/env python3
from __future__ import annotations

import argparse
import pathlib
import shlex
import sys
import time

import paramiko


REMOTE_INSTALL_SCRIPT = r"""#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-kinal-org.service}"
SITE_ARCHIVE_PATH="${SITE_ARCHIVE_PATH:?missing site archive path}"
SITE_RELEASE="${SITE_RELEASE:?missing site release name}"
COMPILER_ARCHIVE_PATH="${COMPILER_ARCHIVE_PATH:-}"
COMPILER_RELEASE="${COMPILER_RELEASE:-}"
HOST_ARG="${HOST_ARG:-0.0.0.0}"
SERVICE_USER="${SERVICE_USER:-kinal}"
SERVICE_GROUP="${SERVICE_GROUP:-kinal}"

SITE_ROOT="/srv/kinal.org"
SITE_RELEASES="$SITE_ROOT/releases"
SITE_BACKUPS="$SITE_ROOT/backups"
STATIC_ROOT="/var/www/kinal-static"
STATIC_RELEASES="$STATIC_ROOT/releases"
STATIC_BACKUPS="$STATIC_ROOT/backups"
TOOLCHAIN_ROOT="/opt/kinal/toolchains"
TOOLCHAIN_RELEASES="$TOOLCHAIN_ROOT/releases"
RUNTIME_ROOT="/var/lib/kinal.org"
TEMP_ROOT="$RUNTIME_ROOT/temp"
ENV_DIR="/etc/kinal"
ENV_FILE="$ENV_DIR/kinal-org.env"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"
NGINX_FILE="/etc/nginx/conf.d/reverse.conf"

ensure_service_account() {
  if ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    groupadd --system "$SERVICE_GROUP"
  fi
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    useradd \
      --system \
      --gid "$SERVICE_GROUP" \
      --home-dir "$RUNTIME_ROOT" \
      --shell /usr/sbin/nologin \
      "$SERVICE_USER"
  fi
}

ensure_layout() {
  mkdir -p \
    "$SITE_RELEASES" \
    "$SITE_BACKUPS" \
    "$STATIC_RELEASES" \
    "$STATIC_BACKUPS" \
    "$TOOLCHAIN_RELEASES" \
    "$RUNTIME_ROOT" \
    "$TEMP_ROOT" \
    "$ENV_DIR"
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$SITE_ROOT" "$RUNTIME_ROOT"
  chmod 0755 "$SITE_ROOT" "$SITE_RELEASES" "$SITE_BACKUPS" "$RUNTIME_ROOT" "$TEMP_ROOT"
}

snapshot_path() {
  local src="$1"
  local dst="$2"
  if [ -d "$src" ]; then
    rm -rf "$dst"
    mkdir -p "$dst"
    cp -a "$src"/. "$dst"/
  fi
}

backup_legacy_static_root() {
  local dst="$1"
  mkdir -p "$dst"
  local name=""
  for name in googlecb65b3df36c5eb64.html html install.sh robots.txt sitemap.xml static; do
    if [ -e "$STATIC_ROOT/$name" ]; then
      cp -a "$STATIC_ROOT/$name" "$dst"/
    fi
  done
}

backup_current_layout() {
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"

  if [ -L "$SITE_ROOT/current" ] || [ -d "$SITE_ROOT/current" ]; then
    local current_site
    current_site="$(readlink -f "$SITE_ROOT/current" 2>/dev/null || true)"
    if [ -n "$current_site" ] && [ -d "$current_site" ]; then
      if [[ "$current_site" == "$SITE_RELEASES/"* ]]; then
        ln -sfn "$current_site" "$SITE_BACKUPS/$stamp"
      else
        snapshot_path "$current_site" "$SITE_BACKUPS/$stamp"
      fi
    fi
  fi

  if [ -L "$STATIC_ROOT/current" ] || [ -d "$STATIC_ROOT/current" ]; then
    local current_static
    current_static="$(readlink -f "$STATIC_ROOT/current" 2>/dev/null || true)"
    if [ -n "$current_static" ] && [ -d "$current_static" ]; then
      if [[ "$current_static" == "$STATIC_RELEASES/"* ]]; then
        ln -sfn "$current_static" "$STATIC_BACKUPS/$stamp"
      else
        snapshot_path "$current_static" "$STATIC_BACKUPS/$stamp"
      fi
    fi
  elif [ -d "$STATIC_ROOT/static" ] || [ -d "$STATIC_ROOT/html" ]; then
    backup_legacy_static_root "$STATIC_BACKUPS/$stamp"
  fi

  mkdir -p "$SITE_BACKUPS/$stamp.meta"
  if [ -f "$ENV_FILE" ]; then
    cp -a "$ENV_FILE" "$SITE_BACKUPS/$stamp.meta/kinal-org.env"
  fi
  if [ -f "$SERVICE_FILE" ]; then
    cp -a "$SERVICE_FILE" "$SITE_BACKUPS/$stamp.meta/$SERVICE_NAME"
  fi
  if [ -f "$NGINX_FILE" ]; then
    cp -a "$NGINX_FILE" "$SITE_BACKUPS/$stamp.meta/reverse.conf"
  fi

  echo "backup stamp: $stamp"
}

stop_service() {
  if systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1; then
    systemctl stop "$SERVICE_NAME" || true
  fi
}

extract_archive_root() {
  local archive="$1"
  local output_dir="$2"
  local staging_dir
  staging_dir="$(mktemp -d)"
  tar -xf "$archive" -C "$staging_dir"
  local entries=()
  while IFS= read -r item; do
    entries+=("$item")
  done < <(find "$staging_dir" -mindepth 1 -maxdepth 1 | sort)

  mkdir -p "$output_dir"
  rm -rf "$output_dir"/*

  if [ "${#entries[@]}" -eq 1 ] && [ -d "${entries[0]}" ]; then
    cp -a "${entries[0]}"/. "$output_dir"/
  else
    cp -a "$staging_dir"/. "$output_dir"/
  fi

  rm -rf "$staging_dir"
}

install_compiler_bundle() {
  if [ -z "$COMPILER_ARCHIVE_PATH" ] || [ -z "$COMPILER_RELEASE" ]; then
    return 0
  fi

  local compiler_dir="$TOOLCHAIN_RELEASES/$COMPILER_RELEASE"
  rm -rf "$compiler_dir"
  mkdir -p "$compiler_dir"
  extract_archive_root "$COMPILER_ARCHIVE_PATH" "$compiler_dir"

  if [ ! -f "$compiler_dir/kinal" ]; then
    echo "compiler bundle does not contain kinal" >&2
    exit 1
  fi

  chmod +x "$compiler_dir/kinal" || true
  if [ -f "$compiler_dir/kinalvm" ]; then
    chmod +x "$compiler_dir/kinalvm" || true
  fi

  ln -sfn "$compiler_dir" "$TOOLCHAIN_ROOT/current"
  ln -sfn "$TOOLCHAIN_ROOT/current/kinal" /usr/local/bin/kinal
  if [ -f "$compiler_dir/kinalvm" ]; then
    ln -sfn "$TOOLCHAIN_ROOT/current/kinalvm" /usr/local/bin/kinalvm
  fi
}

install_site_bundle() {
  local site_dir="$SITE_RELEASES/$SITE_RELEASE"
  local static_dir="$STATIC_RELEASES/$SITE_RELEASE"

  rm -rf "$site_dir" "$static_dir"
  mkdir -p "$site_dir" "$static_dir"
  extract_archive_root "$SITE_ARCHIVE_PATH" "$site_dir"

  if [ ! -f "$site_dir/Website" ]; then
    echo "site bundle does not contain Website executable" >&2
    exit 1
  fi
  if [ ! -d "$site_dir/managed" ]; then
    echo "site bundle does not contain managed assets" >&2
    exit 1
  fi

  chmod +x "$site_dir/Website" || true

  rm -rf "$site_dir/temp"
  ln -sfn "$TEMP_ROOT" "$site_dir/temp"
  chown -h "$SERVICE_USER:$SERVICE_GROUP" "$site_dir/temp"

  preserve_existing_release_feed \
    "$site_dir/managed/static/data/releases.json" \
    "$STATIC_ROOT/current/static/data/releases.json"

  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$site_dir"

  cp -a "$site_dir/managed"/. "$static_dir"/
  preserve_existing_static_file \
    "$static_dir/install.sh" \
    "$STATIC_ROOT/current/install.sh"
  chmod -R go+rX "$static_dir"

  ln -sfn "$site_dir" "$SITE_ROOT/current"
  ln -sfn "$static_dir" "$STATIC_ROOT/current"
}

write_env_file() {
  cat > "$ENV_FILE" <<EOF
KINAL_HOME=$TOOLCHAIN_ROOT/current
KINAL_PATH=$TOOLCHAIN_ROOT/current/kinal
PATH=$TOOLCHAIN_ROOT/current:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
KINAL_COMPILE_SLOTS=2
KINAL_JOB_SLOTS=4
EOF
  chmod 0644 "$ENV_FILE"
}

write_service_file() {
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Kinal.org website
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$SITE_ROOT/current
EnvironmentFile=-$ENV_FILE
ExecStart=$SITE_ROOT/current/Website $HOST_ARG
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
}

write_nginx_file() {
  cat > "$NGINX_FILE" <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    return 403;
}

server {
    listen 80;
    server_name www.kinal.org;
    return 301 https://kinal.org$request_uri;
}

server {
    listen 80;
    server_name kinal.org;

    location = /__kinal/reload/version {
        default_type text/plain;
        add_header Cache-Control "no-store";
        return 200 "prod-stable";
    }

    location = /robots.txt {
        alias /var/www/kinal-static/current/robots.txt;
        access_log off;
    }

    location = /install.sh {
        alias /var/www/kinal-static/current/install.sh;
        default_type text/plain;
        access_log off;
        expires 5m;
        add_header Cache-Control "public, max-age=300";
    }

    location = /sitemap.xml {
        alias /var/www/kinal-static/current/sitemap.xml;
        access_log off;
    }

    location = /googlecb65b3df36c5eb64.html {
        alias /var/www/kinal-static/current/googlecb65b3df36c5eb64.html;
        access_log off;
    }

    location = /favicon.ico {
        alias /var/www/kinal-static/current/static/favicon.svg;
        default_type image/svg+xml;
        access_log off;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    location /static/ {
        alias /var/www/kinal-static/current/static/;
        access_log off;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    location / {
        proxy_pass http://127.0.0.1:18081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
}

start_services() {
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null
  nginx -t
  systemctl restart "$SERVICE_NAME"
  systemctl reload nginx
}

verify_deploy() {
  systemctl is-active --quiet "$SERVICE_NAME"
  curl -fsS -H 'Host: kinal.org' http://127.0.0.1/ >/dev/null
  curl -fsS -H 'Host: kinal.org' http://127.0.0.1/static/app.js >/dev/null
}

cleanup_uploads() {
  rm -f "$SITE_ARCHIVE_PATH"
  if [ -n "$COMPILER_ARCHIVE_PATH" ]; then
    rm -f "$COMPILER_ARCHIVE_PATH"
  fi
}

release_feed_has_entries() {
  local path="$1"
  if [ ! -f "$path" ]; then
    return 1
  fi
  python3 - "$path" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
try:
    payload = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(1)

releases = payload.get("releases")
if isinstance(releases, list) and releases:
    raise SystemExit(0)
raise SystemExit(1)
PY
}

preserve_existing_release_feed() {
  local incoming_feed="$1"
  local current_feed="$2"

  if release_feed_has_entries "$incoming_feed"; then
    return 0
  fi

  if release_feed_has_entries "$current_feed"; then
    mkdir -p "$(dirname "$incoming_feed")"
    cp -a "$current_feed" "$incoming_feed"
    echo "preserved existing release feed: $current_feed"
    return 0
  fi

  echo "warning: incoming release feed is empty and no current feed could be preserved" >&2
}

preserve_existing_static_file() {
  local incoming_path="$1"
  local current_path="$2"

  if [ -f "$incoming_path" ]; then
    return 0
  fi

  if [ -f "$current_path" ]; then
    mkdir -p "$(dirname "$incoming_path")"
    cp -a "$current_path" "$incoming_path"
    echo "preserved existing static file: $current_path"
    return 0
  fi
}

main() {
  ensure_service_account
  ensure_layout
  backup_current_layout
  stop_service
  install_compiler_bundle
  install_site_bundle
  write_env_file
  write_service_file
  write_nginx_file
  start_services
  verify_deploy
  cleanup_uploads
  echo "deploy complete"
  echo "site current: $(readlink -f "$SITE_ROOT/current")"
  echo "static current: $(readlink -f "$STATIC_ROOT/current")"
  echo "compiler current: $(readlink -f "$TOOLCHAIN_ROOT/current" 2>/dev/null || true)"
}

main "$@"
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy a built kinal.org bundle to the remote server")
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=22)
    parser.add_argument("--user", required=True)
    parser.add_argument("--password")
    parser.add_argument("--key-file")
    parser.add_argument("--site-archive", type=pathlib.Path, required=True)
    parser.add_argument("--site-release", required=True)
    parser.add_argument("--compiler-archive", type=pathlib.Path)
    parser.add_argument("--compiler-release")
    parser.add_argument("--service-name", default="kinal-org.service")
    parser.add_argument("--service-user", default="kinal")
    parser.add_argument("--service-group", default="kinal")
    parser.add_argument("--host-arg", default="0.0.0.0")
    return parser.parse_args()


def connect_ssh(args: argparse.Namespace) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    for attempt in range(5):
        try:
            connect_kwargs = {
                "hostname": args.host,
                "port": args.port,
                "username": args.user,
                "timeout": 20,
                "banner_timeout": 60,
                "auth_timeout": 30,
                "look_for_keys": False,
                "allow_agent": False,
            }
            if args.key_file:
                connect_kwargs["key_filename"] = str(pathlib.Path(args.key_file).resolve())
            else:
                connect_kwargs["password"] = args.password
            client.connect(**connect_kwargs)
            return client
        except Exception:
            if attempt == 4:
                raise
            time.sleep(3)

    raise RuntimeError("SSH connection retry loop exited unexpectedly")


def upload_file(sftp: paramiko.SFTPClient, local_path: pathlib.Path, remote_path: str) -> None:
    local_path = local_path.resolve()
    if not local_path.is_file():
        raise FileNotFoundError(local_path)
    sftp.put(str(local_path), remote_path)


def run_remote_script(client: paramiko.SSHClient, env: dict[str, str]) -> int:
    env_parts = [f"{name}={shlex.quote(value)}" for name, value in env.items() if value]
    command = " ".join(env_parts + ["bash", "-s"])
    stdin, stdout, stderr = client.exec_command(command, timeout=1800)
    stdin.write(REMOTE_INSTALL_SCRIPT)
    stdin.channel.shutdown_write()

    while not stdout.channel.exit_status_ready():
        chunk = stdout.channel.recv(4096)
        if chunk:
            sys.stdout.write(chunk.decode("utf-8", errors="replace"))
            sys.stdout.flush()
        err_chunk = stderr.channel.recv_stderr(4096)
        if err_chunk:
            sys.stderr.write(err_chunk.decode("utf-8", errors="replace"))
            sys.stderr.flush()
        time.sleep(0.1)

    remaining_stdout = stdout.read().decode("utf-8", errors="replace")
    remaining_stderr = stderr.read().decode("utf-8", errors="replace")
    if remaining_stdout:
        sys.stdout.write(remaining_stdout)
    if remaining_stderr:
        sys.stderr.write(remaining_stderr)
    return stdout.channel.recv_exit_status()


def main() -> int:
    args = parse_args()

    if not args.key_file and not args.password:
        raise SystemExit("either --password or --key-file is required")
    if args.compiler_archive and not args.compiler_release:
        raise SystemExit("--compiler-release is required when --compiler-archive is set")

    client = connect_ssh(args)
    try:
        sftp = client.open_sftp()
        remote_site_archive = f"/tmp/kinal-org-site-{int(time.time())}.tar.gz"
        remote_compiler_archive = ""
        upload_file(sftp, args.site_archive, remote_site_archive)
        if args.compiler_archive:
            remote_compiler_archive = f"/tmp/kinal-compiler-{int(time.time())}.tar.gz"
            upload_file(sftp, args.compiler_archive, remote_compiler_archive)
        sftp.close()

        exit_code = run_remote_script(
            client,
            {
                "SERVICE_NAME": args.service_name,
                "SERVICE_USER": args.service_user,
                "SERVICE_GROUP": args.service_group,
                "SITE_ARCHIVE_PATH": remote_site_archive,
                "SITE_RELEASE": args.site_release,
                "COMPILER_ARCHIVE_PATH": remote_compiler_archive,
                "COMPILER_RELEASE": args.compiler_release or "",
                "HOST_ARG": args.host_arg,
            },
        )
        return exit_code
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
