#!/bin/bash

# Example: Using API Keys for Programmatic Chat Access
# This script demonstrates how to use user-governed API keys to interact with the chat API

# Set your API key (get this from your user profile)
API_KEY="bcb_live_YOUR_API_KEY_HERE"

# Set your instance URL
INSTANCE_URL="http://localhost:3000"

# Generate a unique thread ID (or use an existing one)
THREAD_ID=$(uuidgen)
MESSAGE_ID=$(uuidgen)

echo "Making chat API request..."
echo "Thread ID: $THREAD_ID"
echo "Message ID: $MESSAGE_ID"
echo ""

# Make the API request
curl -X POST "$INSTANCE_URL/api/chat" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d @- << EOF
{
  "id": "$THREAD_ID",
  "message": {
    "id": "$MESSAGE_ID",
    "role": "user",
    "parts": [
      {
        "type": "text",
        "text": "Hello! Can you help me with a quick calculation? What is 15 * 37?"
      }
    ]
  },
  "chatModel": {
    "provider": "openai",
    "model": "gpt-4"
  },
  "toolChoice": "auto"
}
EOF

echo ""
echo "Request completed!"
echo ""
echo "Tips:"
echo "  - Replace API_KEY with your actual key from the user profile"
echo "  - Replace INSTANCE_URL with your deployment URL"
echo "  - Check the response for streaming chat completions"
echo "  - Monitor your API key usage in the user profile"
