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
# Disables Chromium's "Save password?" prompt outright. It pops up as soon
# as the login form is submitted (not just after 2FA) and stays on screen
# through the rest of this pixel-coordinate-driven flow - confirmed on
# 2026-08-26 test run 33007021667 sitting over the 2FA page and producing
# a LOGIN FAILED with no other explanation, after an earlier run
# (33005812567) showed the same dialog blocking the browser-fetch
# bookmarklet clicks further down. A single click-to-dismiss at any one
# point in the script is a losing game against a dialog that can appear
# at several different points - remove the feature instead of chasing it.
cat > /tmp/chromium-profile/Default/Preferences << 'PREFERENCES_EOF'
{
  "credentials_enable_service": false,
  "credentials_enable_autosignin": false,
  "profile": {"password_manager_enabled": false}
}
PREFERENCES_EOF
# Pre-seeds two bookmarks used later (after login+2FA) to fetch creneaux
# from within this authenticated session instead of relying solely on
# checkSlots.ts's separate curl request - see
# docs/superpowers/specs/2026-08-12-browser-fetch-creneaux-design.md and
# docs/superpowers/notes/2026-08-12-browser-fetch-diagnostic-findings.md
# for why this is two bookmarks (fetch, then a separate synchronous copy)
# rather than one - a single fetch-then-copy script left the clipboard
# empty because Chromium's user-activation window for execCommand('copy')
# does not survive the async delays between fetches.
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
          "url": "javascript:(function(){async function main(){const DEPARTEMENTS=['027','028','077','078'];const results=[];for(const departement of DEPARTEMENTS){try{const res=await fetch(`https://candidat.permisdeconduire.gouv.fr/api/v1/candidat/creneaux?code-departement=${departement}`,{credentials:'include',headers:{Accept:'application/json, text/plain, */*'}});const body=await res.text();results.push({departement,status:res.status,body});}catch(e){results.push({departement,status:0,body:String(e)});}await new Promise(function(resolve){setTimeout(resolve,1000+Math.random()*1000);});}localStorage.setItem('creneauxResult',JSON.stringify(results));document.title='FETCHDONE';}main();})();"
        },
        {
          "date_added": "13350000000000000",
          "date_last_used": "0",
          "guid": "00000000-0000-4000-a000-000000000002",
          "id": "2",
          "name": "copy",
          "type": "url",
          "url": "javascript:(function(){var json=localStorage.getItem('creneauxResult');if(!json){document.title='COPYEMPTY';return;}var ta=document.createElement('textarea');ta.value=json;document.body.appendChild(ta);ta.select();var ok=document.execCommand('copy');document.body.removeChild(ta);document.title=ok?'COPYOK':'COPYFAILED';})();"
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

# Dismiss the "Save password?" prompt here, before the browser-fetch step
# below, not after it as this used to do. Chromium can pop it up right
# after this navigation, and evidence from a 2026-08-26 failed run (see
# 5-browser-fetch.png diagnostic artifact for run 33005812567) shows it
# still on screen while the fetch/copy bookmarklet clicks were firing -
# title never reached FETCHDONE that run, consistent with the dialog
# swallowing the ctrl+shift+b bookmarks-bar shortcut or the clicks below.
move_mouse_human 1013 375
xdotool click 1
sleep 1

# Toggling the bookmarks bar here (not earlier) is deliberate - it shifts
# page content down, which would invalidate the already-calibrated pixel
# coordinates used by every step above this one (login form, Turnstile,
# submit, 2FA code entry) if done any earlier. Unlike every other step in
# this script, this one is NOT allowed to abort the run on failure: the
# existing cookie-extraction + curl path (right after this block,
# unchanged) is the fallback checkSlots.ts already knows how to use per
# departement if this produces nothing usable.
echo '[run] fetching creneaux from within the browser session'
xdotool key --clearmodifiers ctrl+shift+b
sleep 1
xdotool mousemove 85 95
xdotool click 1
for i in $(seq 1 40); do
  CURRENT_TITLE=$(xdotool getwindowname "$WIN" 2>/dev/null || echo '')
  [[ "$CURRENT_TITLE" == *"FETCHDONE"* ]] && break
  sleep 1
done
echo "[run] browser-fetch title after fetch click: $(xdotool getwindowname "$WIN")"
xdotool mousemove 150 95
xdotool click 1
# execCommand('copy') has to register the X11 CLIPBOARD selection before
# xclip below can read it - a flat `sleep 1` here (unlike the FETCHDONE
# poll above) let xclip run before that registration finished whenever the
# Pi was under load, producing xclip's "target STRING not available" and
# forcing every departement onto the curl fallback for that run. Budget
# matches the FETCHDONE poll (40s, not the original 10s): a 2026-08-26 test
# run (33006499760) still hit COPYOK only after this loop's old 10s bound
# had already given up and let xclip read an unset clipboard.
for i in $(seq 1 40); do
  CURRENT_TITLE=$(xdotool getwindowname "$WIN" 2>/dev/null || echo '')
  [[ "$CURRENT_TITLE" == *"COPYOK"* || "$CURRENT_TITLE" == *"COPYFAILED"* || "$CURRENT_TITLE" == *"COPYEMPTY"* ]] && break
  sleep 1
done
echo "[run] browser-fetch title after copy click: $(xdotool getwindowname "$WIN")"
snap 5-browser-fetch.png
set +e
xclip -selection clipboard -o > /output/creneaux.json 2>/tmp/xclip-err.log
XCLIP_EXIT=$?
set -e
if [[ "$XCLIP_EXIT" -eq 0 ]]; then
  CRENEAUX_LEN=$(wc -c < /output/creneaux.json)
  echo "[run] creneaux.json length: $CRENEAUX_LEN"
else
  echo '[run] browser-fetch clipboard read failed, checkSlots.ts will fall back to curl per departement'
  cat /tmp/xclip-err.log || true
  rm -f /output/creneaux.json
fi

# Extract the session cookie by reading Chromium's on-disk SQLite db
# directly instead of driving DevTools - see
# docs/superpowers/specs/2026-08-12-cookie-extraction-sqlite.md for why
# the DevTools approach (F12 + blind pixel-coordinate clicks through the
# Network tab) was replaced: it broke whenever DevTools didn't land
# exactly where expected, made worse by CPU contention on this shared
# Pi. This is a passive file read - no automation protocol ever
# attaches to the live Chromium process, same reasoning as why login
# itself stays GUI-driven instead of CDP-based.
#
# No longer fatal here (unlike when this was the only source of session
# data): the browser-fetch step above can independently supply everything
# checkSlots.ts needs, so a failure here - the openidc state cookie
# occasionally never appears in time, a known intermittent issue - no
# longer needs to abort the whole run. Whichever of the two actually
# produced usable data is what determines success now, decided
# downstream by the "Export cookie header" workflow step and
# checkSlots.ts's own per-departement fallback, not here.
echo '[run] extracting cookie via sqlite'
set +e
python3 /opt/extract_cookie.py /tmp/chromium-profile/Default/Cookies /output/cookie.txt
EXTRACT_EXIT=$?
set -e
if [[ "$EXTRACT_EXIT" -eq 0 ]]; then
  COOKIE_LEN=$(wc -c < /output/cookie.txt)
  echo "[run] cookie length: $COOKIE_LEN"
else
  echo '[run] cookie extraction failed, relying on browser-fetched data (if any) for this run'
fi

echo '[run] DONE'
