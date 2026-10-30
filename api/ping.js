export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    node: process.version,
    region: process.env.VERCEL_REGION ?? 'local',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
}
