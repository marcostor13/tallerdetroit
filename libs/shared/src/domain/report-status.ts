/**
 * Máquina de estados del informe (§14.2 de la especificación).
 *
 *                   ┌──────────── observado ◄───────┐
 *                   ▼                                │
 * borrador ──► en_revision ──► aprobado ──► emitido  │
 *     ▲             │                          │     │
 *     └─────────────┘                          ▼     │
 *                                           anulado ─┘
 */
export const REPORT_STATUSES = [
  'borrador',
  'en_revision',
  'observado',
  'aprobado',
  'emitido',
  'anulado',
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Transiciones permitidas y el permiso que las habilita.
 * Es la única fuente de verdad: backend y frontend la consumen desde aquí para
 * que la UI nunca ofrezca una acción que el servidor va a rechazar.
 */
export interface StatusTransition {
  readonly from: ReportStatus;
  readonly to: ReportStatus;
  readonly permission: string;
  /** Exige comentario del actor para poder ejecutarse. */
  readonly requiresComment: boolean;
  readonly description: string;
}

export const REPORT_TRANSITIONS: readonly StatusTransition[] = [
  {
    from: 'borrador',
    to: 'en_revision',
    permission: 'reports:submit',
    requiresComment: false,
    description: 'Valida la completitud obligatoria y envía a revisión',
  },
  {
    from: 'en_revision',
    to: 'observado',
    permission: 'reports:review',
    requiresComment: true,
    description: 'Requiere al menos un comentario anclado a un bloque',
  },
  {
    from: 'observado',
    to: 'en_revision',
    permission: 'reports:submit',
    requiresComment: false,
    description: 'Reenvío tras atender las observaciones',
  },
  {
    from: 'en_revision',
    to: 'aprobado',
    permission: 'reports:approve',
    requiresComment: false,
    description: 'Registra la firma de revisión',
  },
  {
    from: 'aprobado',
    to: 'emitido',
    permission: 'reports:issue',
    requiresComment: false,
    description: 'Congela el snapshot, genera PDF + DOCX y calcula el hash',
  },
  {
    // Atajo de F1 (E1.9). El flujo de revisión completo llega en F3; hasta
    // entonces el supervisor emite directamente desde el borrador, porque la
    // alternativa sería dejar los informes atascados en un estado sin salida.
    // Cuando F3 incorpore la revisión, esta transición debe retirarse: si se
    // queda, convive con el flujo formal y permite emitir sin que nadie revise.
    from: 'borrador',
    to: 'emitido',
    permission: 'reports:issue',
    requiresComment: false,
    description: 'Atajo de F1: congela el snapshot y genera el PDF sin pasar por revisión',
  },
  {
    from: 'borrador',
    to: 'anulado',
    permission: 'reports:void',
    requiresComment: true,
    description: 'Motivo obligatorio; conserva el historial',
  },
  {
    from: 'en_revision',
    to: 'anulado',
    permission: 'reports:void',
    requiresComment: true,
    description: 'Motivo obligatorio; conserva el historial',
  },
  {
    from: 'observado',
    to: 'anulado',
    permission: 'reports:void',
    requiresComment: true,
    description: 'Motivo obligatorio; conserva el historial',
  },
  {
    from: 'aprobado',
    to: 'anulado',
    permission: 'reports:void',
    requiresComment: true,
    description: 'Motivo obligatorio; conserva el historial',
  },
  {
    from: 'emitido',
    to: 'anulado',
    permission: 'reports:void',
    requiresComment: true,
    description: 'Motivo obligatorio; el documento emitido se conserva',
  },
];

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export function transitionsFrom(from: ReportStatus): readonly StatusTransition[] {
  return REPORT_TRANSITIONS.filter((t) => t.from === from);
}

/** RN-02: un informe emitido es inmutable; corregirlo genera una nueva versión. */
export function isImmutable(status: ReportStatus): boolean {
  return status === 'emitido' || status === 'anulado';
}
