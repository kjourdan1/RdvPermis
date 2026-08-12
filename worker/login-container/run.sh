#!/bin/bash
set -euo pipefail
export DISPLAY=:0
mkdir -p /output
chmod 777 /output || true

# Recorded as early as possible, before the login flow even starts - a
# real run showed the verification-code email can arrive within ~10s of
# form submission, well before the later wait-for-code step actually
# runs (which happens several script-minutes into the run). Recording
# the watermark here instead guarantees it predates any email this run
# could possibly trigger, no matter how fast the site-to-mailbox chain
# is.
echo '[run] recording verification-code mailbox watermark'
CODE_WATERMARK=$(python3 /opt/read_verification_code.py --get-watermark)

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
mkdir -p /tmp/chromium-profile/Default
cat > /tmp/chromium-profile/Default/Bookmarks << 'BOOKMARKS_EOF'
{
  "checksum": "",
  "roots": {
    "bookmark_bar": {
      "children": [
        {
          "date_added": "13350000000000000",
          "date_last_used": "0",
          "guid": "00000000-0000-4000-a000-000000000001",
          "id": "1",
          "name": "fetch",
          "type": "url",
          "url": "javascript:document.title='JSOK123'"
        }
      ],
      "date_added": "13350000000000000",
      "date_modified": "13350000000000000",
      "id": "0",
      "name": "Bookmarks bar",
      "type": "folder"
    },
    "other": {"children": [], "date_added": "13350000000000000", "date_modified": "0", "id": "2", "name": "Other bookmarks", "type": "folder"},
    "synced": {"children": [], "date_added": "13350000000000000", "date_modified": "0", "id": "3", "name": "Mobile bookmarks", "type": "folder"}
  },
  "version": 1
}
BOOKMARKS_EOF
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
echo "[run] chromium window geometry: $(xdotool getwindowgeometry "$WIN" 2>&1 | tr '\n' ' ')"

# Every scrot call goes through here instead of being called directly, so the
# CI log has a title + resolution breadcrumb next to each screenshot -- lets
# you tell from the log alone (no artifact download) whether a given step
# actually landed on the page it thinks it did.
snap() {
  local title geom
  title=$(xdotool getwindowname "$WIN" 2>/dev/null || echo '?')
  geom=$(xdotool getwindowgeometry --shell "$WIN" 2>/dev/null | tr '\n' ' ')
  echo "[run] snapshot $1 -- title: \"$title\" -- resolution: $(xdpyinfo | awk '/dimensions:/{print $2}') -- window: $geom"
  scrot "/output/$1"
}

# The window can exist before the page has actually rendered (confirmed on
# the CI runner: the first screenshot came back blank white), and clicking
# too early lands on whatever partial content happened to render first --
# in one run, that was the FranceConnect button instead of the cookie
# banner, sending the whole flow down the wrong provider's login page.
# There's no CDP here to wait for a real "page loaded" event, so a generous
# fixed margin is the pragmatic fix. Margins throughout this login flow were
# widened again after a run of consecutive failures all landing on the
# "Mot de passe oublié" page right around the password-fill step - this Pi
# was under sustained load from repeated docker build/run cycles at the
# time, and a slow-to-render page + a click that assumes it already has is
# exactly the failure mode that made the old DevTools extraction flaky too.
# Trading a few more seconds per run for not racing page renders under load.
sleep 10
xdotool windowfocus "$WIN"
xdotool windowraise "$WIN"
sleep 1
snap 0-initial.png

echo '[run] accepting cookies'
move_mouse_human 569 $((665+OFF))
xdotool click 1
sleep 5
snap 0b-after-cookies.png

echo '[run] scrolling to form'
xdotool mousemove 500 $((500+OFF))
for i in 1 2 3 4 5 6; do xdotool click 5; sleep 0.08; done
sleep 3
snap 1-form.png

# Coordinates below (email through submit) were recalibrated on 2026-08-12
# after 5 consecutive runs misclicked "Mot de passe oublié ?" instead of the
# password field: pixel-sampled a real failing run's screenshot and found
# every one of these targets landing on flat page background (246,246,246)
# rather than on the actual input/button fills - all four were consistently
# ~55-60px too low, not just the password one. Corrected against the same
# screenshot's real element positions.
echo '[run] filling email'
move_mouse_human 495 $((176+OFF))
xdotool click 1
sleep 2
type_human "$EMAIL"
sleep 2

echo '[run] filling password'
move_mouse_human 500 $((269+OFF))
xdotool click 1
sleep 2
type_human "$PASSWORD"
sleep 3
snap 2-filled.png

echo '[run] clicking turnstile'
move_mouse_human 453 522
xdotool click 1
sleep 6
snap 3-turnstile.png

echo '[run] submitting'
move_mouse_human 632 605
xdotool click 1
sleep 10
snap 4-final.png

# The site now requires a 6-digit email verification code on every login
# (permanent 2FA rollout, confirmed 2026-08-12) - this step is always
# present, not conditional, so no page-detection branching is needed,
# consistent with the rest of this script's fixed-wait/fixed-coordinate
# style. If something upstream already failed and this page never
# actually appeared, read_verification_code.py just times out waiting
# for an email that never gets triggered, and the title check below
# still correctly reports the real failure.
echo '[run] waiting for verification code email'
CODE=$(python3 /opt/read_verification_code.py "--since-uid=$CODE_WATERMARK")
echo '[run] entering verification code'
move_mouse_human 632 600
xdotool click 1
sleep 1
type_human "$CODE"
sleep 1
snap 5-code-entered.png
move_mouse_human 687 702
xdotool click 1
sleep 5
snap 6-code-submitted.png

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

echo '[run] DIAGNOSTIC: toggling bookmarks bar and testing bookmarklet click'
xdotool key --clearmodifiers ctrl+shift+b
sleep 1
snap diag-bookmarks-bar.png
xdotool mousemove 70 145
xdotool click 1
sleep 1
echo "[run] DIAGNOSTIC title after bookmarklet click attempt: $(xdotool getwindowname "$WIN")"
snap diag-after-click.png

# Dismiss the "Save password?" prompt if Chromium shows one.
move_mouse_human 1013 375
xdotool click 1
sleep 1

# Extract the session cookie by reading Chromium's on-disk SQLite db
# directly instead of driving DevTools - see
# docs/superpowers/specs/2026-08-12-cookie-extraction-sqlite.md for why
# the DevTools approach (F12 + blind pixel-coordinate clicks through the
# Network tab) was replaced: it broke whenever DevTools didn't land
# exactly where expected, made worse by CPU contention on this shared
# Pi. This is a passive file read - no automation protocol ever
# attaches to the live Chromium process, same reasoning as why login
# itself stays GUI-driven instead of CDP-based.
echo '[run] extracting cookie via sqlite'
python3 /opt/extract_cookie.py /tmp/chromium-profile/Default/Cookies /output/cookie.txt
COOKIE_LEN=$(wc -c < /output/cookie.txt)
echo "[run] cookie length: $COOKIE_LEN"

echo '[run] DONE'
