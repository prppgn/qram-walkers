#!/bin/bash
# qram-walkers on macOS: double-click this file in Finder to start the app.
# The page opens in your browser. Close this window, or press Ctrl+C in it, to stop the app.
cd "$(dirname "$0")/engine" || exit 1
uv run qramsim app || read -r -p "qram-walkers did not start: see the message above and INSTALL.md. Press Return to close."
