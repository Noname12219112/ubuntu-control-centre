
# Ubuntu Control Centre

A unified, Ubuntu-styled audio and media control centre for GNOME Shell.

## Features

- Media playback controls
- Audio output and input switching
- Microphone controls
- Audio profile switching
- Per-application volume mixer
- Integrated GNOME Quick Settings interface

## Requirements

- Ubuntu with GNOME Shell 50
- PipeWire or PulseAudio

## Installation

```bash
git clone https://github.com/Noname12219112/ubuntu-control-centre.git
cd ubuntu-control-centre

EXT="$HOME/.local/share/gnome-shell/extensions/quick-sound-switcher@dustin-hawkins"

mkdir -p "$EXT"
git archive HEAD | tar -x -C "$EXT"
glib-compile-schemas "$EXT/schemas/"

gnome-extensions enable quick-sound-switcher@dustin-hawkins
```

Log out and back in if GNOME Shell needs to reload.

## Usage

Open GNOME Quick Settings from the top panel to access Ubuntu Control Centre and manage your audio devices, microphone, media and application volumes.

## Project Info

- **Version:** 2
- **Platform:** GNOME Shell 50
- **License:** GPL-3.0-or-later

---

**Ubuntu Control Centre — All your audio controls in one place.**

