import { VercelRequest, VercelResponse } from '@vercel/node';
import { validateSignature } from '@line/bot-sdk';
import { getLineClient } from '../lib/line';
import { GeminiUnavailableError, parseMessage } from '../services/aiService';
import { addTask, completeTask, getPendingTasks } from '../services/taskService';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function taskListText(tasks: { task_name: string }[]): string {
  return tasks.length ? tasks.map((task, index) => `${index + 1}. ${task.task_name}`).join('\n') : '未完了のタスクはありません。';
}

function getGeminiErrorMessage(error: GeminiUnavailableError): string {
  switch (error.status) {
    case 429:
      return 'Geminiへのアクセスが集中しているか、利用上限に達しています。少し時間を置いて再度お試しください。';
    case 500:
      return 'Gemini側で一時的な内部エラーが発生しています。しばらくしてから再度お試しください。';
    case 502:
      return 'Geminiとの通信中に一時的なエラーが発生しました。しばらくしてから再度お試しください。';
    case 503:
      return 'ごめんなさい、今ねgeminiが混んでいるの。しばらくしてから再度お試しください。';
    case 504:
      return 'Geminiからの応答に時間がかかっています。しばらくしてから再度お試しください。';
    default:
      return 'Geminiを一時的に利用できません。しばらくしてから再度お試しください。';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).send('OK');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const channelSecret = requiredEnv('LINE_CHANNEL_SECRET');
    const signature = req.headers['x-line-signature'];
    const rawBody = (req as VercelRequest & { rawBody?: string | Buffer }).rawBody;
    const body = rawBody || JSON.stringify(req.body);
    if (typeof signature !== 'string' || !validateSignature(body, channelSecret, signature)) {
      return res.status(401).send('Invalid signature');
    }

    const client = getLineClient();
    const events = req.body.events || [];
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        try {
          const intent = await parseMessage(event.message.text);
          let reply = '';

          if (intent.action === 'CREATE' && intent.task_name) {
            await addTask(intent.task_name, intent.is_recurring, intent.interval_weeks);
            reply = intent.is_recurring
              ? `「${intent.task_name}」を${intent.interval_weeks}週間おきのタスクに追加しました。`
              : `「${intent.task_name}」をタスクに追加しました。`;
          } else if (intent.action === 'DELETE' && intent.task_name) {
            const completedCount = await completeTask(intent.task_name);
            reply = completedCount ? `「${intent.task_name}」を完了しました。` : `「${intent.task_name}」は見つかりませんでした。`;
          } else if (intent.action === 'SELECT') {
            reply = `未完了タスク:\n${taskListText(await getPendingTasks())}`;
          } else {
            reply = 'タスクの追加、完了、一覧表示として解釈できませんでした。';
          }

          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: reply }],
          });
        } catch (error) {
          console.error('Message processing failed:', error);
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
              type: 'text',
              text: error instanceof GeminiUnavailableError
                ? getGeminiErrorMessage(error)
                : '処理中にエラーが発生しました。しばらくしてから再度お試しください。',
            }],
          });
        }
      }
    }
    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    return res.status(200).json({ status: 'error' });
  }
}