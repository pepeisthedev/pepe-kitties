/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REOWN_PROJECT_ID: string
  readonly VITE_FREGS_ADDRESS: string
  readonly VITE_FREGS_ITEMS_ADDRESS: string
  readonly VITE_FREGS_MINTPASS_ADDRESS: string
  readonly VITE_FALLBACK_RPC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
