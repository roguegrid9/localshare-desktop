#!/bin/bash

# Simple test script to verify the coordinator API is working
# This tests the same endpoints our Rust client will use

echo "Testing RogueGrid9 Coordinator API..."
echo "======================================"

# Test 1: Health Check
echo "1. Testing health check..."
curl -s https://roguegrid9-coordinator.fly.dev/health | jq .
echo ""

# Test 2: Token Issuance (using our bootstrap credentials)
echo "2. Testing token issuance..."
API_KEY="k_rg9_prod_yAFbN0-EGLm0uSNrEhAfG8CrBFQCBHpz"
API_SECRET="s_rg9_prod_4cZKXFNNsrLEaNnTWuDK9VF_AXY-YX3n"

TOKEN_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -u "$API_KEY:$API_SECRET" \
  -d '{
    "user_handle": "test_rust_client_'$(date +%s)'",
    "display_name": "Test Rust Client"
  }' \
  https://roguegrid9-coordinator.fly.dev/sdk/v1/tokens/issue)

echo $TOKEN_RESPONSE | jq .
echo ""

# Extract token for next test
TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.token')

if [ "$TOKEN" != "null" ] && [ "$TOKEN" != "" ]; then
    echo "3. Testing account promotion with acquired token..."
    curl -s -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{
        "supabase_access_token": "fake_supabase_token_for_testing"
      }' \
      https://roguegrid9-coordinator.fly.dev/api/v1/auth/promote | jq .
else
    echo "3. Skipping promotion test - no token acquired"
fi

echo ""
echo "API test complete!"
