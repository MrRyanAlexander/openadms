// The firm's API, the one server the app talks to (AC-11-01; ADR-565): asked at the origin the
// build names, by the endpoints of `packages/contracts`, each answer read by its own schema
// before anything of it is used (MASWE-0050). It sends no cookie and follows no redirect.
import { healthEndpoint } from '@open-adms/contracts';

export class Server {
  readonly origin: string;

  constructor(origin: string) {
    this.origin = origin;
  }

  // Whether the API answers now. Nothing waits on it: a phone with no signal works all day.
  async answers(): Promise<boolean> {
    try {
      const answer = await fetch(new URL(healthEndpoint.path, this.origin), {
        method: healthEndpoint.method,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      });
      return answer.ok && healthEndpoint.answer.safeParse(await answer.json()).success;
    } catch {
      return false;
    }
  }
}
