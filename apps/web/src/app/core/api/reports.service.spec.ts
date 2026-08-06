import { HttpClient, type HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MastersService } from './masters.service';
import { ReportsService, TemplatesService } from './reports.service';

/**
 * Contratos con la API.
 *
 * Se comprueba lo que rompería en silencio si cambiara: las rutas, y sobre todo
 * que los filtros vacíos no viajen. Un `?estado=` o un `?q=null` no filtra por
 * nada en unos servidores y por cadena vacía en otros.
 */
describe('Servicios de API', () => {
  let http: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  /** Params de la enésima llamada a GET. */
  const paramsDe = (indice = 0): HttpParams => {
    const llamada = http.get.mock.calls[indice] as unknown[] | undefined;
    if (!llamada) throw new Error(`No hubo llamada GET en la posición ${indice}.`);
    return (llamada[1] as { params: HttpParams }).params;
  };

  beforeEach(() => {
    http = {
      get: vi.fn().mockReturnValue(of({ total: 0, items: [] })),
      post: vi.fn().mockReturnValue(of({})),
      patch: vi.fn().mockReturnValue(of({})),
      delete: vi.fn().mockReturnValue(of({})),
    };
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: http }] });
  });

  describe('ReportsService', () => {
    let api: ReportsService;
    beforeEach(() => (api = TestBed.inject(ReportsService)));

    it('no manda filtros vacíos', async () => {
      await api.list({ q: '', estado: null, clienteId: undefined, motorId: 'm1' });

      const params = paramsDe();
      expect(params.has('q')).toBe(false);
      expect(params.has('estado')).toBe(false);
      expect(params.has('clienteId')).toBe(false);
      expect(params.get('motorId')).toBe('m1');
    });

    it('reordena por índices, que es lo que producen el ratón y el teclado', async () => {
      await api.reorder('r1', 2, 0);
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/reports/r1/bloques/reordenar'),
        {
          desde: 2,
          hasta: 0,
        },
      );
    });

    it('el autoguardado va por PATCH con solo lo que cambió', async () => {
      await api.patch('r1', { 'datos.motivo': 'QL4' });
      expect(http.patch).toHaveBeenCalledWith(expect.stringContaining('/reports/r1'), {
        'datos.motivo': 'QL4',
      });
    });

    it('cada operación pega en su ruta', async () => {
      await api.findById('r1');
      expect(http.get).toHaveBeenCalledWith(expect.stringContaining('/reports/r1'));

      await api.validate('r1');
      expect(http.get).toHaveBeenCalledWith(expect.stringContaining('/reports/r1/validacion'));

      await api.addBlock('r1', { clave: 'trabajos' });
      expect(http.post).toHaveBeenCalledWith(expect.stringContaining('/reports/r1/bloques'), {
        clave: 'trabajos',
      });

      await api.updateBlock('r1', 'b1', { texto: 'x' });
      expect(http.patch).toHaveBeenCalledWith(expect.stringContaining('/reports/r1/bloques/b1'), {
        texto: 'x',
      });

      await api.removeBlock('r1', 'b1');
      expect(http.delete).toHaveBeenCalledWith(expect.stringContaining('/reports/r1/bloques/b1'));

      await api.transition('r1', 'emitido', 'listo');
      expect(http.post).toHaveBeenCalledWith(expect.stringContaining('/reports/r1/estado'), {
        estado: 'emitido',
        comentario: 'listo',
      });
    });
  });

  describe('MastersService', () => {
    let api: MastersService;
    beforeEach(() => (api = TestBed.inject(MastersService)));

    it('recorta la consulta y descarta filtros nulos', async () => {
      await api.search('sites', {
        q: '  taller  ',
        limit: 20,
        filtros: { clienteId: 'c1', sedeId: null },
      });

      const params = paramsDe();
      expect(params.get('q')).toBe('taller');
      expect(params.get('limit')).toBe('20');
      expect(params.get('clienteId')).toBe('c1');
      expect(params.has('sedeId')).toBe(false);
    });

    it('una consulta en blanco no viaja: el servidor devolvería lo mismo sin ella', async () => {
      await api.search('clients', { q: '   ' });
      expect(paramsDe().has('q')).toBe(false);
    });

    it('el alta rápida va marcada como tal', async () => {
      await api.createInline('sites', { nombre: 'TALLER' });
      // Sin `inline=true` el servidor exigiría todos los campos y el técnico
      // tendría que salir del informe a completarlos (§13.3.1).
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/masters/sites?inline=true'),
        {
          nombre: 'TALLER',
        },
      );
    });
  });

  describe('TemplatesService', () => {
    let api: TemplatesService;
    beforeEach(() => (api = TestBed.inject(TemplatesService)));

    it('distingue la versión vigente de una concreta', async () => {
      await api.vigente('SER-FOR-002');
      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining('/templates/SER-FOR-002/vigente'),
      );

      // Un informe emitido se pinta con la suya, no con la vigente hoy (§11.1).
      await api.version('SER-FOR-002', 'v01');
      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining('/templates/SER-FOR-002/versiones/v01'),
      );
    });
  });
});
