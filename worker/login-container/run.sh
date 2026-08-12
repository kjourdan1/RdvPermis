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
trap 'snap on-exit.png 2>/dev/null || scrot /output/on-exit.png 2>/dev/null || true' EXIT

echo '[run] starting Xorg'
Xorg :0 -noreset -logfile /tmp/xorg.log &
for i in $(seq 1 20); do
  xdpyinfo >/dev/null 2>&1 && break
  sleep 0.5
done
xdpyinfo >/dev/null 2>&1 || { echo '[run] Xorg failed to start'; cat /tmp/xorg.log; exit 1; }
echo '[run] Xorg is up'
# hdmi_force_hotplug:1=1 + hdmi_group:1=1 + hdmi_mode:1=16 on the host (see
# RPI4B/config_ssh_init_dietpi.md) force HDMI-2 to report 1920x1080 even with
# no monitor attached -- real hardware-accelerated rendering, not the
# software fallback Turnstile can fingerprint.
xrandr --output HDMI-1 --off --output HDMI-2 --primary --mode 1920x1080 2>/tmp/xrandr.log || {
  echo '[run] WARNING: xrandr failed to set HDMI-2 to 1920x1080:'
  cat /tmp/xrandr.log
}
sleep 1

# Logged explicitly rather than assumed: every coordinate below is calibrated
# for 1920x1080, and a silent fallback resolution (e.g. Xorg falling back to
# an EDID-less default) is exactly what broke every run the night the RPi's
# screen got unplugged -- this line is what would have made that obvious from
# the CI log alone instead of needing to diff PNG dimensions in the artifact.
RESOLUTION=$(xdpyinfo | awk '/dimensions:/{print $2}')
echo "[run] X screen resolution: $RESOLUTION"
RES_MISMATCH=0
if [[ "$RESOLUTION" != "1920x1080" ]]; then
  echo "[run] WARNING: expected 1920x1080, got $RESOLUTION -- all pixel coordinates below will be off target"
  RES_MISMATCH=1
fi

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

# Every scrot call goes through here instead of being called directly, so the
# CI log has a title + resolution breadcrumb next to each screenshot -- lets
# you tell from the log alone (no artifact download) whether a given step
# actually landed on the page it thinks it did.
snap() {
  local title
  title=$(xdotool getwindowname "$WIN" 2>/dev/null || echo '?')
  echo "[run] snapshot $1 -- title: \"$title\" -- resolution: $(xdpyinfo | awk '/dimensions:/{print $2}')"
  scrot "/output/$1"
}

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
snap 0-initial.png

echo '[run] accepting cookies'
move_mouse_human 569 $((665+OFF))
xdotool click 1
sleep 2.5
snap 0b-after-cookies.png

echo '[run] scrolling to form'
xdotool mousemove 500 $((500+OFF))
for i in 1 2 3 4 5 6; do xdotool click 5; sleep 0.08; done
sleep 1
snap 1-form.png

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
snap 2-filled.png

echo '[run] clicking turnstile'
move_mouse_human 453 583
xdotool click 1
sleep 4
snap 3-turnstile.png

echo '[run] submitting'
move_mouse_human 632 665
xdotool click 1
sleep 10
snap 4-final.png

TITLE=$(xdotool getwindowname "$WIN")
echo "[run] title: $TITLE"
if [[ "$TITLE" != *'Mon espace candidat'* ]]; then
  # Best-effort classification from the signals already on hand (resolution
  # flag, window title) -- narrows down "LOGIN FAILED" to a known failure
  # family instead of leaving every occurrence equally mysterious.
  if [[ "$RES_MISMATCH" == 1 ]]; then
    REASON='resolution_mismatch (see WARNING above -- coordinates were off target from the start)'
  elif [[ "$TITLE" == *'Connexion'* ]]; then
    REASON='still_on_login_page (cookie banner or turnstile click likely missed, or credentials rejected)'
  elif [[ "$TITLE" == *'FranceConnect'* || "$TITLE" == *'idp.msa.fr'* ]]; then
    REASON='wrong_provider_redirect (clicked FranceConnect instead of the email/password form)'
  else
    REASON='unknown'
  fi
  echo "[run] LOGIN FAILED -- reason: $REASON"
  exit 1
fi
echo '[run] LOGIN SUCCESS'

# TEMPORARY diagnostic: preserve the raw Cookies SQLite db so we can inspect
# its actual schema/host_key/name values for the SQLite-decrypt rewrite.
# Remove this block once that's done.
find /tmp/chromium-profile -name Cookies -exec cp {} /output/Cookies-diagnostic \; || true
echo "[run] diagnostic Cookies db copied: $(ls -la /output/Cookies-diagnostic 2>&1)"

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
# Was `sleep 6`, bumped after three straight failures one evening (all with
# an empty Network panel in the diagnostics -- "Currently recording network
# activity", meaning the reload hadn't produced a single request yet) right
# after two clean runs earlier the same afternoon with the same code. Same
# site, same script, same day -- the site itself was just slower to respond
# that evening, not a coordinates issue.
sleep 15
# Filter to "Doc" requests only first: by the time we get here there can be
# dozens of requests loaded (fonts, scripts, images...), so a fixed pixel
# position for "the top row" isn't reliable -- it hit a font file's row in
# one CI run. Filtering down to the one document request first makes its
# row position deterministic regardless of how much else has loaded.
xdotool mousemove 853 261; xdotool click 1; sleep 1
xdotool mousemove 830 392; xdotool click 1
sleep 2
snap 5-network.png
xdotool mousemove 1100 650
for i in 1 2 3 4 5 6 7 8 9 10 11; do xdotool click 5; sleep 0.1; done
sleep 0.5
snap 6-headers-scrolled.png
xdotool mousemove 1100 700
xdotool click --repeat 3 --delay 80 1
sleep 0.5
xdotool key --clearmodifiers ctrl+c
sleep 0.3
xclip -selection clipboard -o > /output/cookie.txt
wc -c /output/cookie.txt

# Deliberately not making our own test request to the real API here: it
# would hit the exact same department (078, first in DEPARTEMENTS) that the
# worker's own first request hits moments later, and one CI run saw that
# second identical request get rejected as a session error -- two requests
# for the same thing, seconds apart, from the same IP, is itself a pattern
# Cloudflare's bot-management may score independently of cookie validity.
# A byte-count check is enough to confirm devtools actually copied something.
COOKIE_LEN=$(wc -c < /output/cookie.txt)
echo "[run] cookie length: $COOKIE_LEN"
if [[ "$COOKIE_LEN" -lt 20 ]]; then
  echo '[run] cookie.txt looks empty or truncated'
  exit 1
fi

echo '[run] DONE'
