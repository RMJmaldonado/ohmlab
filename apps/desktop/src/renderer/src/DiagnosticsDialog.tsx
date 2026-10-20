// Ventana de Ayuda → Diagnóstico: muestra el informe del autodiagnóstico
// y permite copiarlo para un reporte en GitHub.
import { useEffect, useRef, useState } from "react";
import type { SelfTestResult } from "../../shared/api";

interface Props {
  result: SelfTestResult | null;
  onRetry: () => Promise<void>;
  onClose: () => void;
}

export function DiagnosticsDialog({ result, onRetry, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const copy = async () => {
    if (!result) return;
    await window.ohmlab.copyText(result.text);
    setCopied(true);
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      <h2>Diagnóstico</h2>
      {result ? (
        <>
          <ul className="checks">
            {result.report.checks.map((c) => (
              <li key={c.id} className={c.ok ? "ok" : "fail"}>
                <span className="badge">{c.ok ? "OK" : "Falla"}</span>
                <strong>{c.label}:</strong> {c.detail}
              </li>
            ))}
          </ul>
          <p className="muted small">
            Si algo falla, copia el informe y pégalo en un reporte en GitHub. No incluye tu nombre de usuario.
          </p>
          <pre className="report" data-testid="informe">{result.text}</pre>
        </>
      ) : (
        <p>Autodiagnóstico en curso…</p>
      )}
      <div className="actions">
        <button onClick={() => { setCopied(false); onRetry(); }}>Repetir</button>
        <button onClick={copy} disabled={!result}>{copied ? "Copiado ✓" : "Copiar informe"}</button>
        <button className="primary" autoFocus onClick={() => ref.current?.close()}>Cerrar</button>
      </div>
    </dialog>
  );
}
