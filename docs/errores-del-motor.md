# Errores del motor de simulación (ngspice 47)

Catálogo de cómo reacciona ngspice ante circuitos con problemas y qué hace
OhmLab en cada caso. Sirve para decidir qué revisar antes de simular y cómo
traducir cada mensaje.

**De dónde sale:** el manual oficial de ngspice 47 (citado por sección) y
pruebas propias hechas el 2026-10-19 con `ngspice_con.exe -b` en Windows.
Cada caso se puede repetir con el netlist que aparece en la tabla.

## Lo más importante

**ngspice no siempre falla cuando el circuito está mal.** En muchos casos
avisa con un *Warning* que nadie lee, aplica un "parche" interno (gmin
stepping) y **devuelve números como si todo estuviera bien**. Además, casi
siempre termina con código de salida 0, aunque haya errores graves.

Por eso OhmLab:

1. Revisa el circuito **antes** de simular (`packages/core/src/erc.ts`).
2. Genera el netlist él mismo: el estudiante nunca escribe SPICE.
3. Tiene una red de seguridad: si la salida contiene `singular matrix`,
   descarta los números (`packages/core/src/node/ngspice-cli.ts`).
4. No confía en el código de salida: comprueba que llegaron todos los
   valores pedidos.

| Caso | Lo que devolvió ngspice | ¿Avisó con un error? |
|---|---|---|
| Circuito sin tierra | V(a) = 12,012 V | No (solo *warnings*) |
| Fuente de corriente con un terminal al aire | V(x) = 1 mV (en teoría, infinita) | No |
| Fuentes de corriente en serie | V(m) = 0 V (en realidad, indefinida) | No |
| Parte del circuito separada, sin tierra | V(x) = V(y) = 0 V | No |
| Resistencia de 0 Ω | La cambió a 1 pΩ: I = 5 billones de A | No |
| Elemento al que le falta un nodo | **Lo borró** y simuló el resto | No |
| Diodo conectado directo a una fuente | I = 9 × 10⁶⁹ A | No |
| Bobina en paralelo con una fuente (en DC) | I(L) = 50 mA (en teoría, infinita) | No |

## 1. Errores de conexión (los detecta la revisión de OhmLab)

| Situación | Netlist de prueba | Respuesta de ngspice | En OhmLab |
|---|---|---|---|
| Sin tierra | `V1 a b 12`, `R1 a b 1k` | `Warning: singular matrix: check node b`, luego *gmin/source stepping* y números inventados | `no-ground` |
| Parte separada sin tierra | divisor + `R4 x y`, `R5 y x` | `singular matrix: check node y`, después V = 0 | `floating-section` |
| Fuentes de tensión en paralelo | `V1 a 0 12`, `V2 a 0 5` | `singular matrix: check node v1#branch`, `DC solution failed`, código de salida 1 | `voltage-source-loop` |
| Ídem, con tensiones iguales | `V1 a 0 12`, `V2 a 0 12` | Igual que el anterior: también falla | `voltage-source-loop` |
| Fuente de tensión en cortocircuito | `V1 a a 12` | `Fatal error: instance v1 is a shorted VSRC` (código de salida 0) | `voltage-source-shorted` |
| Fuente de corriente abierta | `I1 0 x 1m` (x sin conectar) | Sin error: V(x) = 1 mV | `current-source-open` |
| Fuentes de corriente en serie | `I1 0 m 1m`, `I2 m a 1m` | Sin error: V(m) = 0 | `current-sources-series` |
| Unida solo por fuentes de corriente | `I1 a b`, `R2 b c`, `I2 c 0` | `singular matrix` | `no-path-to-ground` |
| Resistencia con un extremo suelto | `R3 b c` (c sin conectar) | Funciona bien: V(c) = V(b), I = 0 | Aviso `pin-dangling` |
| Fuente de tensión con un extremo suelto | `V1 a c 12` (c sin conectar) | Funciona bien: I = 0, V(c) = −12 V | Aviso `pin-dangling` |
| Resistencia en cortocircuito | `R2 a a 1k` | Funciona bien: I = 0 | Aviso `component-shorted` |

## 2. Errores de escritura del netlist (los evita el generador)

El estudiante no escribe netlists, pero estos errores importarán cuando
existan "Importar netlist" y "Importar modelo".

| Situación | Netlist | Respuesta de ngspice |
|---|---|---|
| Valor que no es un número | `R1 a 0 abc` | `can't find model 'abc'` y `unknown parameter (abc)`; no simula |
| Faltan nodos | `R1 a 1k` | `Warning: 'r1 a 1k' is not a valid resistor instance line, ignored!` y **simula sin ese elemento** |
| Nombre repetido | dos `R1` | `device already exists, bail out`; no simula |
| Letra de elemento desconocida | `Z1 a 0 1k` | `Unable to find definition of model`; no simula |
| Modelo que no existe | `D1 b 0 dnoexiste` | `could not find a valid modelname`; no simula |
| Parámetro de modelo desconocido | `.model dmod D(XYZ=3)` | `unrecognized parameter (xyz) - ignored` y simula |
| Netlist vacío | solo título y `.end` | `incomplete or empty netlist`, código de salida 1 |
| Pedir un valor que no existe | `print v(zzz)` | `vector zzz is not available` (solo aviso) |

## 3. Trampas de valores y nombres

- **`M` en SPICE es mili, no mega.** `1M` = 0,001 Ω; un megaohmio se
  escribe `1meg`. En la prueba, `R2 a 0 1M` hizo circular 5000 A. OhmLab
  envía los valores como números, así que esto no le afecta; pero la
  **casilla donde el estudiante escribe valores** tendrá que decidir qué
  significa "M". Propuesta: aceptar `M` como mega (como se usa en clase)
  y `m` como mili, y mostrar siempre el valor interpretado ("1 MΩ").
- **Valores demasiado pequeños:** ngspice cambia una resistencia de 0 Ω
  por 1 pΩ sin dar error (`Value of resistor r1 is too small, set to
  1.000000e-12`). OhmLab rechaza R ≤ 0 antes de simular.
- **`gnd` es otro nombre de la tierra:** para ngspice, un nodo llamado
  `gnd` es el nodo 0. Por eso OhmLab renombra todos los nodos a `n1`,
  `n2`… y así ningún nombre elegido por el estudiante cambia el circuito.

## 4. Convergencia (importante desde la fase 2)

Con resistencias y fuentes, el circuito es lineal y se resuelve en un solo
paso. Con diodos y transistores, ngspice usa el método de Newton-Raphson,
que repite cálculos hasta que dos resultados seguidos casi coinciden
(manual, sección 1.4):

- Tensiones: diferencia ≤ 0,1 % o 1 µV (`RELTOL` = 1e-3, `VNTOL` = 1 µV).
- Corrientes: diferencia ≤ 0,1 % o 1 pA (`ABSTOL` = 1e-12).

Si no lo logra, en el punto de operación prueba ayudas en este orden
(sección 11.3.5): **gmin stepping** (pone conductancias pequeñas sobre los
dispositivos), **source stepping** (sube las fuentes desde 0 % hasta 100 %)
y, opcionalmente, un **punto de operación transitorio**. Por eso en las
pruebas aparecían líneas como `Starting dynamic gmin stepping`.

Mensajes y herramientas que habrá que manejar:

| Mensaje / herramienta | Qué significa | Sección del manual |
|---|---|---|
| `DC solution failed` | No encontró el punto de operación | 1.4.3, 11.3.5 |
| `gmin stepping failed`, `source stepping failed` | Fallaron las ayudas de convergencia | 11.3.5 |
| `timestep too small` | En transitorio, el paso de tiempo tuvo que achicarse demasiado | 12.17 |
| `.option rshunt=1e12` | Pone una resistencia enorme de cada nodo a tierra. Arregla nodos sin camino DC (p. ej. capacitores en serie), pero también oculta errores de conexión | 11.1.2.1 |
| `.option rseries=1e-4` | Pone una resistencia pequeña en serie con cada bobina. Ayuda con bobinas en paralelo con fuentes | 11.1.2.1 |
| `.nodeset`, `.ic` | Dan valores iniciales para ayudar a converger (circuitos con realimentación positiva) | 11.2, 12.17.1 |
| comando `where` | Dice qué nodo o dispositivo impidió la convergencia | 13.5.106 |

Casos ya probados que la fase 2 tendrá que resolver:

| Caso | Netlist | Respuesta de ngspice | Idea para OhmLab |
|---|---|---|---|
| Capacitores en serie | `C1 a m 1u`, `C2 m 0 1u` | `singular matrix: check node m`, y después de gmin, V(m) = 2,5 V | Es un circuito válido: usar `rshunt` solo en esos nodos o explicarlo |
| Bobina en paralelo con una fuente | `V1 a 0 5`, `L1 a 0 1m` | `singular matrix`, y después I(L) = 50 mA | La revisión trata la bobina como cortocircuito en DC: el lazo de fuentes de tensión ya lo detecta (`dc: "voltage"`) |
| Diodo conectado directo a una fuente | `V1 a 0 5`, `D1 a 0` | Sin error: I = 9 × 10⁶⁹ A | Revisar que los resultados sean físicamente posibles (p. ej. corrientes de más de 1 kA) |

## 5. Cómo responde OhmLab hoy

| Señal de ngspice | Código en OhmLab | Mensaje al estudiante |
|---|---|---|
| No se encuentra el programa | `simulator-not-found` | No se encontró el simulador (ngspice). |
| Tarda más de 10 s | `simulator-timeout` | La simulación tardó demasiado y se detuvo. |
| `singular matrix` (aunque haya números) | `simulator-singular` | El circuito no tiene una solución única. |
| `DC solution failed`, `… stepping failed`, `timestep too small` | `simulator-no-convergence` | El simulador no logró encontrar la solución. |
| Cualquier otro fallo, o falta algún valor | `simulator-failed` | Problema que OhmLab todavía no sabe explicar (con "Ver detalles"). |

## 6. Mejoras pendientes que salen de este catálogo

- [ ] Red de seguridad: si la salida contiene `is not a valid … instance
      line, ignored`, `too small, set to` o `Fatal error`, no mostrar
      números (hoy algunos se detectan solo porque falta algún valor).
- [ ] Casilla de valores: decidir y probar cómo se interpreta `M`/`m`/`meg`.
- [ ] Fase 2: reglas para capacitores en serie y comprobación de resultados
      imposibles (corrientes o tensiones gigantes).
- [ ] Importar netlists: además de lo de `docs/seguridad.md`, avisar de los
      elementos que ngspice ignoraría.
