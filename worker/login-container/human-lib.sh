#!/bin/bash

# Sleeps FLOOR seconds unconditionally, then polls scrot screenshots at a
# randomized ~0.4-0.9s cadence until REQUIRED_MATCHES consecutive captures
# are all byte-identical -- rendering has visually settled -- or TIMEOUT
# seconds total have elapsed.
#
# The floor is required, not just a nicety: a page can sit pixel-identical
# for a second or more right after a click while a network request it
# triggered is still in flight, before anything visibly starts loading
# (confirmed on a 2026-08-26 test run - a bare stability poll with no floor
# called a login submit "stable" after 1s while still showing the
# pre-submit login page, because nothing had started rendering yet).
#
# Two consecutive matching captures isn't enough of a signal either: a
# later 2026-08-26 run showed "stable" declared after two identical frames
# while Chromium's own tab spinner and stop-icon were still visibly showing
# the page as loading in that same screenshot - a fixed 0.5s sample
# interval can alias with a periodic loading-spinner animation and see the
# same phase twice by coincidence. Requiring three consecutive matches at a
# *randomized* interval (breaks any fixed-period alignment) makes that
# coincidence require two lucky rolls in a row instead of one.
#
# There's no CDP attached to this Chromium (see check-slots.yml for why: a
# CDP/software-rendering signature is exactly what Turnstile can
# fingerprint), so a real browser 'load' event isn't available here - this
# floor+poll is the closest CDP-free proxy. Always returns 0 - under this
# script's `set -e`, timing out and proceeding anyway needs to not abort
# the run, same fallback behavior the fixed sleeps this replaces already
# had. Run unattended on a schedule, so erring toward a longer wait over a
# premature click is the right tradeoff - only the timeout, not correctness,
# depends on picking a "big enough" number.
wait_for_page_stable() {
  local label="$1"
  local floor="${2:-3}"
  local timeout="${3:-15}"
  local required_matches=3
  sleep "$floor"
  local tmp=/tmp/stable-check.png
  local prev="" cur streak=0
  local budget_ms=$(( (timeout - floor) * 1000 ))
  local elapsed_ms=0
  while (( elapsed_ms < budget_ms )); do
    scrot "$tmp" 2>/dev/null || true
    cur=$(md5sum "$tmp" 2>/dev/null | cut -d' ' -f1)
    if [[ -n "$cur" && "$cur" == "$prev" ]]; then
      streak=$((streak+1))
      if (( streak >= required_matches - 1 )); then
        echo "[run] $label: page stable after floor+${elapsed_ms}ms (~$(( (floor*1000+elapsed_ms)/1000 ))s total)"
        rm -f "$tmp"
        return 0
      fi
    else
      streak=0
    fi
    prev="$cur"
    local interval_ms=$(( 400 + RANDOM % 500 ))
    sleep "0.$(printf '%03d' "$interval_ms")"
    elapsed_ms=$((elapsed_ms + interval_ms))
  done
  echo "[run] $label: page never stabilized within ${timeout}s total, proceeding anyway"
  rm -f "$tmp"
  return 0
}

declare -A ADJ=(
  [a]=q [b]=v [c]=x [d]=s [e]=z [f]=d [g]=f [h]=g [i]=u [j]=h [k]=j [l]=k [m]=l
  [n]=b [o]=i [p]=o [q]=s [r]=e [s]=d [t]=r [u]=y [v]=c [w]=x [x]=c [y]=t [z]=e
)

# Moves the mouse toward (tx,ty) via a randomized start point and a random
# number of jittered intermediate waypoints -- a different path every call.
move_mouse_human() {
  local tx="$1" ty="$2"
  local steps=$(( 2 + RANDOM % 2 ))
  local start_x=$(( tx + (RANDOM % 160) - 80 ))
  local start_y=$(( ty + (RANDOM % 120) - 60 ))
  (( start_x < 40 )) && start_x=40
  (( start_x > 1220 )) && start_x=1220
  (( start_y < 40 )) && start_y=40
  (( start_y > 860 )) && start_y=860
  xdotool mousemove "$start_x" "$start_y"
  sleep "0.$(printf '%03d' $(( 150 + RANDOM % 200 )))"
  local i=1 den=$((steps+1))
  while (( i <= steps )); do
    local ix=$(( start_x + (tx - start_x) * i / den + (RANDOM % 24 - 12) ))
    local iy=$(( start_y + (ty - start_y) * i / den + (RANDOM % 24 - 12) ))
    xdotool mousemove "$ix" "$iy"
    sleep "0.$(printf '%03d' $(( 120 + RANDOM % 260 )))"
    i=$((i+1))
  done
  xdotool mousemove "$tx" "$ty"
  sleep "0.$(printf '%03d' $(( 250 + RANDOM % 300 )))"
}

# Types one character at a time with asymmetric, human-ish pacing: mostly
# quick, but every so often a longer pause as if thinking about the next key.
type_chars() {
  local str="$1"
  local len=${#str}
  local i=0
  while (( i < len )); do
    xdotool type -- "${str:i:1}"
    local base=$(( 60 + RANDOM % 110 ))
    if (( RANDOM % 6 == 0 )); then
      base=$(( 350 + RANDOM % 550 ))
    elif (( RANDOM % 5 == 0 )); then
      base=$(( 180 + RANDOM % 150 ))
    fi
    local sec=$(( base / 1000 )); local ms=$(( base % 1000 ))
    sleep "${sec}.$(printf '%03d' $ms)"
    i=$((i+1))
  done
}

# Types a string with one deliberate typo at a randomized position, using an
# AZERTY-adjacent key (not a random character), then backspaces and corrects
# it -- mimics a human fat-fingering a nearby key rather than a random error.
type_human() {
  local str="$1"
  local len=${#str}
  local center=$(( RANDOM % len ))
  local typo_idx=-1
  local offset=0
  while (( offset <= len )); do
    for idx in $((center+offset)) $((center-offset)); do
      if (( idx >= 0 && idx < len )); then
        local ch="${str:idx:1}"
        local lower
        lower=$(printf '%s' "$ch" | tr 'A-Z' 'a-z')
        if [[ -n "${ADJ[$lower]:-}" ]]; then
          typo_idx=$idx
          break 2
        fi
      fi
    done
    offset=$((offset+1))
  done

  if (( typo_idx >= 0 )); then
    local correct_ch="${str:typo_idx:1}"
    local lower wrong_ch
    lower=$(printf '%s' "$correct_ch" | tr 'A-Z' 'a-z')
    wrong_ch="${ADJ[$lower]}"
    if [[ "$correct_ch" =~ [A-Z] ]]; then
      wrong_ch=$(printf '%s' "$wrong_ch" | tr 'a-z' 'A-Z')
    fi
    local before="${str:0:typo_idx}"
    local after="${str:typo_idx+1}"
    type_chars "${before}${wrong_ch}"
    sleep 0.6
    xdotool key --clearmodifiers BackSpace
    sleep 0.45
    type_chars "${correct_ch}${after}"
  else
    type_chars "$str"
  fi
}
