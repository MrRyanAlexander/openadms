// A file being made by the server, and what came of the last one: busy while it is made, the
// refusal beside the control that asked, a polite "saved" once the browser has the file.
import { Banner } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { Trouble } from '../reading.tsx';
import { words } from '../words.ts';

export function useMaking() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [saved, setSaved] = useState(false);
  const make = (made: () => Promise<NotAnswered | null>) => {
    setBusy(true);
    setFailed(null);
    setSaved(false);
    void made().then((outcome) => {
      setBusy(false);
      setFailed(outcome);
      setSaved(outcome === null);
    });
  };
  const said = (
    <>
      {failed === null ? null : <Trouble reply={failed} />}
      {saved ? (
        <Banner tone="good" announced>
          <p>{words.exports.saved}</p>
        </Banner>
      ) : null}
    </>
  );
  return { busy, make, said };
}
