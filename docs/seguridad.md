# Seguridad

Notas para no olvidar al construir cada parte.

## Importar modelos o netlists SPICE (fase avanzada)

Un archivo SPICE puede traer un bloque `.control ... .endc`, y dentro de él
el comando `shell`, que **ejecuta programas en la computadora**. Alguien
podría compartir un "modelo" que en realidad instala un virus.

Al importar `.lib`, `.mod` o `.cir`, OhmLab debe:

- Rechazar los bloques `.control` / `.endc` y los comandos de ngspice
  (`shell`, `source`, `write`, `exec`...).
- Aceptar solo líneas de modelo y subcircuito (`.model`, `.subckt`, `.ends`,
  `.param`) y elementos.
- Mostrar qué se importó antes de usarlo.

## Valores que escribe el usuario

Los valores de los componentes se guardan como números, nunca como texto,
así que no pueden "inyectar" líneas extra en el netlist. Mantenerlo así.

## Archivos .ohmlab (paso 9)

Un archivo puede venir de cualquier lado (un compañero, internet), así que se
trata como datos no confiables:

- Es JSON con piezas y cables: no hay código ni comandos de SPICE dentro.
- La ventana nunca elige rutas: los diálogos de guardar y abrir los abre el
  proceso principal, y solo se escribe donde el usuario eligió.
- El proceso principal revisa el archivo antes de dárselo a la ventana
  (`validateSchematic` en el núcleo): tipos de pieza conocidos, nombres con
  letras, números y _, valores numéricos finitos, posiciones enteras acotadas,
  cables horizontales o verticales, nombres sin repetir.
- Límites: 5 MB por archivo, 5000 piezas y 20000 tramos de cable.
- Si algo falla, no se abre nada (nunca a medias) y el aviso explica qué pasó.
- Lo que se guarda también se revisa: la ventana no puede escribir cualquier
  cosa en el disco.

## Electron (paso 4)

Seguir la lista de seguridad oficial de Electron: `contextIsolation`
activado, `nodeIntegration` desactivado en la ventana, sin cargar páginas
remotas, y comunicación con el proceso principal solo por un puente
(`preload`) con funciones concretas.
