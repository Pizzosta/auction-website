#!/usr/bin/env bash
URL="http://localhost:5001/api/auth/forgot-password"
PAYLOAD='{"email":"pizzostor@gmail.com"}'

# 102 requests in parallel
for i in {1..6}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
       -X POST "$URL" \
       -H 'Content-Type: application/json' \
       --data "$PAYLOAD" &
done
wait