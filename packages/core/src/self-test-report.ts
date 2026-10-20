// Forma del informe de autodiagnóstico. Está aparte de node/self-test.ts
// para que la interfaz gráfica pueda usar estos tipos sin depender de Node.

export interface SelfTestCheck {
  id: "temp-folder" | "simulator" | "reference-circuit";
  label: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface SelfTestReport {
  ok: boolean;
  date: string;
  appVersion: string;
  /** Sistema operativo, versión y arquitectura. */
  system: string;
  /** Node o Electron con el que corre la app. */
  runtime: string;
  checks: SelfTestCheck[];
  totalMs: number;
}
