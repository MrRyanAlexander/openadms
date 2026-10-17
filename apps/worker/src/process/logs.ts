// The worker's log (ARCHITECTURE §6, Logs; AC-10-32; T-26; ADR-385, 419): one JSON object a line,
// `service: worker`, and nothing secret or personal by construction. A line says what happened
// and to which record by its id: a project, a run, a job. An error is logged as its kind and
// where it was thrown, never its message, which may quote a record or a connection.
export interface LogStream {
  write(line: string): void;
}

export type LogFields = Readonly<Record<string, string | number | readonly string[] | undefined>>;

// The kind of an error and the frames it passed through, without its message.
export function errorLogged(error: unknown): { kind: string; code?: string; at: string[] } {
  if (!(error instanceof Error)) return { kind: typeof error, at: [] };
  const code: unknown = (error as { code?: unknown }).code;
  return {
    kind: error.constructor.name,
    ...(typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? { code } : {}),
    at: (error.stack ?? '')
      .split('\n')
      .filter((line) => line.startsWith('    at '))
      .map((line) => line.trim()),
  };
}

export class WorkerLog {
  private readonly to: LogStream;

  constructor(to: LogStream = process.stdout) {
    this.to = to;
  }

  info(message: string, fields: LogFields = {}): void {
    this.line(30, message, fields);
  }

  warn(message: string, fields: LogFields = {}): void {
    this.line(40, message, fields);
  }

  error(message: string, error: unknown, fields: LogFields = {}): void {
    this.line(50, message, { ...fields, err: errorLogged(error) });
  }

  // An error that is no thrown one, but what a person must look into: said by a fixed code, so
  // a filter on the log finds every one (ADR-498).
  errorCoded(code: string, message: string, fields: LogFields = {}): void {
    this.line(50, message, { ...fields, code });
  }

  private line(level: number, msg: string, fields: Readonly<Record<string, unknown>>): void {
    this.to.write(
      `${JSON.stringify({ level, time: Date.now(), service: 'worker', ...fields, msg })}\n`,
    );
  }
}
