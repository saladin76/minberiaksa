#!/usr/bin/env bash
# Provision only missing Chromium shared libraries in a disposable QA prefix.
# This deliberately uses apt-get download + dpkg-deb -x (never apt install).
# Nothing is written to /usr, /etc, production node_modules or the database.
set -Eeuo pipefail
die(){ printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
test "$#" -eq 3 || die "Usage: qa-playwright-isolated-libs.sh <browser> <prefix> <cache>"
browser="$1"
prefix="$2"
cache="$3"
case "$prefix" in /root/minber-media-recovery/translation-seo-browser-qa/*) ;; *) die "Library prefix must be in the QA root" ;; esac
case "$cache" in /root/minber-media-recovery/translation-seo-browser-qa/*) ;; *) die "Download cache must be in the QA root" ;; esac
test -f "$browser" || die "Chromium headless shell not found"
test "$(uname -m)" = x86_64 || die "Unsupported architecture for this QA tool"
test -x "$(command -v apt-get)" && test -x "$(command -v dpkg-deb)" || die "Missing apt-get or dpkg-deb"
mkdir -p "$prefix" "$cache"
dirs="$prefix/usr/lib/x86_64-linux-gnu:$prefix/lib/x86_64-linux-gnu:$prefix/usr/lib"
already=""
for iteration in 1 2 3 4 5 6 7 8; do
  missing="$( (LD_LIBRARY_PATH="$dirs" ldd "$browser" 2>&1 || true) | awk '$2 == "=>" && $3 == "not" && $4 == "found" { print $1 }' | sort -u )"
  if [ -z "$missing" ]; then
    printf 'PASS chromium-shared-libraries\nQA_LIBRARY_PATH=%s\n' "$dirs"
    exit 0
  fi
  printf 'MISSING_LIBRARIES_ITERATION_%s:\n%s\n' "$iteration" "$missing"
  packages=""
  for soname in $missing; do
    package=""
    case "$soname" in
      libatk-1.0.so.0) package=libatk1.0-0t64 ;;
      libatk-bridge-2.0.so.0) package=libatk-bridge2.0-0t64 ;;
      libatspi.so.0) package=libatspi2.0-0t64 ;;
      libcups.so.2) package=libcups2t64 ;;
      libXcomposite.so.1) package=libxcomposite1 ;;
      libXdamage.so.1) package=libxdamage1 ;;
      libXfixes.so.3) package=libxfixes3 ;;
      libXrandr.so.2) package=libxrandr2 ;;
      libXrender.so.1) package=libxrender1 ;;
      libX11.so.6) package=libx11-6 ;;
      libX11-xcb.so.1) package=libx11-xcb1 ;;
      libXext.so.6) package=libxext6 ;;
      libXau.so.6) package=libxau6 ;;
      libXdmcp.so.6) package=libxdmcp6 ;;
      libxcb.so.1) package=libxcb1 ;;
      libxcb-render.so.0) package=libxcb-render0 ;;
      libxcb-shm.so.0) package=libxcb-shm0 ;;
      libxkbcommon.so.0) package=libxkbcommon0 ;;
      libgbm.so.1) package=libgbm1 ;;
      libdrm.so.2) package=libdrm2 ;;
      libwayland-client.so.0) package=libwayland-client0 ;;
      libwayland-server.so.0) package=libwayland-server0 ;;
      libasound.so.2) package=libasound2t64 ;;
      libnss3.so|libsmime3.so|libnssutil3.so) package=libnss3 ;;
      libnspr4.so|libplc4.so|libplds4.so) package=libnspr4 ;;
      libpango-1.0.so.0) package=libpango-1.0-0 ;;
      libpangocairo-1.0.so.0) package=libpangocairo-1.0-0 ;;
      libpangoft2-1.0.so.0) package=libpangoft2-1.0-0 ;;
      libcairo.so.2) package=libcairo2 ;;
      libcairo-gobject.so.2) package=libcairo-gobject2 ;;
      libharfbuzz.so.0) package=libharfbuzz0b ;;
      libfribidi.so.0) package=libfribidi0 ;;
      libthai.so.0) package=libthai0 ;;
      libdatrie.so.1) package=libdatrie1 ;;
      libgraphite2.so.3) package=libgraphite2-3 ;;
      libfontconfig.so.1) package=libfontconfig1 ;;
      libfreetype.so.6) package=libfreetype6 ;;
      libpng16.so.16) package=libpng16-16t64 ;;
      libpixman-1.so.0) package=libpixman-1-0 ;;
      libglib-2.0.so.0|libgobject-2.0.so.0|libgio-2.0.so.0|libgmodule-2.0.so.0|libgthread-2.0.so.0) package=libglib2.0-0t64 ;;
      libdbus-1.so.3) package=libdbus-1-3 ;;
      libexpat.so.1) package=libexpat1 ;;
      libffi.so.8) package=libffi8 ;;
      libselinux.so.1) package=libselinux1 ;;
      libmount.so.1) package=libmount1 ;;
      libpcre2-8.so.0) package=libpcre2-8-0 ;;
      libbrotlicommon.so.1|libbrotlidec.so.1) package=libbrotli1 ;;
      libzstd.so.1) package=libzstd1 ;;
      libudev.so.1) package=libudev1 ;;
      libsystemd.so.0) package=libsystemd0 ;;
      libgtk-3.so.0|libgdk-3.so.0) package=libgtk-3-0t64 ;;
      libepoxy.so.0) package=libepoxy0 ;;
      libXi.so.6) package=libxi6 ;;
      libXcursor.so.1) package=libxcursor1 ;;
      libXinerama.so.1) package=libxinerama1 ;;
      libXss.so.1) package=libxss1 ;;
      libxshmfence.so.1) package=libxshmfence1 ;;
    esac
    test -n "$package" || die "No reviewed Ubuntu 24.04 package mapping for $soname; do not install system dependencies"
    case " $packages " in *" $package "*) ;; *) packages="$packages $package" ;; esac
  done
  for package in $packages; do
    case " $already " in *" $package "*) die "Library still missing after extracting $package; inspect ldd and report" ;; esac
    printf 'QA download (no install): %s\n' "$package"
    (cd "$cache" && apt-get download "$package") || die "Download failed for $package; apt sources may need inspection"
    deb=""
    for candidate in "$cache/$package"_*.deb; do
      if [ -f "$candidate" ]; then deb="$candidate"; break; fi
    done
    test -n "$deb" || die "Package downloaded but .deb missing for $package"
    dpkg-deb -x "$deb" "$prefix" || die "Extraction failed for $package"
    already="$already $package"
  done
done
die "Chromium dependencies did not converge in 8 passes; no system packages installed"
