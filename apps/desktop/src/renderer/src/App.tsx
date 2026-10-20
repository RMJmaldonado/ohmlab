// Ventana principal: el editor y la práctica con el multímetro, más el
// autodiagnóstico que corre al abrir.
import { useEffect, useState } from "react";
import type { SelfTestResult } from "../../shared/api";
import { DiagnosticsDialog } from "./DiagnosticsDialog";
import { Editor } from "./editor/Editor";
import { Practice } from "./practice/Practice";

type SelfTestState = { status: "running" } | { status: "done"; result: SelfTestResult };
type ViewName = "editor" | "practice";

export function App() {
  const [viewName, setViewName] = useState<ViewName>("editor");
  const [selfTest, setSelfTest] = useState<SelfTestState>({ status: "running" });
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const runSelfTest = async () => {
    setSelfTest({ status: "running" });
    setSelfTest({ status: "done", result: await window.ohmlab.selfTest() });
  };

  useEffect(() => {
    runSelfTest();
    // Las órdenes del menú Archivo son del editor: se muestra el editor.
    const stopMenu = window.ohmlab.onMenuCommand(() => setViewName("editor"));
    const stopDiagnostics = window.ohmlab.onOpenDiagnostics(() => setShowDiagnostics(true));
    return () => {
      stopMenu();
      stopDiagnostics();
    };
  }, []);

  const report = selfTest.status === "done" ? selfTest.result.report : null;
  const failedCheck = report?.checks.find((c) => !c.ok);

  return (
    <div className="app" data-selftest={selfTest.status === "running" ? "running" : report!.ok ? "ok" : "fail"}>
      <header className="topbar">
        <span className="brand">OhmLab</span>
        <nav className="views" aria-label="Vista">
          <button className={viewName === "editor" ? "view-tab active" : "view-tab"} data-view="editor" onClick={() => setViewName("editor")}>
            Editor
          </button>
          <button className={viewName === "practice" ? "view-tab active" : "view-tab"} data-view="practice" onClick={() => setViewName("practice")}>
            Práctica con multímetro
          </button>
        </nav>
      </header>

      {failedCheck && (
        <div className="banner banner-error" role="alert">
          <strong>OhmLab no puede simular.</strong> {failedCheck.label}: {failedCheck.detail}
          <button onClick={() => setShowDiagnostics(true)}>Ver diagnóstico</button>
        </div>
      )}

      {/* Las dos vistas siguen montadas para no perder lo hecho al cambiar de pestaña. */}
      <div className="view" hidden={viewName !== "editor"}>
        <Editor active={viewName === "editor"} />
      </div>
      <div className="view scroll" hidden={viewName !== "practice"}>
        <Practice active={viewName === "practice"} />
      </div>

      <footer className="statusbar">
        {selfTest.status === "running"
          ? "Autodiagnóstico en curso…"
          : report!.ok
            ? `Autodiagnóstico: todo funciona (${report!.totalMs} ms)`
            : "Autodiagnóstico: hay problemas"}
        <button className="link" onClick={() => setShowDiagnostics(true)}>
          Diagnóstico
        </button>
      </footer>

      {showDiagnostics && (
        <DiagnosticsDialog
          result={selfTest.status === "done" ? selfTest.result : null}
          onRetry={runSelfTest}
          onClose={() => setShowDiagnostics(false)}
        />
      )}
    </div>
  );
}
