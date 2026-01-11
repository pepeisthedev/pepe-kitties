/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REOWN_PROJECT_ID: string
  readonly VITE_PEPE_KITTIES_ADDRESS: string
  readonly VITE_PEPE_KITTIES_ITEMS_ADDRESS: string
  readonly VITE_PEPE_KITTIES_MINTPASS_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}