#!/usr/bin/env bash
# Assemble dist/ the way the deploy workflow does, for this fork's origin.
#
# vite build emits only the app bundle. The installer pages (index.html and
# the bookmarklet it generates, start.html, autoloader.user.js, and the
# rest) and sensor-data.js come from the AutoLL-2 revisions pinned in
# .github/workflows/deploy.yml. Upstream URLs are then repointed at
# PAGES_ORIGIN. github.com/joelface/bg1 and github.com/jgeurts/bg1 stay:
# they are the GPL attribution.
#
# GNU find, sed and sha256sum, same as the Ubuntu runner. From the repo root:
#
#   bash scripts/assemble-site.sh
#   bash scripts/assemble-site.sh --publish    # also commit dist/ onto site-ll
#
# --publish does not push. After it: git push origin site-ll
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

publish=0
if [ "${1:-}" = "--publish" ]; then
  publish=1
elif [ -n "${1:-}" ]; then
  echo "usage: bash scripts/assemble-site.sh [--publish]" >&2
  exit 2
fi

read_yaml() {
  awk -v key="$1" '
    $0 ~ "^  " key ": " {
      sub("^  " key ": ", "")
      print
      exit
    }
  ' .github/workflows/deploy.yml
}

PAGES_ORIGIN=${PAGES_ORIGIN:-$(read_yaml PAGES_ORIGIN)}
INSTALLER_REV=${AUTOLL2_INSTALLER_REV:-$(read_yaml AUTOLL2_INSTALLER_REV)}
RUNTIME_REV=${AUTOLL2_RUNTIME_REV:-$(read_yaml AUTOLL2_RUNTIME_REV)}
SOURCE_REV=${GITHUB_SHA:-$(git rev-parse HEAD)}

identity=$(sed -n "s/^export const PAGES_BASE = '\\(.*\\)';/\\1/p" src/appIdentity.ts)
if [ "$identity" != "$PAGES_ORIGIN" ]; then
  echo "PAGES_BASE ($identity) and PAGES_ORIGIN ($PAGES_ORIGIN) disagree" >&2
  exit 1
fi
if [ -z "$INSTALLER_REV" ] || [ -z "$RUNTIME_REV" ]; then
  echo "installer or runtime pin is missing from deploy.yml" >&2
  exit 1
fi

cache=${ASSEMBLE_CACHE:-${TMPDIR:-/tmp}/autoll3-assemble}
mkdir -p "$cache"

fetch_pin() {
  local rev=$1 dest=$2
  if [ ! -d "$dest/.git" ]; then
    git clone --filter=blob:none --no-checkout https://github.com/mbs1234/AutoLL-2.git "$dest"
  fi
  git -C "$dest" fetch --depth 1 origin "$rev"
  git -C "$dest" checkout --detach --force FETCH_HEAD
  local got
  got=$(git -C "$dest" rev-parse HEAD)
  if [ "$got" != "$rev" ]; then
    echo "$dest is $got, wanted $rev" >&2
    exit 1
  fi
}

echo "origin $PAGES_ORIGIN"
echo "installer $INSTALLER_REV"
echo "runtime   $RUNTIME_REV"
fetch_pin "$INSTALLER_REV" "$cache/installer"
fetch_pin "$RUNTIME_REV" "$cache/runtime"
installer=$cache/installer
runtime=$cache/runtime

npm run build

for f in index.html index.css icon.png start.html news.html \
  contact.html autoloader.user.js; do
  if [ -f "$installer/$f" ]; then
    cp "$installer/$f" "dist/$f"
    echo "overlaid $f"
  elif [ "$f" = index.html ] || [ "$f" = autoloader.user.js ]; then
    echo "missing $installer/$f; the site would have no way to install it" >&2
    exit 1
  else
    echo "warning: $installer/$f not found, skipped"
  fi
done

if [ ! -f "$runtime/sensor-data.js" ]; then
  echo "missing $runtime/sensor-data.js; booking will fail" >&2
  exit 1
fi
cp "$runtime/sensor-data.js" dist/sensor-data.js
echo "overlaid sensor-data.js"
# Hashed before branding. The payload is obfuscated and must not be edited;
# the find below excludes it by name, and the hash afterwards is the check.
sha256sum dist/sensor-data.js | cut -d' ' -f1 > /tmp/autoll3-sensor-data.sha256

# joelface.github.io/bg1 is the upstream Pages origin inside the bookmarklet
# and the autoloader. github.com/joelface/bg1 is a different string and is
# left alone. sensor-data.js matches *.js and is excluded on purpose.
find dist -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) \
  -not -name 'sensor-data.js' -print0 |
  xargs -0 --no-run-if-empty \
    sed -i \
      -e "s|https://joelface\\.github\\.io/bg1|$PAGES_ORIGIN|g" \
      -e 's|https://github.com/mbs1234/AutoLL-2|https://github.com/mbs1234/AutoLL-3|g' \
      -e 's/AutoLL-2/AutoLL-3/g' \
      -e 's/autoll2/autoll3/g'

assets=()
for f in index.html start.html news.html contact.html autoloader.user.js; do
  [ -f "dist/$f" ] && assets+=("dist/$f")
done
if [ ${#assets[@]} -eq 0 ]; then
  echo "no installer assets present to check for branding" >&2
  exit 1
fi
set +e
hits=$(grep -nEi 'AutoLL-2|autoll2|mbs1234/AutoLL-2' "${assets[@]}")
branding_status=$?
set -e
if [ "$branding_status" -eq 0 ]; then
  echo "$hits" >&2
  echo "AutoLL-2 branding remains in an installer asset" >&2
  exit 1
fi
if [ "$branding_status" -ne 1 ]; then
  echo "branding check failed to read its inputs (grep exit $branding_status)" >&2
  exit 1
fi

expected=$(cat /tmp/autoll3-sensor-data.sha256)
actual=$(sha256sum dist/sensor-data.js | cut -d' ' -f1)
if [ "$expected" != "$actual" ]; then
  echo "sensor-data.js changed after it was copied ($expected -> $actual)" >&2
  exit 1
fi
echo "sensor-data.js unchanged ($actual)"

for f in docs/user-guide.html docs/user-guide; do
  if [ ! -e "$f" ]; then
    echo "$f not found; the site would link to a missing guide" >&2
    exit 1
  fi
done
cp docs/user-guide.html dist/guide.html
cp -R docs/user-guide dist/user-guide

installer_rev=$(git -C "$installer" rev-parse HEAD)
runtime_rev=$(git -C "$runtime" rev-parse HEAD)
(
  cd dist
  find . -type f \
    ! -name autoll3-files.sha256 \
    ! -name autoll3-release.json \
    -printf '%P\n' |
    LC_ALL=C sort |
    while IFS= read -r file; do sha256sum "$file"; done \
      > autoll3-files.sha256
  for file in bg1.js bg1.css responder.html responder.js wdw.js \
    sensor-data.js index.html index.css contact.html \
    autoloader.user.js; do
    grep -Eq "  ${file//./\\.}$" autoll3-files.sha256 || {
      echo "$file is absent from the release manifest" >&2
      exit 1
    }
  done
  printf '{\n  "application": "AutoLL-3",\n  "sourceRevision": "%s",\n  "installerRevision": "%s",\n  "runtimeModuleRevision": "%s",\n  "fileManifest": "autoll3-files.sha256"\n}\n' \
    "$SOURCE_REV" "$installer_rev" "$runtime_rev" > autoll3-release.json
)

# The bookmarklet is the #bm-script function, minified the same way index.html
# minifies it, then percent-encoded. Confirm that text loads this origin.
node --input-type=module <<'EOF'
import { readFileSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const match = html.match(/<script id="bm-script">([\s\S]*?)<\/script>/);
if (!match) {
  console.error('index.html has no bookmarklet script');
  process.exit(1);
}
const scriptText =
  match[1].trim().replace(/;$/, '').replace(/\s*([;,{}=>+])\s*/g, '$1') + '()';
const decoded = decodeURIComponent(encodeURIComponent(scriptText));
const origin = decoded.match(/u='(https:\/\/[^']+)'/);
if (!origin) {
  console.error('bookmarklet has no asset origin');
  process.exit(1);
}
const urls = [...decoded.matchAll(/u\+'([a-z0-9.]+)/g)].map(
  match => origin[1] + match[1]
);
for (const url of [
  'https://ll.herzig.net/bg1.js',
  'https://ll.herzig.net/bg1.css',
]) {
  if (!urls.includes(url)) {
    console.error(`bookmarklet does not load ${url}`);
    console.error(urls.join('\n'));
    process.exit(1);
  }
}
if (decoded.includes('mbs1234.github.io') || decoded.includes('joelface.github.io')) {
  console.error('bookmarklet still names the old pages origin');
  process.exit(1);
}
console.log('bookmarklet loads https://ll.herzig.net/bg1.js and bg1.css');
EOF

if ! grep -q 'https://github.com/joelface/bg1' dist/contact.html ||
  ! grep -q 'https://github.com/jgeurts/bg1' dist/contact.html; then
  echo "contact.html is missing a GPL attribution link" >&2
  exit 1
fi

if grep -q '/AutoLL-3/' dist/bg1.js dist/responder.html; then
  echo "the bundle still has the /AutoLL-3/ path prefix" >&2
  exit 1
fi

echo "assembled dist/ for $PAGES_ORIGIN from $SOURCE_REV"

if [ "$publish" -eq 1 ]; then
  branch=site-ll
  wt=$(mktemp -d)
  cleanup() { git worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"; }
  trap cleanup RETURN
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    git worktree add "$wt" "$branch"
  else
    git worktree add --detach "$wt" HEAD
    git -C "$wt" checkout --orphan "$branch"
  fi
  git -C "$wt" rm -rf . >/dev/null 2>&1 || true
  find "$wt" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -a dist/. "$wt/"
  git -C "$wt" add -A
  if git -C "$wt" diff --cached --quiet; then
    echo "$branch already matches dist/"
  else
    git -C "$wt" commit -m "Publish the https://ll.herzig.net site"
    echo "committed $branch"
  fi
  trap - RETURN
  git worktree remove --force "$wt"
  echo "push with: git push -u origin $branch"
fi
