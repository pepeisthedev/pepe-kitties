/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REOWN_PROJECT_ID: string
  readonly VITE_FREGS_ADDRESS: string
  readonly VITE_FREGS_ITEMS_ADDRESS: string
  readonly VITE_FREGS_MINTPASS_ADDRESS: string
  readonly VITE_SPIN_THE_WHEEL_ADDRESS?: string
  readonly VITE_SLOT_MACHINE_ADDRESS?: string
  readonly VITE_FREGS_LIQUIDITY_ADDRESS?: string
  readonly VITE_FREG_SHOP_ADDRESS?: string
  readonly VITE_FREGCOIN_ADDRESS?: string
  readonly VITE_FREG_AIRDROP_ADDRESS?: string
  readonly VITE_FREGS_RANDOMIZER_ADDRESS?: string
  readonly VITE_CHAIN_ID?: string
  readonly VITE_FALLBACK_RPC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
