// Why a request wasn't taken, in plain words (ARCHITECTURE §6, Input, Output; AC-10-34, 37; T-26;
// BACKLOG C86, C104; ADR-431): which field of which part its endpoint's schema refused, and how.
// **Every word said is the contracts' own**: a field is named only where the endpoint's schema
// names it, and a limit is the schema's. Nothing the caller sent is said back: not a value, and
// not the name of a field nobody named.
import { z } from 'zod';

import { isFilePart, type Endpoint, type Sent } from './endpoints.ts';

type Issue = z.core.$ZodIssue;
type Part = 'params' | 'query' | 'body';

const partInWords: Record<Part, string> = {
  params: 'the path',
  query: 'the query',
  body: 'the body',
};

// As many refusals as one answer says.
const saidAtMost = 3;

const namedBy = new WeakMap<z.ZodType, ReadonlySet<string>>();

// Every field the schema names, anywhere inside it.
function named(schema: z.ZodType): ReadonlySet<string> {
  const known = namedBy.get(schema);
  if (known !== undefined) return known;
  const names = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (typeof node === 'object' && node !== null) {
      const { properties } = node as { properties?: unknown };
      if (typeof properties === 'object' && properties !== null) {
        for (const name of Object.keys(properties)) names.add(name);
      }
      Object.values(node).forEach(walk);
    }
  };
  walk(z.toJSONSchema(schema, { io: 'input' }));
  namedBy.set(schema, names);
  return names;
}

// Where the issue is, as far as the schema names the way there: `changes.loadCall`, `items[2]`.
function fieldAt(path: readonly PropertyKey[], names: ReadonlySet<string>): string {
  let field = '';
  for (const step of path) {
    if (typeof step === 'number') field += `[${String(step)}]`;
    else if (typeof step === 'string' && names.has(step)) field += field === '' ? step : `.${step}`;
    else break;
  }
  return field;
}

function valueAt(sent: unknown, path: readonly PropertyKey[]): unknown {
  let value = sent;
  for (const step of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<PropertyKey, unknown>)[step];
  }
  return value;
}

const counted = (origin: string): string =>
  origin === 'string' ? ' characters' : origin === 'array' || origin === 'set' ? ' entries' : '';

// What is wrong with it, from the kind of issue and the schema's own limit.
function wrong(issue: Issue, sent: unknown): string {
  switch (issue.code) {
    case 'invalid_type':
      return valueAt(sent, issue.path) === undefined
        ? 'is missing'
        : 'isn’t the kind of value this request takes';
    case 'too_big':
      return `${issue.inclusive === false ? 'must be less than' : 'can’t be more than'} ${String(issue.maximum)}${counted(issue.origin)}`;
    case 'too_small':
      if (issue.origin === 'string' && issue.minimum === 1 && issue.inclusive !== false) {
        return 'is blank';
      }
      return `${issue.inclusive === false ? 'must be more than' : 'can’t be less than'} ${String(issue.minimum)}${counted(issue.origin)}`;
    case 'not_multiple_of':
      return `is finer than the ${String(issue.divisor)} it is kept to`;
    case 'unrecognized_keys':
      return 'has a field this request doesn’t take';
    case 'invalid_format':
      return 'isn’t written the way this request takes it';
    case 'invalid_value':
      return 'isn’t one of the values this request takes';
    case 'invalid_union':
      return valueAt(sent, issue.path) === undefined
        ? 'is missing'
        : 'isn’t in a form this request takes';
    default:
      return 'isn’t taken as it stands';
  }
}

function refusals(part: Part, schema: z.ZodType | undefined, sent: unknown): string[] {
  const where = partInWords[part];
  if (schema === undefined) {
    const none =
      sent === undefined ||
      (part !== 'body' &&
        typeof sent === 'object' &&
        sent !== null &&
        Object.keys(sent).length === 0);
    return none ? [] : [`this request takes nothing in ${where}`];
  }
  return refused(where, schema, part === 'body' ? sent : (sent ?? {}));
}

function refused(where: string, schema: z.ZodType, sent: unknown): string[] {
  const read = schema.safeParse(sent);
  if (read.success) return [];
  const names = named(schema);
  return read.error.issues.map((issue) => {
    const field = fieldAt(issue.path, names);
    // An issue deeper than the schema names the way to is said of the last field it names.
    const whole = issue.path.every((step) => typeof step === 'number' || names.has(String(step)));
    const said = whole ? wrong(issue, sent) : 'isn’t taken as it stands';
    return `${field === '' ? where : `${field} in ${where}`} ${said}`;
  });
}

const atMost = (all: readonly string[]): string => {
  const more = all.length - saidAtMost;
  return `${all.slice(0, saidAtMost).join('; ')}${more > 0 ? `; and ${String(more)} more` : ''}`;
};

// The plain words for a request `taken` refused; undefined for one it takes.
export function notTaken(served: Endpoint, sent: Sent): string | undefined {
  const all = [
    ...new Set([
      ...refusals('params', served.params, sent.params),
      ...refusals('query', served.query, sent.query),
      ...(served.file === true
        ? isFilePart(sent.body)
          ? []
          : ['the body isn’t a part of a file: at least one byte, sent as a file’s part']
        : refusals('body', served.body, sent.body)),
    ]),
  ];
  return all.length === 0 ? undefined : `Not taken: ${atMost(all)}.`;
}

// Why one record of a sync isn't one, by the same rule (ADR-467): which field its schema
// refused and how, never a value that was sent; undefined for a record the schema reads. A
// refusal in the domain's own words (a detail on a kind that doesn't record it) is said as the
// field alone, since those words may quote what was sent.
export function notRead(schema: z.ZodType, sent: unknown): string | undefined {
  const all = [...new Set(refused('this record', schema, sent))];
  return all.length === 0 ? undefined : atMost(all);
}
