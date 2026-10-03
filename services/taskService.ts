import { getSql } from '../lib/db';
import { Task } from '../types';

export async function addTask(
	taskName: string,
	isRecurring: boolean,
	intervalWeeks: number | null,
): Promise<Task> {
	const sql = getSql();
	const rows = await sql`
		INSERT INTO tasks (task_name, is_recurring, interval_weeks)
		VALUES (${taskName}, ${isRecurring}, ${isRecurring ? intervalWeeks : null})
		RETURNING *
	`;
	return rows[0] as Task;
}

export async function completeTask(taskName: string): Promise<number> {
	const sql = getSql();
	const recurring = await sql`
		UPDATE tasks
		SET last_completed_at = CURRENT_TIMESTAMP
		WHERE task_name = ${taskName} AND is_recurring = TRUE
		RETURNING id
	`;
	const deleted = await sql`
		DELETE FROM tasks
		WHERE task_name = ${taskName} AND is_recurring = FALSE
		RETURNING id
	`;
	return recurring.length + deleted.length;
}

export async function getPendingTasks(): Promise<Task[]> {
	const sql = getSql();
	const rows = await sql`
		SELECT * FROM tasks
		WHERE is_recurring = FALSE
		ORDER BY created_at ASC, id ASC
	`;
	return rows as Task[];
}

export async function getRecurringTasksDue(): Promise<Task[]> {
	const sql = getSql();
	const rows = await sql`
		SELECT * FROM tasks
		WHERE is_recurring = TRUE
			AND interval_weeks IS NOT NULL
			AND (
				last_completed_at IS NULL
				OR last_completed_at <= CURRENT_TIMESTAMP - (interval_weeks * INTERVAL '1 week')
			)
		ORDER BY created_at ASC, id ASC
	`;
	return rows as Task[];
}
