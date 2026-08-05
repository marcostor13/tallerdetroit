---
name: dps-api
description: Crear o modificar un módulo de dominio del backend NestJS de la plataforma Detroit Power System (controller, service, schema Mongoose, DTOs, RBAC, auditoría, tests). Úsalo al añadir endpoints, colecciones, reglas de negocio o validaciones en apps/api o apps/worker.
---

# Crear un módulo de dominio en `apps/api`

## 1. Estructura obligatoria

```
apps/api/src/<dominio>/
├── <dominio>.module.ts
├── <dominio>.controller.ts      # solo HTTP: valida, delega, mapea respuesta
├── <dominio>.service.ts         # reglas de negocio; no conoce HTTP
├── <dominio>.repository.ts      # acceso a Mongo (opcional si el service es trivial)
├── dto/
│   ├── create-<x>.dto.ts
│   ├── update-<x>.dto.ts
│   └── query-<x>.dto.ts
├── schemas/<x>.schema.ts
└── <dominio>.service.spec.ts
```

Los dominios son los de §15.3 de la especificación: `auth`, `users`, `masters`, `work-orders`,
`templates`, `reports`, `measurements`, `media`, `documents`, `sequences`, `sync`, `analytics`,
`audit`, `notifications`, `integrations`.

## 2. Controller

```ts
@ApiTags('reports')
@ApiBearerAuth()
@Controller({ path: 'reports', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @Permissions('reports:create')
  @ApiOperation({ summary: 'Crea un informe en borrador y reserva su correlativo' })
  create(@Body() dto: CreateReportDto, @CurrentUser() user: AuthUser) {
    return this.reports.create(dto, user);
  }
}
```

Reglas:

- **RBAC solo por decorador `@Permissions()`.** Nunca `if (user.role === 'admin')` disperso en servicios.
- El _scoping_ por unidad de negocio (RN-07) se aplica en el repositorio, no en el controller.
- Toda ruta documentada con `@ApiOperation` y DTOs con `@ApiProperty`.
- Errores en formato RFC 7807 (`application/problem+json`) — usa el `ProblemDetailsFilter` común.
- Paginación por cursor, nunca `skip/limit` sobre colecciones grandes.
- `If-Match` / `ETag` en las mutaciones de `reports` (concurrencia optimista).

## 3. DTOs

`class-validator` en todos los campos. El DTO es la única puerta de entrada de datos externos.

```ts
export class CreateReportDto {
  @ApiProperty() @IsMongoId() templateVersionId!: string;
  @ApiProperty() @IsMongoId() engineId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) antecedentes?: string;
}
```

`ValidationPipe` global con `whitelist: true, forbidNonWhitelisted: true, transform: true`.

## 4. Schemas Mongoose

- **El informe es el agregado**: bloques, metadatos de fotos y mediciones van _embebidos_ en `reports`.
- Maestros: se guarda `{ id: ObjectId, ...snapshot }`. Un informe emitido no cambia si el maestro cambia.
- **Ningún binario en Mongo.** Solo clave S3 + metadatos.
- Declara los índices en el schema (`@Schema({ ... })` + `schema.index(...)`), no a mano en Atlas.
- Soft delete con `deletedAt`; nada se borra si tiene informes asociados.
- Campos de auditoría en todos los documentos: `createdBy`, `updatedBy`, `createdAt`, `updatedAt`.

## 5. Reglas críticas que el código debe hacer cumplir

| ID    | Regla                                                                                   | Dónde vive                         |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| RN-01 | El número de informe nunca se reutiliza, ni si se anula                                 | `sequences.service`                |
| RN-02 | Un informe `emitido` es inmutable; corregir = nueva versión que referencia la anterior  | `reports.service`                  |
| RN-03 | No emitir con mediciones fuera de tolerancia sin justificación del supervisor           | `reports.service` + `measurements` |
| RN-04 | No emitir usando un instrumento con calibración vencida (salvable por Admin con motivo) | `reports.service`                  |
| RN-05 | Horas del motor no menores que el informe anterior del mismo motor (advertencia)        | `reports.service`                  |
| RN-06 | Toda foto con caption; `Fig.NN` calculada y recalculada al reordenar                    | `reports.service`                  |
| RN-07 | Técnico ve solo lo suyo; supervisor, lo de su unidad de negocio                         | `reports.repository`               |
| RN-08 | Al emitir se persiste `templateSnapshot`; el render nunca consulta la plantilla viva    | `reports.service`                  |

## 6. Correlativos

**Decisión D3: no hay generador.** El número de informe y el de OT los escribe el
usuario. El backend valida el formato y **la unicidad** con un índice único sobre
`numeroInforme`, devolviendo un 409 con un mensaje claro si ya existe.

Si el negocio fija más adelante la convención de `ITS-T-E-26-003-0898`, el
generador se implementa con asignación atómica — nunca leer, incrementar y
escribir en pasos separados:

```ts
const seq = await this.model.findOneAndUpdate(
  { tipo, anio },
  { $inc: { contador: 1 } },
  { new: true, upsert: true, setDefaultsOnInsert: true },
);
```

## 7. Auditoría

Toda mutación de negocio emite un registro append-only:

```ts
await this.audit.record({
  actorId: user.id,
  accion: 'report.transition',
  entidad: 'reports',
  entidadId: id,
  antes: { estado: prev },
  despues: { estado: next },
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});
```

`auditLogs` no admite `update` ni `delete`. TTL de 7 años.

## 8. Trabajo pesado → worker

Render de PDF/DOCX, derivados de imagen, thumbnails y notificaciones **no corren en la API**:
se encolan en BullMQ y los consume `apps/worker`. Chromium consume 300–600 MB por render; si
corre dentro de la API, un informe de 60 fotos tumba el servicio para todos.

## 9. Tests

- Unitarios del service con mocks del repositorio.
- Integración con `mongodb-memory-server` para lo que toca índices, transacciones o agregaciones.
- Cobertura mínima del backend: **70%** (NFR-11).
- Todo bug corregido entra con un test que falla antes del fix.
