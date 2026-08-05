---
name: dps-master
description: Dar de alta uno de los 35 maestros/catálogos de la plataforma Detroit Power System de punta a punta — schema, CRUD backend, importador, búsqueda difusa, creación inline y pantalla de administración. Úsalo cuando toque implementar clients, engines, engineModels, engineSpecs, technicians, instruments, spareParts u otro catálogo del §13.
---

# Dar de alta un maestro

Los 35 maestros están catalogados en §13.1 de `docs/especificacionplataformainformestecnicos.md`,
con su priorización por fase en §13.2. **No inventes campos**: usa los del catálogo y los que
aparecen en los informes reales.

## 1. Backend — se apoya en el módulo genérico

El proyecto tiene un `MastersModule` genérico que resuelve CRUD, paginación, búsqueda y auditoría.
Un maestro nuevo aporta solo su _definición_:

```ts
export const enginesMaster: MasterDefinition<Engine> = {
  collection: 'engines',
  schema: EngineSchema,
  naturalKey: ['serie'], // clave natural → índice único
  searchFields: ['serie', 'modelo.denominacion'],
  requiredPermissions: { read: 'masters:read', write: 'masters:engines:write' },
  inlineCreate: { allowedFields: ['serie', 'engineModelId'] }, // §13.3.1
  importable: true,
  softDelete: true,
};
```

Endpoints que quedan disponibles automáticamente:
`GET|POST /masters/:collection` · `PATCH /masters/:collection/:id` ·
`POST /masters/:collection/merge` · `POST /masters/:collection/import`.

## 2. Los seis requisitos de UX transversales (§13.3) — todos obligatorios

1. **Creación inline desde el formulario.** Un botón "+ Crear" abre un modal mínimo sin perder el
   informe en curso. El registro nace con `pendienteValidacion: true`.
   > Sin esto los usuarios vuelven al texto libre y el proyecto fracasa. No es opcional.
2. **Búsqueda tolerante a errores.** Índice de texto + normalización (sin tildes, mayúsculas,
   espacios colapsados) + distancia de edición. `KOMATZU` debe sugerir `KOMATSU`.
3. **Merge de duplicados** para Administrador, reasignando todas las referencias en una transacción.
4. **Importación masiva Excel/CSV** con validación previa y reporte de errores fila a fila.
   El equipo construye el importador; el negocio aporta los datos.
5. **Soft delete + auditoría.** Nada se borra si tiene informes asociados.
6. **Vista de uso.** Al abrir un equipo, ver sus informes; al abrir un instrumento, ver dónde se
   usó y si su calibración estaba vigente en esa fecha.

## 3. Maestros que alimentan el motor de mediciones (⭐ cuidado especial)

| Maestro            | Por qué es crítico                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `engineModels`     | `cilindros`, `apoyosBancada`, `bancos`, `tieneCac`, `tieneTurbos` **determinan el número de columnas de cada grilla**. Un dato mal cargado produce una grilla incorrecta |
| `engines`          | La `serie` es la clave natural y el eje de toda la analítica histórica                                                                                                   |
| `engineSpecs`      | `nominal`, `tolInf`, `tolSup` por parámetro y modelo. Índice único `{engineModelId, parametro}`                                                                          |
| `instruments`      | Fecha de calibración y vencimiento → regla RN-04                                                                                                                         |
| `engineComponents` | Enlaza bloques de trabajo con veredictos y con la analítica de cambios                                                                                                   |

> Los valores de `engineSpecs` cargados desde los informes son **provisionales** hasta que se
> validen contra el manual MTU (decisión abierta D1). Márcalos con `fuente` y `provisional: true`.

## 4. Frontend

- Pantalla de administración: tabla compacta (alto de fila 36 px) con búsqueda, filtros, alta/edición
  en panel lateral y acciones de importar / fusionar.
- Selector en formularios: `dps-master-select` con autocompletado, búsqueda difusa, carga diferida
  y botón "+ Crear" integrado.
- Cascada Cliente → Sede → Equipo → Motor: cada nivel filtra al siguiente y, al elegir el motor,
  resuelve automáticamente cilindros, apoyos, nominales y tolerancias (§14.1, paso 1).
- Los maestros más usados se cachean en IndexedDB para el modo offline (§18).

## 5. Definición de terminado

- [ ] Schema con índices y clave natural única
- [ ] Definición registrada en `MastersModule`
- [ ] Creación inline funcionando **sin perder el borrador en curso**
- [ ] Búsqueda difusa probada con un typo real de los informes
- [ ] Importador con reporte de errores
- [ ] Merge de duplicados reasignando referencias
- [ ] Vista de uso
- [ ] Pantalla de administración conforme a `.claude/DESIGN-SYSTEM.md`
- [ ] Incluido en la sincronización offline si es un maestro de captura
