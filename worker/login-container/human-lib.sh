#!/bin/bash
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
