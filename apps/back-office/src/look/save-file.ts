// A file the API made (an export, a PDF), read with the session's cookies as bytes and handed to
// the browser to save under the name the server gave it (ARCHITECTURE §14): never opened as a page
// of the API's. What wasn't answered is handed back, for the screen to say.
import type { Endpoint } from '@open-adms/contracts';

import type { Api, Asking, NotAnswered } from '../api.ts';

export async function savedFile<E extends Endpoint>(
  api: Api,
  served: E,
  asking: Asking<E>,
  fallbackName: string,
): Promise<NotAnswered | null> {
  const read = await api.file(served, asking);
  if (read.kind !== 'file') return read;
  const url = URL.createObjectURL(read.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = read.name ?? fallbackName;
  link.click();
  URL.revokeObjectURL(url);
  return null;
}
