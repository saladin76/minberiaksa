#!/usr/bin/env bash
# Native voice messages require local OGG/Opus encoding. Run before the build swap.
set -euo pipefail
voice_encoder_ready() {
  command -v ffmpeg >/dev/null 2>&1 && ffmpeg -hide_banner -encoders 2>/dev/null | grep 'libopus' >/dev/null
}
if voice_encoder_ready; then exit 0; fi
if [[ "$(id -u)" != "0" ]] || ! command -v apt-get >/dev/null 2>&1; then
  echo "FFmpeg with libopus is required for inbox voice notes. Install it before deploying." >&2
  exit 1
fi
echo "Installing FFmpeg/Opus for inbox voice messages"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg
voice_encoder_ready
