const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100';
const GEMINI_TIMEOUT_MS = 5000;

// Listing models spends no generation quota, yet Google applies the same key and region checks.
async function checkGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: 'ключ не задан' };

  try {
    const response = await fetch(MODELS_URL, {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    const body = await response.json();
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${body.error?.status ?? ''}: ${body.error?.message ?? ''}` };
    }
    const flashModels = (body.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => model.name.replace('models/', ''))
      .filter((name) => /flash/i.test(name));
    return { ok: true, flashModels };
  } catch (error) {
    return { ok: false, error: error.name };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    node: process.version,
    region: process.env.VERCEL_REGION ?? 'local',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    gemini: await checkGemini(),
  });
}
