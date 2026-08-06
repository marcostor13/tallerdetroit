import type { Schema as MongooseSchema } from 'mongoose';
import type { Permission } from '@dps/shared';
import { ClientSchema } from './schemas/client.schema';
import { SiteSchema } from './schemas/site.schema';
import { EquipmentSchema } from './schemas/equipment.schema';
import { EngineSchema } from './schemas/engine.schema';
import { EngineModelSchema } from './schemas/engine-model.schema';
import { EngineSpecSchema } from './schemas/engine-spec.schema';
import {
  ChecklistSchema,
  ComponentVerdictSchema,
  EngineComponentSchema,
  UnitSchema,
} from './schemas/measurement-catalogs.schema';
import { BusinessUnitSchema } from './schemas/business-unit.schema';
import { OrganizationSchema } from './schemas/organization.schema';
import {
  EngineBrandSchema,
  EquipmentBrandSchema,
  EquipmentModelSchema,
  InterventionTypeSchema,
  PositionSchema,
  TechnicianSchema,
} from './schemas/catalogs.schema';

/**
 * Definición de un maestro.
 *
 * Los 35 catálogos de §13 comparten comportamiento —listar, buscar, crear al
 * vuelo, fusionar duplicados, importar— así que se describen en lugar de
 * escribir 35 controladores iguales. Añadir un maestro nuevo es añadir una
 * entrada aquí.
 */
export interface MasterDefinition {
  /** Nombre en la URL: `/api/v1/masters/:collection`. */
  readonly key: string;
  /** Nombre del modelo de Mongoose. */
  readonly model: string;
  readonly schema: MongooseSchema;
  /** Cómo se le llama en los mensajes al usuario. */
  readonly label: string;
  /** Campos que identifican el registro para una persona. */
  readonly searchFields: readonly string[];
  /** Campo que se muestra en los desplegables. */
  readonly displayField: string;
  /** Referencias que acotan la cascada del wizard (`?clienteId=…`). */
  readonly filterFields?: readonly string[];
  /** Campos admitidos al crear al vuelo desde el formulario (§13.3.1). */
  readonly inlineFields?: readonly string[];
  readonly readPermission: Permission;
  readonly writePermission: Permission;
}

export const MASTERS: readonly MasterDefinition[] = [
  {
    key: 'clients',
    model: 'Client',
    schema: ClientSchema,
    label: 'cliente',
    searchFields: ['razonSocial', 'nombreCorto', 'ruc'],
    displayField: 'nombreCorto',
    inlineFields: ['razonSocial', 'nombreCorto', 'ruc'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'sites',
    model: 'Site',
    schema: SiteSchema,
    label: 'sede',
    searchFields: ['nombre', 'ciudad'],
    displayField: 'nombre',
    filterFields: ['clienteId'],
    inlineFields: ['nombre', 'clienteId', 'ciudad', 'tipo'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'equipments',
    model: 'Equipment',
    schema: EquipmentSchema,
    label: 'equipo',
    searchFields: ['codigo'],
    displayField: 'codigo',
    filterFields: ['clienteId', 'sedeId', 'categoria'],
    inlineFields: ['codigo', 'clienteId', 'sedeId', 'categoria', 'marcaId', 'modeloId'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'engines',
    model: 'Engine',
    schema: EngineSchema,
    label: 'motor',
    searchFields: ['serie'],
    displayField: 'serie',
    filterFields: ['modeloId', 'equipoActualId', 'estado'],
    inlineFields: ['serie', 'modeloId', 'horasTotales'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'engine-models',
    model: 'EngineModel',
    schema: EngineModelSchema,
    label: 'modelo de motor',
    searchFields: ['denominacion'],
    displayField: 'denominacion',
    filterFields: ['marcaId'],
    // Sin creación inline: de estos campos dependen las grillas de medición
    // (§12.2), así que un alta al vuelo con datos a medias produciría grillas
    // incorrectas. Lo da de alta Administración.
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  // --- Maestros técnicos del módulo de mediciones (F2, §12) ---
  {
    key: 'engine-specs',
    model: 'EngineSpec',
    schema: EngineSpecSchema,
    label: 'especificación de motor',
    searchFields: ['parametro', 'denominacion'],
    displayField: 'parametro',
    filterFields: ['engineModelId', 'provisional'],
    // Sin alta rápida: una tolerancia mal cargada no produce un aviso, produce
    // un informe que da por bueno un motor que no lo está. La carga es manual
    // y deliberada (decisión D1).
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'engine-components',
    model: 'EngineComponent',
    schema: EngineComponentSchema,
    label: 'componente de motor',
    searchFields: ['denominacion', 'clave'],
    displayField: 'denominacion',
    filterFields: ['grupo', 'padreId'],
    inlineFields: ['clave', 'denominacion', 'grupo'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'units',
    model: 'Unit',
    schema: UnitSchema,
    label: 'unidad de medida',
    searchFields: ['simbolo', 'denominacion'],
    displayField: 'simbolo',
    filterFields: ['magnitud'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'component-verdicts',
    model: 'ComponentVerdictMaster',
    schema: ComponentVerdictSchema,
    label: 'veredicto de componente',
    searchFields: ['denominacion', 'clave'],
    displayField: 'denominacion',
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'checklists',
    model: 'Checklist',
    schema: ChecklistSchema,
    label: 'inventario de desarmado',
    searchFields: ['denominacion', 'clave'],
    displayField: 'denominacion',
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'engine-brands',
    model: 'EngineBrand',
    schema: EngineBrandSchema,
    label: 'marca de motor',
    searchFields: ['nombre'],
    displayField: 'nombre',
    inlineFields: ['nombre'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'equipment-brands',
    model: 'EquipmentBrand',
    schema: EquipmentBrandSchema,
    label: 'marca de equipo',
    searchFields: ['nombre'],
    displayField: 'nombre',
    inlineFields: ['nombre'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'equipment-models',
    model: 'EquipmentModel',
    schema: EquipmentModelSchema,
    label: 'modelo de equipo',
    searchFields: ['denominacion'],
    displayField: 'denominacion',
    filterFields: ['marcaId'],
    inlineFields: ['denominacion', 'marcaId'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'intervention-types',
    model: 'InterventionType',
    schema: InterventionTypeSchema,
    label: 'tipo de intervención',
    searchFields: ['codigo', 'descripcion'],
    displayField: 'codigo',
    inlineFields: ['codigo', 'descripcion'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'technicians',
    model: 'Technician',
    schema: TechnicianSchema,
    label: 'técnico',
    searchFields: ['nombre', 'dni'],
    displayField: 'nombre',
    filterFields: ['unidadNegocioId', 'cargoId'],
    inlineFields: ['nombre', 'dni', 'cargoId', 'cargo'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'positions',
    model: 'Position',
    schema: PositionSchema,
    label: 'cargo',
    searchFields: ['denominacion'],
    displayField: 'denominacion',
    inlineFields: ['denominacion'],
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'business-units',
    model: 'BusinessUnit',
    schema: BusinessUnitSchema,
    label: 'unidad de negocio',
    searchFields: ['codigo', 'nombre'],
    displayField: 'nombre',
    readPermission: 'masters:read',
    writePermission: 'masters:write',
  },
  {
    key: 'organizations',
    model: 'Organization',
    schema: OrganizationSchema,
    label: 'razón social',
    searchFields: ['razonSocial', 'nombreCorto', 'ruc'],
    displayField: 'nombreCorto',
    // Alta manual desde administración (decisión D5).
    readPermission: 'masters:read',
    writePermission: 'settings:write',
  },
];

const PorClave = new Map(MASTERS.map((m) => [m.key, m]));

export function findMaster(key: string): MasterDefinition | undefined {
  return PorClave.get(key);
}

export const MASTER_KEYS = MASTERS.map((m) => m.key);
