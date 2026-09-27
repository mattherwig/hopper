#!/bin/sh
# Render the social cards from social-preview.html:
#   .github/social-preview.png  1280x640, GitHub (upload in repo Settings → General → Social preview)
#   site/og-image.png           1200x630, the landing page's og:image (link previews)
set -e
cd "$(dirname "$0")/../.."
render() { # width height output
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --hide-scrollbars --window-size="$1,$2" --force-device-scale-factor=1 \
    --virtual-time-budget=3000 --allow-file-access-from-files \
    --screenshot="$PWD/$3" "file://$PWD/scripts/media/social-preview.html"
}
render 1280 640 .github/social-preview.png
render 1200 630 site/og-image.png
ls -lh .github/social-preview.png site/og-image.png
