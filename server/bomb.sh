#!/usr/bin/env bash

URL="http://localhost:5001/api/auth/login"
PAYLOAD='{"email":"Password123@mail.com", "password":"Password123@mail.com"}'

# 102 requests in parallel
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
       -X POST "$URL" \
       -H 'Content-Type: application/json' \
       --data "$PAYLOAD" &
done
wait
