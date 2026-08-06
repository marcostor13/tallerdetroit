/**
 * Definición de SER-FOR-002 v01 — el formato que hoy es un Word.
 *
 * No es una plantilla inventada: cada sección sale de comparar los dos informes
 * reales, OT-746 (motor MTU 20V4000C23 del camión VQT-130) y el ITS-T-E-26-898
 * de Toquepala. Lo que aparece en los dos es obligatorio; lo que aparece solo en
 * uno lleva su regla de visibilidad.
 *
 * El criterio de aceptación de F1 es exactamente este: reproducir los dos
 * informes **sin tocar código**, componiendo bloques distintos. Si esta
 * definición necesitara un `if` en TypeScript para el segundo informe, el motor
 * de plantillas no serviría para el tercero.
 *
 * Vive en `libs/shared` y no en una semilla del backend porque el frontend la
 * necesita para pintar el wizard en modo offline, antes de hablar con la API.
 */

import type { TemplateVersionDefinition } from './templates';

export const SER_FOR_002_V01: TemplateVersionDefinition = {
  codigo: 'SER-FOR-002',
  version: 'v01',
  nombre: 'Informe técnico general',
  estado: 'publicada',
  secciones: [
    {
      clave: 'datos-generales',
      numeral: 'I',
      titulo: 'Datos generales',
      orden: 1,
      paso: 1,
      bloques: [
        {
          clave: 'identificacion',
          tipo: 'header_meta',
          titulo: 'Identificación del informe',
          orden: 1,
          obligatorio: true,
          config: {
            // El número se escribe a mano hasta que el negocio fije la
            // convención de correlativos (decisión D3). La plataforma valida
            // formato y unicidad, no lo genera.
            campos: [
              { clave: 'numeroInforme', etiqueta: 'N° de informe', tipo: 'texto', requerido: true },
              { clave: 'numeroOt', etiqueta: 'N° de O/T', tipo: 'texto', requerido: true },
              {
                clave: 'fechaEmision',
                etiqueta: 'Fecha de emisión',
                tipo: 'fecha',
                requerido: true,
              },
              {
                clave: 'clienteId',
                etiqueta: 'Cliente',
                tipo: 'maestro',
                maestro: 'clients',
                requerido: true,
              },
              {
                clave: 'sedeId',
                etiqueta: 'Ubicación',
                tipo: 'maestro',
                maestro: 'sites',
                dependeDe: 'clienteId',
                requerido: true,
              },
            ],
          },
        },
        {
          clave: 'participantes',
          tipo: 'header_meta',
          titulo: 'Elaborado por / Dirigido a',
          orden: 2,
          obligatorio: true,
          ayuda: 'El cargo se autocompleta desde el maestro de técnicos.',
          config: {
            campos: [
              {
                clave: 'elaboradoPor',
                etiqueta: 'Elaborado por',
                tipo: 'maestro',
                maestro: 'technicians',
                multiple: true,
                requerido: true,
              },
              {
                clave: 'dirigidoA',
                etiqueta: 'Dirigido a',
                tipo: 'maestro',
                maestro: 'technicians',
                requerido: true,
              },
            ],
          },
        },
      ],
    },
    {
      clave: 'datos-equipo',
      numeral: 'II',
      titulo: 'Datos del equipo y del motor',
      orden: 2,
      paso: 1,
      bloques: [
        {
          clave: 'equipo-motor',
          tipo: 'equipment_meta',
          titulo: 'Equipo y motor',
          orden: 1,
          obligatorio: true,
          ayuda:
            'Al elegir el motor por su número de serie quedan resueltos cilindros, apoyos, ' +
            'potencia y las tolerancias de las grillas de medición.',
          config: {
            cascada: ['clienteId', 'sedeId', 'equipoId', 'motorId'],
            derivadosDelMotor: ['marca', 'modelo', 'cilindros', 'apoyosBancada', 'potencia'],
          },
        },
      ],
    },
    {
      clave: 'contexto',
      numeral: 'III',
      titulo: 'Contexto del servicio',
      orden: 3,
      paso: 2,
      bloques: [
        {
          clave: 'servicio',
          tipo: 'header_meta',
          titulo: 'Motivo e intervención',
          orden: 1,
          obligatorio: true,
          config: {
            campos: [
              {
                clave: 'tipoIntervencionId',
                etiqueta: 'Tipo de reparación',
                tipo: 'maestro',
                maestro: 'intervention-types',
                requerido: true,
              },
              { clave: 'motivo', etiqueta: 'Motivo', tipo: 'texto' },
              { clave: 'horasTotales', etiqueta: 'Horas totales', tipo: 'numero', requerido: true },
              { clave: 'horasParciales', etiqueta: 'Horas parciales', tipo: 'numero' },
              { clave: 'fechaInicio', etiqueta: 'Fecha de inicio', tipo: 'fecha' },
              { clave: 'fechaFin', etiqueta: 'Fecha de término', tipo: 'fecha' },
              { clave: 'informeAnteriorId', etiqueta: 'Último mantenimiento', tipo: 'informe' },
              { clave: 'enGarantia', etiqueta: 'En garantía', tipo: 'booleano' },
            ],
          },
        },
        {
          clave: 'antecedentes',
          tipo: 'rich_text',
          titulo: 'Antecedentes',
          orden: 2,
          obligatorio: true,
          config: { formatos: ['negrita', 'vinetas'], maxCaracteres: 4000 },
        },
      ],
    },
    {
      clave: 'parametros-ecu',
      numeral: 'IV',
      titulo: 'Parámetros ECU',
      orden: 4,
      paso: 2,
      // El prototipo mostraba este panel siempre. Pedir rpm, kW, frecuencia y
      // aislamiento de generador en la evaluación de un motor de camión minero
      // es ruido que el técnico tiene que saltarse en cada informe.
      visibleSi: "equipo.categoria == 'grupo_electrogeno'",
      bloques: [
        {
          clave: 'parametros-ecu',
          tipo: 'parameters_panel',
          titulo: 'Parámetros de la ECU',
          orden: 1,
          config: { grupo: 'grupo_electrogeno' },
        },
      ],
    },
    {
      clave: 'trabajos',
      numeral: 'V',
      titulo: 'Trabajos realizados',
      orden: 5,
      paso: 3,
      bloques: [
        {
          clave: 'trabajos',
          tipo: 'work_task',
          titulo: 'Trabajo realizado',
          orden: 1,
          obligatorio: true,
          ayuda: 'Un bloque por trabajo: «DESMONTAJE DE PISTONES», «DESMONTAJE DE CULATAS»…',
          config: {
            campos: [
              'fechaTrabajo',
              'titulo',
              'texto',
              'componenteId',
              'veredicto',
              'accionRecomendada',
            ],
            admiteFotos: true,
            admiteMediciones: true,
          },
        },
      ],
    },
    {
      clave: 'mediciones',
      numeral: 'VI',
      titulo: 'Mediciones dimensionales',
      orden: 6,
      paso: 3,
      // Las grillas llegan en F2. La sección se declara aquí para que el orden
      // del documento no cambie cuando aparezcan: un informe de F1 y uno de F2
      // tienen que salir con la misma numeración de secciones.
      visibleSi: 'informe.mediciones.length > 0',
      bloques: [
        {
          clave: 'mediciones',
          tipo: 'measurement_grid',
          titulo: 'Tabla dimensional',
          orden: 1,
          config: { resolverColumnasDesde: 'motor.modeloId' },
        },
      ],
    },
    {
      clave: 'tercerizados',
      numeral: 'VII',
      titulo: 'Componentes tercerizados',
      orden: 7,
      paso: 4,
      visibleSi: 'informe.tercerizados.length > 0',
      bloques: [
        {
          clave: 'tercerizados',
          tipo: 'items_table',
          titulo: 'Componentes enviados a terceros',
          orden: 1,
          config: {
            columnas: [
              { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true },
              { clave: 'supplierId', etiqueta: 'Proveedor', tipo: 'maestro', maestro: 'suppliers' },
            ],
          },
        },
      ],
    },
    {
      clave: 'repuestos',
      numeral: 'VIII',
      titulo: 'Repuestos e instrumentos',
      orden: 8,
      paso: 4,
      bloques: [
        {
          clave: 'repuestos',
          tipo: 'items_table',
          titulo: 'Repuestos utilizados',
          orden: 1,
          config: {
            columnas: [
              {
                clave: 'sparePartId',
                etiqueta: 'Repuesto',
                tipo: 'maestro',
                maestro: 'spare-parts',
              },
              { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true },
              { clave: 'np', etiqueta: 'N/P', tipo: 'texto' },
              { clave: 'cantidad', etiqueta: 'Cantidad', tipo: 'numero', requerido: true },
            ],
          },
        },
        {
          clave: 'instrumentos',
          tipo: 'items_table',
          titulo: 'Instrumentos empleados',
          orden: 2,
          ayuda:
            'La plataforma avisa si un instrumento no tenía calibración vigente en la fecha del trabajo.',
          config: {
            columnas: [
              {
                clave: 'instrumentId',
                etiqueta: 'Instrumento',
                tipo: 'maestro',
                maestro: 'instruments',
              },
              { clave: 'codigo', etiqueta: 'Código', tipo: 'texto' },
              { clave: 'marca', etiqueta: 'Marca', tipo: 'texto' },
              { clave: 'serie', etiqueta: 'Serie', tipo: 'texto' },
            ],
            verificarCalibracion: true,
          },
        },
      ],
    },
    {
      clave: 'registro-fotografico',
      numeral: 'IX',
      titulo: 'Registro fotográfico',
      orden: 9,
      paso: 3,
      // Las fotos van dentro de cada trabajo; esta sección recoge las que no
      // pertenecen a ninguno en concreto.
      bloques: [
        {
          clave: 'registro-fotografico',
          tipo: 'photo_grid',
          titulo: 'Fotografías',
          orden: 1,
          config: { columnas: 2, captionObligatorio: true },
        },
      ],
    },
    {
      clave: 'conclusiones',
      numeral: 'X',
      titulo: 'Conclusiones y recomendaciones',
      orden: 10,
      paso: 5,
      bloques: [
        {
          clave: 'conclusiones',
          tipo: 'bullet_list',
          titulo: 'Conclusiones',
          orden: 1,
          obligatorio: true,
          ayuda: 'Se pre-pueblan desde los veredictos de cada trabajo.',
          config: { biblioteca: 'conclusiones', prepoblarDesdeVeredictos: true },
        },
        {
          clave: 'recomendaciones',
          tipo: 'bullet_list',
          titulo: 'Recomendaciones',
          orden: 2,
          obligatorio: true,
          config: { biblioteca: 'recomendaciones' },
        },
      ],
    },
    {
      clave: 'firmas',
      numeral: 'XI',
      titulo: 'Firmas',
      orden: 11,
      paso: 6,
      bloques: [
        {
          clave: 'firmas',
          tipo: 'signature_block',
          titulo: 'Realizado por / Revisado por',
          orden: 1,
          config: { roles: ['realizado_por', 'revisado_por'] },
        },
      ],
    },
  ],
};
