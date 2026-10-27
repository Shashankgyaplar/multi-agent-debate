const axios = require('axios');

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

async function tryGenerate(baseUrl, modelName, prompt, systemPrompt, maxTokens, timeoutMs) {
  try {
    const response = await axios.post(
      `${baseUrl}/api/generate`,
      {
        model: modelName,
        prompt: prompt,
        system: systemPrompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: maxTokens
        }
      },
      { timeout: timeoutMs }
    );
    return response.data.response;
  } catch (err) {
    if (err.response && err.response.status === 404 && !modelName.includes(':')) {
      const response = await axios.post(
        `${baseUrl}/api/generate`,
        {
          model: `${modelName}:latest`,
          prompt: prompt,
          system: systemPrompt,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: maxTokens
          }
        },
        { timeout: timeoutMs }
      );
      return response.data.response;
    }
    throw err;
  }
}

async function callModel(model, prompt, systemPrompt = '', maxTokens = 500, ip = null, port = null, timeoutMs = 60000) {
  const isRemote = ip && ip !== '127.0.0.1' && ip !== 'localhost';
  const effectiveTimeout = isRemote ? 60000 : timeoutMs;
  const baseUrl = (ip && port) ? `http://${ip}:${port}` : DEFAULT_OLLAMA_URL;

  try {
    return await tryGenerate(baseUrl, model, prompt, systemPrompt, maxTokens, effectiveTimeout);
  } catch (err) {
    // If a remote IP was specified and failed, attempt localhost fallback
    if (isRemote) {
      console.warn(`[OLLAMA] Remote node ${baseUrl} unreachable (${err.message}). Falling back to local Ollama...`);
      try {
        return await tryGenerate(DEFAULT_OLLAMA_URL, model, prompt, systemPrompt, maxTokens, timeoutMs);
      } catch (fallbackErr) {
        throw new Error(`Failed on ${baseUrl} (${err.message}) and local fallback (${fallbackErr.message})`);
      }
    }
    throw err;
  }
}

module.exports = { callModel };