#!/bin/bash
# qram-walkers on Linux: run this file (./qram-walkers.sh) to start the app.
# The page opens in your browser. Press Ctrl+C, or close the terminal, to stop the app.
# `uv run qramsim shortcut` in engine/ adds an entry to the applications menu.
cd "$(dirname "$0")/engine" || exit 1
uv run qramsim app || read -r -p "qram-walkers did not start: see the message above and INSTALL.md. Press Return to close."
