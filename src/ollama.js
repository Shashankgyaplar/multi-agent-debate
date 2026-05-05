const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

async function callModel(model, prompt, systemPrompt = '', maxTokens = 500) {
  const response = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    {
      model: model,
      prompt: prompt,
      system: systemPrompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: maxTokens
      }
    }
  );
  return response.data.response;
}

module.exports = { callModel };