---
name: dps-fase
description: Abrir, avanzar o cerrar una fase (F0–F6) del docs/PLAN.md de la plataforma Detroit Power System. Úsalo cuando el usuario pida "empezar la fase X", "seguir con F2", "qué falta de la fase actual" o "cerrar la fase" — verifica criterios de aceptación y deja el estado registrado.
---

# Gestionar una fase del plan

`docs/PLAN.md` es la fuente de verdad del orden de construcción. Cada fase tiene épicas, historias
con casilla, criterios de aceptación y entregables.

## Al ABRIR una fase

1. Lee la fase completa en `docs/PLAN.md` y sus **dependencias**. Si una fase previa tiene criterios
   sin cumplir, dilo antes de empezar — no la arranques en silencio.
2. Verifica los **bloqueantes declarados**:
   - F2 requiere las tolerancias validadas contra el manual MTU (decisión abierta D1). Si no están,
     avisa y trabaja con las provisionales marcadas como tales.
   - F1 requiere la convención de correlativos confirmada (D3).
   - F0 requiere resolver si la plataforma es multi-empresa (D5) — afecta el modelo de datos.
3. Crea las tareas con `TaskCreate`, una por historia, con las dependencias entre ellas.
4. Marca la fase como _en curso_ en la tabla de estado de `docs/PLAN.md`.

## Durante la fase

- Una historia por rama `feat/<fase>-<slug>`, PR contra `develop`.
- Cada PR pasa lint, typecheck y tests de su app (los filtros de ruta del CI deciden cuáles corren).
- Al terminar una historia, marca su casilla en `docs/PLAN.md` en el mismo PR.
- Si aparece alcance nuevo, **no lo metas dentro de la fase en curso**: anótalo en la sección
  "Alcance emergente" de `docs/PLAN.md` y decide con el usuario a qué fase va (riesgo R7).

## Al CERRAR una fase

No se cierra por sensación de avance. Se cierra **verificando cada criterio de aceptación**:

1. Recorre uno por uno los criterios de la fase y prueba cada uno. Deja constancia del resultado real.
2. Si un criterio no se cumple, **la fase no está cerrada**. Repórtalo con lo que falta.
3. Lanza el agente `dps-qa` para una verificación independiente.
4. Verifica también los NFR aplicables (§22 de la especificación):
   - carga inicial < 3 s en 4G · autoguardado < 500 ms · PDF de 60 fotos < 45 s
   - cobertura ≥ 70% backend, ≥ 50% frontend
   - WCAG 2.1 AA en formularios y navegación
5. Actualiza la tabla de estado de `docs/PLAN.md` y etiqueta con versión semántica.

## Recordatorios permanentes

- **El hito de valor mínimo es el cierre de F1**: ahí la plataforma ya reemplaza al Word.
  La prueba que decide es la comparación ciega del PDF contra el informe OT746 original.
- La PWA actual sigue siendo el respaldo operativo hasta cerrar F4. Nada de cortes abruptos (riesgo R1).
- F3 puede solaparse con F1/F2; F4 y F5 pueden solaparse entre sí. F0 bloquea todo.
