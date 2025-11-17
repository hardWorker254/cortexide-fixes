#!/usr/bin/env bash
set -euo pipefail

echo "[CortexIDE] Linux: installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

echo "[CortexIDE] Starting Ollama service..."
(ollama serve >/dev/null 2>&1 &) || true
sleep 2

echo "[CortexIDE] Health check..."
if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "[CortexIDE] Ollama is running."
else
  echo "[CortexIDE] Ollama API not reachable yet."
fi

echo "[CortexIDE] Done."

