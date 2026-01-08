/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEMELOOT_CONTRACT_ADDRESS: string
  readonly VITE_BEADPUNKS_CONTRACT_ADDRESS: string
  readonly VITE_LADYBEADS_CONTRACT_ADDRESS: string
  readonly VITE_ADDYPUNKS_CONTRACT_ADDRESS: string
  readonly VITE_REOWN_PROJECT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}