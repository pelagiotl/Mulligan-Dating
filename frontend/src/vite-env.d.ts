/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_NGROK_URL?: string
  [key: string]: any
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

