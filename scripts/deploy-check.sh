#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
	printf "Usage: %s <base-url> [session-id]\n" "$0"
	printf "Example: %s https://your-service.up.railway.app deploy-smoke\n" "$0"
	exit 1
fi

BASE_URL="${1%/}"
SESSION_ID="${2:-deploy-smoke}"

printf "Checking health at %s/health\n" "$BASE_URL"
curl -fsS "$BASE_URL/health"
printf "\n"

printf "Checking chat at %s/chat\n" "$BASE_URL"
curl -fsS -X POST "$BASE_URL/chat" \
	-H "Content-Type: application/json" \
	-d "{\"message\":\"hi\",\"sessionId\":\"$SESSION_ID\"}"
printf "\n"

printf "Deploy checks passed.\n"
