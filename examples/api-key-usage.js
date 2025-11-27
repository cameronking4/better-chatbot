/**
 * Example: Using API Keys for Programmatic Chat Access
 * This example demonstrates how to use user-governed API keys to interact with the chat API
 */

const API_KEY = process.env.BETTER_CHATBOT_API_KEY || 'bcb_live_YOUR_API_KEY_HERE';
const INSTANCE_URL = process.env.INSTANCE_URL || 'http://localhost:3000';

// Generate unique IDs
const threadId = crypto.randomUUID();
const messageId = crypto.randomUUID();

async function sendChatMessage(message) {
  const response = await fetch(`${INSTANCE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: threadId,
      message: {
        id: messageId,
        role: 'user',
        parts: [
          {
            type: 'text',
            text: message,
          },
        ],
      },
      chatModel: {
        provider: 'openai',
        model: 'gpt-4',
      },
      toolChoice: 'auto',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  // The response is a streaming response
  // You can process it chunk by chunk
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  console.log('Chat response:');
  console.log('─'.repeat(50));

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    process.stdout.write(chunk);
  }

  console.log('\n' + '─'.repeat(50));
}

// Main execution
(async () => {
  try {
    console.log('Better Chatbot API Key Example');
    console.log('─'.repeat(50));
    console.log(`Thread ID: ${threadId}`);
    console.log(`Message ID: ${messageId}`);
    console.log('─'.repeat(50));
    console.log('');

    await sendChatMessage('Hello! Can you help me with a quick calculation? What is 15 * 37?');

    console.log('');
    console.log('Success! Check your user profile to see the API key usage.');
  } catch (error) {
    console.error('Error:', error.message);
    console.error('');
    console.error('Tips:');
    console.error('  - Set BETTER_CHATBOT_API_KEY environment variable with your key');
    console.error('  - Set INSTANCE_URL if not using localhost:3000');
    console.error('  - Get your API key from the user profile page');
    process.exit(1);
  }
})();
