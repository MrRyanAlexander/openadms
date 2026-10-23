// What the build writes into the bundle (vite.config.ts): the API's origin, the release it is built
// from and the policy values, and nothing else.
interface ImportMetaEnv {
  readonly ADMS_API_ORIGIN: string;
  // The Open ADMS release (the root package.json's version): what "Built on Open ADMS" says.
  readonly ADMS_RELEASE: string;
  readonly ADMS_POLICY: Readonly<Record<string, string>>;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// A stylesheet the build bundles beside the script (src/look/): imported for its rules alone.
declare module '*.css';
