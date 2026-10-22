// What the build writes into the bundle (vite.config.ts): the API's origin, and nothing else.
interface ImportMetaEnv {
  readonly ADMS_API_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// A stylesheet the build bundles beside the script: imported for its rules alone.
declare module '*.css';
