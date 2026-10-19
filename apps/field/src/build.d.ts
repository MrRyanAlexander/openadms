// What the build writes into the bundle (vite.config.ts): the API's origin and the policy values,
// and nothing else.
interface ImportMetaEnv {
  readonly ADMS_API_ORIGIN: string;
  readonly ADMS_POLICY: Readonly<Record<string, string>>;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// A stylesheet the build bundles beside the script (src/look/): imported for its rules alone.
declare module '*.css';
