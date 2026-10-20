import type { Diagnostic } from "@ohmlab/core";

export function DiagnosticList({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <ul className="diagnostics">
      {diagnostics.map((d, i) => (
        <li key={i} className={d.severity}>
          <span className="badge">{d.severity === "error" ? "Error" : "Aviso"}</span>
          <div>
            <p className="message">{d.message}</p>
            {d.hint && <p className="hint">{d.hint}</p>}
            {d.details && (
              <details>
                <summary>Ver detalles técnicos</summary>
                <pre>{d.details}</pre>
              </details>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
