import { getGeminiClient } from '../lib/ai';
import { ParsedIntent, TaskAction } from '../types';

const SYSTEM_INSTRUCTION = `あなたは家事・買い出しタスク管理LINEボットの意図解析器です。
入力された日本語メッセージから、必ず次のJSONオブジェクトだけを返してください。Markdown、説明、コードフェンスは禁止です。
{
	"action": "CREATE" | "DELETE" | "SELECT" | "UNKNOWN",
	"task_name": string,
	"is_recurring": boolean,
	"interval_weeks": number | null
}
CREATEは買う・する等の新規タスク、DELETEは買った・完了等の完了報告、SELECTは一覧確認です。
定期指定があるCREATEだけis_recurring=trueとし、interval_weeksに週間数を入れてください。それ以外はfalseとnullです。
SELECT、UNKNOWNではtask_nameは空文字にしてください。`;

const validActions: TaskAction[] = ['CREATE', 'DELETE', 'SELECT', 'UNKNOWN'];

export class GeminiUnavailableError extends Error {
	readonly status: number;

	constructor(model: string, status: number) {
		super(`Gemini is temporarily unavailable for model "${model}"`);
		this.name = 'GeminiUnavailableError';
		this.status = status;
	}
}

function getErrorStatus(error: unknown): number | undefined {
	return (error as { status?: number }).status;
}

function isRetryableError(error: unknown): boolean {
	return [429, 500, 502, 503, 504].includes(getErrorStatus(error) || 0);
}

async function wait(milliseconds: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeIntent(value: unknown): ParsedIntent {
	if (!value || typeof value !== 'object') {
		throw new Error('Gemini returned a non-object response');
	}

	const candidate = value as Record<string, unknown>;
	const action = candidate.action;
	if (typeof action !== 'string' || !validActions.includes(action as TaskAction)) {
		throw new Error('Gemini returned an invalid action');
	}

	const isRecurring = candidate.is_recurring === true;
	const intervalWeeks = candidate.interval_weeks;
	const normalizedInterval =
		typeof intervalWeeks === 'number' && Number.isInteger(intervalWeeks) && intervalWeeks > 0
			? intervalWeeks
			: null;

	if ((action === 'CREATE' || action === 'DELETE') && typeof candidate.task_name !== 'string') {
		throw new Error('Gemini returned an invalid task name');
	}

	return {
		action: action as TaskAction,
		task_name: typeof candidate.task_name === 'string' ? candidate.task_name.trim() : '',
		is_recurring: action === 'CREATE' && isRecurring && normalizedInterval !== null,
		interval_weeks: action === 'CREATE' && isRecurring ? normalizedInterval : null,
	};
}

export async function parseMessage(message: string): Promise<ParsedIntent> {
	const configuredModel = process.env.GEMINI_MODEL?.trim();
	const model = (configuredModel || 'gemini-3.8-flash').replace(/^models\//, '');

	let response;
	const maxAttempts = 3;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			response = await getGeminiClient().models.generateContent({
				model,
				contents: message,
				config: {
					systemInstruction: SYSTEM_INSTRUCTION,
					responseMimeType: 'application/json',
				},
			});
			break;
		} catch (error) {
			const status = getErrorStatus(error);
			console.error('Gemini generateContent failed:', { model, attempt, status, error });

			if (!isRetryableError(error) || attempt === maxAttempts) {
				if (isRetryableError(error)) {
					throw new GeminiUnavailableError(model, status || 503);
				}
				throw new Error(`Gemini API request failed for model "${model}"`);
			}

			await wait(1000 * 2 ** (attempt - 1));
		}
	}

	if (!response) {
		throw new GeminiUnavailableError(model, 503);
	}

	const text = response.text?.trim();
	if (!text) {
		throw new Error('Gemini returned an empty response');
	}

	return normalizeIntent(JSON.parse(text));
}
