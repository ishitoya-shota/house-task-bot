import { VercelRequest, VercelResponse } from '@vercel/node';
import { getLineClient } from '../../lib/line';
import { getPendingTasks } from '../../services/taskService';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
	try {
		const targetId = process.env.LINE_NOTIFY_TARGET_ID;
		if (!targetId) throw new Error('LINE_NOTIFY_TARGET_ID is not configured');

		const tasks = await getPendingTasks();
		if (tasks.length) {
			await getLineClient().pushMessage({
				to: targetId,
				messages: [{
					type: 'text',
					text: `18時の未完了タスク:\n${tasks.map((task, index) => `${index + 1}. ${task.task_name}`).join('\n')}`,
				}],
			});
		}
		return res.status(200).json({ status: 'success', notified: tasks.length > 0 });
	} catch (error) {
		console.error('18pm notification failed:', error);
		return res.status(500).json({ error: 'Notification failed' });
	}
}
