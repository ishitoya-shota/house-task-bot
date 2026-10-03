import { GoogleGenAI } from '@google/genai';

function getApiKey(): string {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY is not configured');
	}
	return apiKey;
}

export function getGeminiClient(): GoogleGenAI {
	return new GoogleGenAI({ apiKey: getApiKey() });
}
