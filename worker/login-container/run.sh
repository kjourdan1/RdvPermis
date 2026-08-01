#!/bin/bash
set -euo pipefail
export DISPLAY=:0
mkdir -p /output
chmod 777 /output || true

# The '--no-sandbox' infobar shifts every on-page Y coordinate down by this
# many pixels. There's no supported flag to suppress that infobar (Google
# removed --disable-infobars specifically to stop this) short of dropping
# Chromium to a non-root user, which then needs --cap-add=SYS_ADMIN to get
# its own sandbox working in Docker -- not clearly safer, more moving parts.
# Root + --no-sandbox + this offset is the simpler tradeoff for a
# single-purpose container that only ever visits one trusted government site.
OFF=132

# Always leave a screenshot of the final state behind, success or failure --
# this is the diagnostic trail if the page layout ever drifts. Picked up as
# a CI artifact by the workflow, never sent anywhere else.
trap 'scrot /output/on-exit.png 2>/dev/null || true' EXIT

echo '[run] starting Xorg'
Xorg :0 -noreset -logfile /tmp/xorg.log &
for i in $(seq 1 20); do
  xdpyinfo >/dev/null 2>&1 && break
  sleep 0.5
done
xdpyinfo >/dev/null 2>&1 || { echo '[run] Xorg failed to start'; cat /tmp/xorg.log; exit 1; }
echo '[run] Xorg is up'
# hdmi_force_hotplug=1 + the vc4-kms-v3d overlay on the host (see
# RPI4B/config_ssh_init_dietpi.md) make the GPU treat HDMI-2 as always
# connected even with no monitor attached -- real hardware-accelerated
# rendering, not the software fallback Turnstile can fingerprint.
xrandr --output HDMI-1 --off --output HDMI-2 --primary --mode 1920x1080 2>/dev/null || true
sleep 1

source /opt/human-lib.sh

rm -rf /tmp/chromium-profile
nohup chromium --user-data-dir=/tmp/chromium-profile --window-size=1280,900 --window-position=0,0 \
  --no-first-run --no-default-browser-check --no-sandbox \
  'https://candidat.permisdeconduire.gouv.fr/' > /tmp/chromium.log 2>&1 &

# `xdotool search` exits non-zero when nothing matches yet, which combined
# with `set -e`/pipefail would otherwise kill the script outright the first
# time Chromium takes longer than expected to map its window (as happened on
# the CI runner's first cold run -- fine locally where it's reliably fast).
WIN=""
for i in $(seq 1 30); do
  WIN=$(xdotool search --onlyvisible --class chromium 2>/dev/null | head -1) || true
  [[ -n "$WIN" ]] && break
  sleep 1
done
if [[ -z "$WIN" ]]; then
  echo '[run] chromium never created a window'
  cat /tmp/chromium.log 2>&1 || true
  exit 1
fi
echo "[run] chromium window: $WIN"
# The window can exist before the page has actually rendered (confirmed on
# the CI runner: the first screenshot came back blank white), and clicking
# too early lands on whatever partial content happened to render first --
# in one run, that was the FranceConnect button instead of the cookie
# banner, sending the whole flow down the wrong provider's login page.
# There's no CDP here to wait for a real "page loaded" event, so a generous
# fixed margin is the pragmatic fix.
sleep 5
xdotool windowfocus "$WIN"
xdotool windowraise "$WIN"
sleep 0.5
scrot /output/0-initial.png

echo '[run] accepting cookies'
move_mouse_human 569 $((665+OFF))
xdotool click 1
sleep 2.5
scrot /output/0b-after-cookies.png

echo '[run] scrolling to form'
xdotool mousemove 500 $((500+OFF))
for i in 1 2 3 4 5 6; do xdotool click 5; sleep 0.08; done
sleep 1
scrot /output/1-form.png

echo '[run] filling email'
move_mouse_human 495 $((235+OFF))
xdotool click 1
sleep 0.9
type_human "$EMAIL"
sleep 1.1

echo '[run] filling password'
move_mouse_human 500 $((322+OFF))
xdotool click 1
sleep 0.8
type_human "$PASSWORD"
sleep 1.2
scrot /output/2-filled.png

echo '[run] clicking turnstile'
move_mouse_human 453 583
xdotool click 1
sleep 4
scrot /output/3-turnstile.png

echo '[run] submitting'
move_mouse_human 632 665
xdotool click 1
sleep 10
scrot /output/4-final.png

TITLE=$(xdotool getwindowname "$WIN")
echo "[run] title: $TITLE"
if [[ "$TITLE" != *'Mon espace candidat'* ]]; then
  echo '[run] LOGIN FAILED'
  exit 1
fi
echo '[run] LOGIN SUCCESS'

# Dismiss the "Save password?" prompt if Chromium shows one.
move_mouse_human 1013 375
xdotool click 1
sleep 1

# Extract the session cookie via DevTools instead of Chromium's on-disk
# cookie store: the auth cookies are HttpOnly (invisible to document.cookie),
# and reverse-engineering Chromium's current cookie-encryption scheme turned
# out to be a dead end. The Network panel's raw request headers show
# HttpOnly cookies too, and a plain triple-click + copy lifts the exact
# Cookie header string checkSlots.ts needs -- no crypto involved.
echo '[run] extracting cookie via devtools'
xdotool key --clearmodifiers F12
sleep 3
xdotool mousemove 1038 157; xdotool click 1; sleep 1
# Chromium's own reload button, not DevTools' inline "Reload page" button --
# the latter never registered a click reliably in this environment. The
# Network tab has to actually be recording *before* the click, and the page
# needs time to reload and finish fetching before we go looking for the
# request row -- both steps that were racing ahead of the real page state
# on the CI runner (see the two timing fixes above this one).
xdotool mousemove 95 63; xdotool click 1
sleep 6
# Filter to "Doc" requests only first: by the time we get here there can be
# dozens of requests loaded (fonts, scripts, images...), so a fixed pixel
# position for "the top row" isn't reliable -- it hit a font file's row in
# one CI run. Filtering down to the one document request first makes its
# row position deterministic regardless of how much else has loaded.
xdotool mousemove 853 261; xdotool click 1; sleep 1
xdotool mousemove 830 392; xdotool click 1
sleep 2
scrot /output/5-network.png
xdotool mousemove 1100 650
for i in 1 2 3 4 5 6 7 8 9 10 11; do xdotool click 5; sleep 0.1; done
sleep 0.5
scrot /output/6-headers-scrolled.png
xdotool mousemove 1100 700
xdotool click --repeat 3 --delay 80 1
sleep 0.5
xdotool key --clearmodifiers ctrl+c
sleep 0.3
xclip -selection clipboard -o > /output/cookie.txt
wc -c /output/cookie.txt

echo '[run] verifying the cookie actually works before handing off'
COOKIE=$(cat /output/cookie.txt)
STATUS=$(curl -s -o /output/api-test.json -w '%{http_code}' \
  -H "Cookie: $COOKIE" \
  -H 'accept: application/json, text/plain, */*' \
  -H 'user-agent: Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' \
  'https://candidat.permisdeconduire.gouv.fr/api/v1/candidat/creneaux?code-departement=078')
echo "[run] API check status: $STATUS"
if [[ "$STATUS" != "200" ]]; then
  echo '[run] cookie does not work against the real API'
  exit 1
fi

echo '[run] DONE'
