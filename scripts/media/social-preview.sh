#!/bin/sh
# Render the GitHub social preview (upload in repo Settings → General → Social preview).
set -e
cd "$(dirname "$0")/../.."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --hide-scrollbars --window-size=1280,640 --force-device-scale-factor=1 \
  --virtual-time-budget=3000 --allow-file-access-from-files \
  --screenshot="$PWD/.github/social-preview.png" "file://$PWD/scripts/media/social-preview.html"
ls -lh .github/social-preview.png
