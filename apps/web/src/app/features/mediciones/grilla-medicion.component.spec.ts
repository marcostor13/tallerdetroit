import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  claveDeCelda,
  findMeasurementTemplate,
  type AppliedSpec,
  type EngineGridDimensions,
  type ValoresCapturados,
} from '@dps/shared';
import { GrillaMedicionComponent } from './grilla-medicion.component';

/** MTU 20V4000C23: 20 cilindros, 11 apoyos (§12.2). */
const MTU_20V: EngineGridDimensions = { cilindros: 20, apoyosBancada: 11, bancos: 2 };

const SPEC_TUNEL: AppliedSpec = {
  nominal: 171.0,
  tolInf: 0,
  tolSup: 0.025,
  unidad: 'mm',
  fuente: 'Informe OT898',
  provisional: true,
};

const plantilla = (codigo: string) => {
  const t = findMeasurementTemplate(codigo);
  if (!t) throw new Error(`No existe ${codigo}`);
  return t;
};

@Component({
  standalone: true,
  imports: [GrillaMedicionComponent],
  template: `
    <dps-grilla-medicion
      [plantilla]="plantillaActual()"
      [motor]="motor()"
      [valores]="valores()"
      [especificacion]="spec()"
      (cambio)="aplicar($event)"
    />
  `,
})
class Anfitrion {
  readonly plantillaActual = signal(plantilla('tunel_bancada'));
  readonly motor = signal(MTU_20V);
  readonly valores = signal<ValoresCapturados>({});
  readonly spec = signal<AppliedSpec | null>(SPEC_TUNEL);
  readonly cambios: Record<string, number | null>[] = [];

  aplicar(cambio: Record<string, number | null>): void {
    this.cambios.push(cambio);
    this.valores.update((v) => ({ ...v, ...cambio }));
  }
}

/**
 * La grilla de captura (§12.4).
 *
 * Lo que se prueba es lo que decide si el módulo se usa: que se capturen
 * ochenta valores seguidos sin tocar el ratón, y que el veredicto no dependa
 * solo del color.
 */
describe('GrillaMedicionComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;

  const celdas = (): HTMLInputElement[] => [
    ...fixture.nativeElement.querySelectorAll('input.dps-cell'),
  ];

  const celda = (fila: number, columna: number): HTMLInputElement => {
    const el = fixture.nativeElement.querySelector(
      `input[data-fila="${fila}"][data-columna="${columna}"]`,
    );
    if (!el) throw new Error(`No hay celda ${fila},${columna}`);
    return el as HTMLInputElement;
  };

  const pulsarEn = (input: HTMLInputElement, key: string) => {
    const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    input.dispatchEvent(evento);
    fixture.detectChanges();
    return evento;
  };

  const escribirEn = (input: HTMLInputElement, texto: string) => {
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Anfitrion] }).compileComponents();
    fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('dimensiones', () => {
    it('el túnel de bancada del 20V sale con 11 columnas y 33 celdas editables', () => {
      // Sin configurar nada: sale del modelo de motor (§12.2).
      expect(fixture.nativeElement.querySelectorAll('thead th')).toHaveLength(12); // + esquina
      expect(celdas()).toHaveLength(33);
    });

    it('con un 16V la misma grilla sale con 9 columnas', () => {
      anfitrion.motor.set({ cilindros: 16, apoyosBancada: 9, bancos: 2 });
      fixture.detectChanges();
      expect(celdas()).toHaveLength(27);
    });

    it('la ovalidad no es un campo: es una salida bloqueada', () => {
      // Que pareciera un campo invitaría a teclear en ella, y el informe diría
      // una cosa mientras los datos dicen otra.
      const calculadas = fixture.nativeElement.querySelectorAll('output.dps-cell--calculated');
      expect(calculadas).toHaveLength(11);
      expect(celdas().some((c) => c.getAttribute('data-fila') === '3')).toBe(false);
    });
  });

  describe('teclado (§12.4.5)', () => {
    it('las flechas recorren la matriz', () => {
      const primera = celda(0, 0);
      primera.focus();

      pulsarEn(primera, 'ArrowRight');
      expect(document.activeElement).toBe(celda(0, 1));

      pulsarEn(celda(0, 1), 'ArrowDown');
      expect(document.activeElement).toBe(celda(1, 1));

      pulsarEn(celda(1, 1), 'ArrowLeft');
      expect(document.activeElement).toBe(celda(1, 0));

      pulsarEn(celda(1, 0), 'ArrowUp');
      expect(document.activeElement).toBe(celda(0, 0));
    });

    it('Enter baja una fila y no envía el formulario', () => {
      const primera = celda(0, 0);
      primera.focus();
      const evento = pulsarEn(primera, 'Enter');

      expect(document.activeElement).toBe(celda(1, 0));
      // A media captura de ochenta valores, enviar el formulario sería
      // desastroso.
      expect(evento.defaultPrevented).toBe(true);
    });

    it('Inicio y Fin van a los extremos de la fila', () => {
      const media = celda(0, 5);
      media.focus();

      pulsarEn(media, 'End');
      expect(document.activeElement).toBe(celda(0, 10));

      pulsarEn(celda(0, 10), 'Home');
      expect(document.activeElement).toBe(celda(0, 0));
    });

    it('el recorrido se salta la fila calculada', () => {
      // b2 es la última editable; debajo está Ovalidad. Detenerse en una celda
      // bloqueada rompería la captura seguida.
      const ultima = celda(2, 0);
      ultima.focus();
      pulsarEn(ultima, 'ArrowDown');

      expect(document.activeElement).toBe(ultima);
    });

    it('no se sale por los bordes', () => {
      const esquina = celda(0, 0);
      esquina.focus();
      pulsarEn(esquina, 'ArrowUp');
      pulsarEn(esquina, 'ArrowLeft');
      expect(document.activeElement).toBe(esquina);
    });

    it('la flecha lateral mueve el cursor si hay texto que corregir', () => {
      // Quien está corrigiendo un dígito espera mover el cursor, no saltar de
      // celda. Solo salta cuando el cursor ya está en el extremo.
      const primera = celda(0, 0);
      escribirEn(primera, '171.020');
      primera.focus();
      primera.setSelectionRange(3, 3);

      const evento = pulsarEn(primera, 'ArrowLeft');
      expect(evento.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(primera);
    });

    it('con el contenido seleccionado la flecha navega, como en una hoja de cálculo', () => {
      // Al llegar a una celda su texto queda seleccionado. Si ahí la flecha se
      // limitara a deseleccionar, la captura seguida no avanzaría de columna.
      const primera = celda(0, 0);
      escribirEn(primera, '171.020');
      primera.focus();
      primera.setSelectionRange(0, primera.value.length);

      pulsarEn(primera, 'ArrowRight');
      expect(document.activeElement).toBe(celda(0, 1));
    });

    it('Escape deshace lo tecleado en la celda', () => {
      const primera = celda(0, 0);
      primera.focus();
      pulsarEn(primera, '1');
      escribirEn(primera, '999');

      pulsarEn(primera, 'Escape');
      expect(primera.value).toBe('');
    });
  });

  describe('captura', () => {
    it('emite el valor tecleado', () => {
      escribirEn(celda(0, 0), '171.020');
      expect(anfitrion.cambios.at(-1)).toEqual({ [claveDeCelda('a', '1')]: 171.02 });
    });

    it('acepta la coma decimal', () => {
      escribirEn(celda(0, 0), '171,020');
      expect(anfitrion.cambios.at(-1)).toEqual({ [claveDeCelda('a', '1')]: 171.02 });
    });

    it('vaciar una celda la deja sin valor, no en cero', () => {
      escribirEn(celda(0, 0), '171.020');
      escribirEn(celda(0, 0), '');
      expect(anfitrion.cambios.at(-1)).toEqual({ [claveDeCelda('a', '1')]: null });
    });

    it('un número a medio teclear no emite nada', () => {
      escribirEn(celda(0, 0), '171.020');
      const cuantos = anfitrion.cambios.length;

      // `Number('171.')` da 171: sin cuidado, a media escritura se emitiría un
      // valor fuera de tolerancia y el semáforo parpadearía en rojo.
      for (const aMedias of ['171.', '171,', '-', '']) {
        escribirEn(celda(0, 0), aMedias);
      }
      // Solo el vacío cuenta: es borrar la celda a propósito.
      expect(anfitrion.cambios).toHaveLength(cuantos + 1);
      expect(anfitrion.cambios.at(-1)).toEqual({ [claveDeCelda('a', '1')]: null });
    });

    it('admite valores negativos, que es como se anota una desviación', () => {
      escribirEn(celda(0, 0), '-0.01');
      expect(anfitrion.cambios.at(-1)).toEqual({ [claveDeCelda('a', '1')]: -0.01 });
    });

    it('la ovalidad se calcula sola al capturar a y b', () => {
      escribirEn(celda(0, 0), '171.000');
      escribirEn(celda(1, 0), '171.020');

      const ovalidad = fixture.nativeElement.querySelector('output.dps-cell--calculated');
      expect(ovalidad.textContent.trim()).toBe('0.020');
    });
  });

  describe('semáforo', () => {
    const claseDe = (fila: number, columna: number) => celda(fila, columna).className;

    it('marca dentro, alerta y fuera de tolerancia', () => {
      escribirEn(celda(0, 0), '171.010');
      escribirEn(celda(0, 1), '171.024');
      escribirEn(celda(0, 2), '171.040');

      expect(claseDe(0, 0)).toContain('dps-cell--ok');
      expect(claseDe(0, 1)).toContain('dps-cell--warn');
      expect(claseDe(0, 2)).toContain('dps-cell--out');
    });

    it('el veredicto va en palabras, no solo en color (WCAG 1.4.1)', () => {
      escribirEn(celda(0, 0), '171.040');

      // Un informe técnico se imprime, se fotocopia y lo leen personas con
      // daltonismo. El color solo no basta.
      expect(celda(0, 0).getAttribute('aria-label')).toContain('fuera de tolerancia');
      expect(celda(0, 0).getAttribute('aria-invalid')).toBe('true');
    });

    it('la celda dice dónde está y qué vale', () => {
      escribirEn(celda(0, 0), '171.010');
      const etiqueta = celda(0, 0).getAttribute('aria-label') ?? '';

      expect(etiqueta).toContain('a');
      expect(etiqueta).toContain('columna 1');
      expect(etiqueta).toContain('171.010');
    });

    it('una celda vacía se anuncia como sin capturar', () => {
      expect(celda(0, 5).getAttribute('aria-label')).toContain('sin capturar');
    });

    it('cuenta cuántas van y cuántas se han salido', () => {
      escribirEn(celda(0, 0), '171.010');
      escribirEn(celda(0, 1), '171.040');

      expect(fixture.nativeElement.textContent).toContain('2 / 33');
      expect(fixture.nativeElement.textContent).toContain('1 fuera de tolerancia');
    });
  });

  describe('referencia', () => {
    it('muestra el nominal y la tolerancia contra los que se mide', () => {
      // Sin ella, la grilla es una hoja de números sin significado.
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain('171');
      expect(texto).toContain('0.025');
    });

    it('avisa de que la tolerancia es provisional (D1)', () => {
      expect(fixture.nativeElement.textContent).toContain('Provisional');
    });

    it('sin especificación lo dice, en vez de fingir que evalúa', () => {
      anfitrion.spec.set(null);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Sin especificación cargada');
      escribirEn(celda(0, 0), '999');
      expect(celda(0, 0).className).not.toContain('dps-cell--out');
    });
  });

  describe('accesibilidad de la tabla', () => {
    it('las cabeceras declaran su ámbito', () => {
      expect(fixture.nativeElement.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(0);
      expect(fixture.nativeElement.querySelectorAll('th[scope="row"]').length).toBe(4);
    });

    it('explica cómo se maneja, para quien no ve la ayuda visual', () => {
      const caption = fixture.nativeElement.querySelector('caption');
      expect(caption.textContent).toMatch(/flechas/i);
      expect(caption.textContent).toMatch(/Control\+V/i);
    });

    it('las celdas admiten teclado numérico en móvil', () => {
      expect(celda(0, 0).getAttribute('inputmode')).toBe('decimal');
    });
  });
});
