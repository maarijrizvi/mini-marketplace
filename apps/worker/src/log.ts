/** One JSON object per line, so the cluster's log collector can index fields. */
export function log(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, service: 'worker', msg, ...fields });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
