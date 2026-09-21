#!/usr/bin/env bash
# ПОСЛЕДНЯЯ БАШНЯ — запуск на Linux/macOS (аналог start.bat)
#   ./start.sh          собрать и открыть игру
#   ./start.sh test     headless-тест
#   ./start.sh balance  симуляция баланса
#   ./start.sh shots    перегенерировать скриншоты
set -e
cd "$(dirname "$0")"

case "${1:-play}" in
  test)    node tests/headless.js ;;
  balance) node tests/balance.js ;;
  probe)   node tests/probe.js ;;
  seeds)   node tests/seeds.js "${2:-8}" ;;
  shots)
    node tests/snapshot.js mid
    node tests/snapshot.js rich
    python3 tests/rasterize.py mid rich
    ;;
  play|*)
    echo "[1/2] Сборка dist/index.html ..."
    node build.js
    echo "[2/2] Открываю игру ..."
    if command -v xdg-open >/dev/null 2>&1; then xdg-open dist/index.html
    elif command -v open >/dev/null 2>&1; then open dist/index.html
    else echo "Откройте dist/index.html в браузере вручную."; fi
    ;;
esac
