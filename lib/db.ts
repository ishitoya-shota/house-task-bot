import { neon } from '@neondatabase/serverless';

function getDatabaseUrl(): string {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not configured');
	}
	return databaseUrl;
}

export function getSql() {
	return neon(getDatabaseUrl());
}
