#!/bin/bash

echo "Testing Chat API with API Key Authentication"
echo "=============================================="
echo ""

# Test with valid API key
echo "Test 1: Valid API Key (MOCHA1233)"
echo "-----------------------------------"
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MOCHA1233" \
  -d '{
    "id": "test-thread-mocha-123",
    "message": {
      "id": "msg-mocha-123",
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "Hello, testing API key authentication"
        }
      ]
    },
    "chatModel": {
      "provider": "openai",
      "model": "gpt-4"
    },
    "toolChoice": "auto",
    "mentions": [],
    "attachments": []
  }'

echo ""
echo ""
echo "Test 2: Invalid API Key"
echo "------------------------"
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong-key" \
  -d '{
    "id": "test-thread-invalid",
    "message": {
      "id": "msg-invalid",
      "role": "user",
      "parts": [{"type": "text", "text": "Test"}]
    },
    "chatModel": {"provider": "openai", "model": "gpt-4"},
    "toolChoice": "auto",
    "mentions": [],
    "attachments": []
  }'

echo ""
echo ""
echo "Test 3: No API Key (should redirect to /sign-in)"
echo "--------------------------------------------------"
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-thread-no-key",
    "message": {
      "id": "msg-no-key",
      "role": "user",
      "parts": [{"type": "text", "text": "Test"}]
    },
    "chatModel": {"provider": "openai", "model": "gpt-4"},
    "toolChoice": "auto",
    "mentions": [],
    "attachments": []
  }'

echo ""
