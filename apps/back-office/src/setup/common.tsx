// What every setup screen shares (ARCHITECTURE §14; adms-ticket-workflows, the setup spine): the
// firm's lists as options to pick from by name, and what a setup write came to, said as the API
// answered it: saved, any warnings in its own words, and how many tickets the change queued to be
// drawn again (a change of setup reprocesses only tickets not locked as invoiced).
import { listListValuesEndpoint, type FirmList } from '@open-adms/contracts';
import { Banner } from '@open-adms/look';
import { useEffect, useState, type ReactNode } from 'react';

import type { Option } from '../look/fields.tsx';
import { useRead } from '../reading.tsx';
import { counted, words } from '../words.ts';

// Said by a screen that changed one of the firm's lists (a debris type added to the library from a
// form): every screen's options read their list again.
const listsChanged = 'adms-lists-changed';
export function changedLists(): void {
  window.dispatchEvent(new Event(listsChanged));
}

// A firm's list's values in service, by name, as options; empty while they load.
export function useListOptions(list: FirmList): readonly Option[] {
  const [read, reload] = useRead(listListValuesEndpoint, {
    params: { list },
    query: { archived: 'false', limit: '200' },
  });
  useEffect(() => {
    window.addEventListener(listsChanged, reload);
    return () => {
      window.removeEventListener(listsChanged, reload);
    };
  }, [reload]);
  return read.kind === 'answered'
    ? read.answer.values.map((value) => ({ id: value.id, label: value.name }))
    : [];
}

// What a setup write answered beside its record.
export interface SetupWritten {
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
  readonly queued?: { readonly tickets: number; readonly lockedAsInvoiced: number } | undefined;
}

// The last thing the screen saved, said until the next.
export function useTold(): readonly [ReactNode, (written: SetupWritten | null) => void] {
  const [written, setWritten] = useState<SetupWritten | null | 'none'>('none');
  const told =
    written === 'none' ? null : (
      <div className="told">
        <Banner tone="good" announced>
          <p>{words.common.saved}</p>
          {written?.queued === undefined ? null : (
            <p>
              {counted(words.setup.queued, written.queued.tickets)}
              {written.queued.lockedAsInvoiced === 0
                ? ''
                : ` ${counted(words.setup.lockedLeft, written.queued.lockedAsInvoiced)}`}
            </p>
          )}
        </Banner>
        {written === null || written.warnings.length === 0 ? null : (
          <Banner tone="notice">
            {written.warnings.map((warning) => (
              <p key={warning.code}>{warning.message}</p>
            ))}
          </Banner>
        )}
      </div>
    );
  return [told, setWritten];
}

// A yes or a no, in words.
export const yesNo = (value: boolean): string => (value ? words.common.yes : words.common.no);

// A name from a list of options by id, or the words for none.
export const nameIn = (options: readonly Option[], id: string | null): string =>
  id === null ? words.common.none : (options.find((option) => option.id === id)?.label ?? '…');
