#!/bin/zsh
# Builds public/music.mp3: compose (scripts/music.mjs), then glue it with gentle compression,
# a touch of high-shelf air, and loudness set to sit quietly under voices.
set -e
cd "$(dirname "$0")/.."
LENGTH=${1:-116}
node scripts/music.mjs "$LENGTH" out/music-raw.wav
ffmpeg -y -loglevel error -i out/music-raw.wav \
  -af "highpass=f=35,lowpass=f=13000,acompressor=threshold=0.12:ratio=2.5:attack=15:release=180:makeup=1.5,loudnorm=I=-22:TP=-2:LRA=8,alimiter=limit=0.89" \
  -ar 44100 -c:a libmp3lame -b:a 192k public/music.mp3
echo public/music.mp3
