/// <reference types="vite/client" />
import type { OhmlabApi } from "../../shared/api";

declare global {
  interface Window {
    /** Puente hacia el proceso principal (ver src/preload). */
    ohmlab: OhmlabApi;
  }
}
