export type TaskAction = 'CREATE' | 'DELETE' | 'SELECT' | 'UNKNOWN';

export interface ParsedIntent {
	action: TaskAction;
	task_name: string;
	is_recurring: boolean;
	interval_weeks: number | null;
}

export interface Task {
	id: number;
	task_name: string;
	is_recurring: boolean;
	interval_weeks: number | null;
	last_completed_at: Date | string | null;
	created_at: Date | string;
}
