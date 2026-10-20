# Comparación con otros simuladores

Comprobamos que OhmLab da los mismos resultados que otros simuladores y
observamos cómo reaccionan ante errores, para aprender de su experiencia de
uso. Solo se usan programas gratuitos y legales; no se publican
comparativas con simuladores comerciales.

## Falstad CircuitJS (web) — 2026-10-19

[Falstad CircuitJS](https://www.falstad.com/circuit/) es un simulador web
gratuito con un motor propio (no es SPICE), así que sirve como **referencia
independiente** de ngspice.

**Cómo se hizo:** cada circuito de `test-circuits/` se convirtió al formato
de texto de Falstad, se cargó con `CircuitJS1.importCircuit()` y se leyeron
tensiones y corrientes con `CircuitJS1.getElements()` (`getVoltage`,
`getCurrent`).

### Circuitos correctos: 8 de 8 coinciden

| Circuito | Valor comparado | Teoría y ngspice | Falstad |
|---|---|---|---|
| Divisor | V(salida) | 6 V | 6 V |
| Wheatstone equilibrado | V(c), V(d), I(R5) | 6,6667 V; 6,6667 V; 0 | 6,6667 V; 6,6667 V; 0 |
| Wheatstone desequilibrado | V(c), V(d), I(R5) | 4,615385 V; 3,846154 V; 0,769231 mA | 4,615385 V; 3,846154 V; 0,769231 mA |
| Dos fuentes | V(A), I(R1), I(R2), I(R3) | 6 V; 4 mA; 3 mA; −1 mA | 6 V; 4 mA; 3 mA; −1 mA |
| Fuente de corriente | V(b), I(R1), I(R2) | 6 V; 4 mA; 6 mA | 6 V; 4 mA; 6 mA |
| Resistencia suelta | V(punta), I(R3) | 6 V; 0 | 6 V; 0 |
| Fuente de tensión suelta | V(a), V(suelto) | 0 V; −12 V | 0 V; −12 V |
| Componente desconectado | V(salida) | 6 V | 6 V |

Las diferencias son de redondeo de la computadora (menores que 10⁻¹⁵).

### Circuitos con errores: Falstad no avisa

| Circuito | Falstad | OhmLab |
|---|---|---|
| Sin tierra | Elige él mismo un punto de referencia y simula bien | Error `no-ground` |
| Fuentes de tensión en paralelo (12 V y 5 V) | Simula: 3500 A circulando entre las fuentes, nodo a 8,5 V. Sin mensaje | Error `voltage-source-loop` |
| Fuente de corriente de 1 mA abierta | Muestra **0 A**, aunque se configuró en 1 mA. Sin mensaje | Error `current-source-open` |
| Fuentes de corriente en serie | Todo en 0. Sin mensaje | Error `current-sources-series` |

### Ideas de experiencia de uso que vale la pena copiar

Falstad tiene una curva de aprendizaje muy baja. Lo que más ayuda:

- **Simulación en vivo:** no hay botón "Simular"; al cambiar un valor, el
  resultado cambia al instante. En OhmLab es viable en DC: el
  autodiagnóstico mide unos 40 ms por simulación.
- **Corriente animada:** puntos que se mueven por los cables muestran el
  sentido y la intensidad de la corriente.
- **Información al pasar el ratón:** cada componente muestra su corriente,
  tensión y potencia (`I = 6 mA | Vd = 6 V | P = 36 mW`).
- **Tierra opcional:** si falta, la elige él mismo. Es más cómodo, pero
  no enseña qué es la referencia de 0 V (OhmLab sí exige tierra).

## Otros simuladores

| Simulador | ¿Sirve como referencia? | Nota |
|---|---|---|
| LTspice | Sí: motor propio | Gratis, pero hay que instalarlo |
| Xyce | Sí: motor propio, código abierto | Hay que instalarlo |
| KiCad, Qucs-S, EasyEDA | Poco: usan ngspice (o derivados), el mismo motor que OhmLab | |
| Simuladores comerciales | Solo con licencia legítima (p. ej. la de la universidad), en privado | |
