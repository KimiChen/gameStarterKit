#!/usr/bin/env bash
set -Eeuo pipefail

site_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ssh_key="${HOME}/.ssh/id_rsa_nopassword"
remote="root@129.211.70.96:/www/wwwroot/gono.games/"

if ! command -v rsync >/dev/null 2>&1; then
  printf '错误：未找到 rsync。\n' >&2
  exit 1
fi

if [[ ! -f "$ssh_key" ]]; then
  printf '错误：SSH key 不存在：%s\n' "$ssh_key" >&2
  exit 1
fi

sources=(
  "$site_dir/index.html"
  "$site_dir/style.css"
  "$site_dir/script.js"
  "$site_dir/favicon.ico"
)

for source in "${sources[@]}"; do
  if [[ ! -f "$source" ]]; then
    printf '错误：部署文件不存在：%s\n' "$source" >&2
    exit 1
  fi
done

printf '部署三份核心文件和 favicon 到 %s\n' "$remote"
rsync \
  --archive \
  --human-readable \
  --protect-args \
  --verbose \
  -e "ssh -i $ssh_key -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15" \
  "${sources[@]}" \
  "$remote"

printf '部署完成。\n'
