/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string
    readonly VITE_NGROK_URL?: string
    [key: string]: any
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}

