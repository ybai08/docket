#!/bin/zsh
# Builds public/music.mp3: compose (scripts/music.mjs), add a little room, keep it quiet under voices.
set -e
cd "$(dirname "$0")/.."
SECONDS_LONG=${1:-124}
node scripts/music.mjs "$SECONDS_LONG" out/music-raw.wav
ffmpeg -y -loglevel error -i out/music-raw.wav \
  -af "aecho=0.8:0.6:90|170:0.22|0.12,lowpass=f=7500,highpass=f=40,loudnorm=I=-24:TP=-3:LRA=9" \
  -ar 44100 -c:a libmp3lame -b:a 192k public/music.mp3
echo public/music.mp3
