/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string

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

