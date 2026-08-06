import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { renderReportHtml, type TemplateVersionDefinition } from '@dps/shared';
import type { Informe } from '../../../core/api/reports.service';

/**
 * Vista previa fiel del documento (UX-06).
 *
 * No reimplementa nada: llama a `renderReportHtml` de `libs/shared`, que es
 * exactamente la misma función con la que el worker genera el PDF. Es la única
 * forma de que «lo que se ve es lo que sale» siga siendo cierto dentro de seis
 * meses; con dos renders paralelos, se separan al primer cambio en uno de ellos
 * y el técnico descubre la diferencia cuando el documento ya está entregado.
 *
 * Va dentro de un `iframe` con `srcdoc` porque la hoja del documento está
 * pensada para A4 y pisaría la de la aplicación —tipos en puntos, `@page`,
 * colores de tinta—. El `sandbox` sin `allow-scripts` deja el marco sin poder
 * ejecutar nada, aunque el HTML ya sale escapado del render.
 */
@Component({
  selector: 'dps-vista-previa',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (documento(); as html) {
      <iframe
        class="h-full w-full border border-subtle bg-white"
        title="Vista previa del informe tal como saldrá en el PDF"
        sandbox=""
        [srcdoc]="html"
      ></iframe>
    } @else {
      <p class="p-6 text-body-md text-secondary" role="status">
        La vista previa aparece cuando el informe tiene su plantilla cargada.
      </p>
    }
  `,
})
export class VistaPreviaComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly informe = input.required<Informe | null>();
  readonly plantilla = input.required<TemplateVersionDefinition | null>();
  /** Convierte una clave de S3 en una URL que el marco pueda cargar. */
  readonly resolverImagen = input<(clave: string) => string>((clave) => clave);

  protected readonly documento = computed<SafeHtml | null>(() => {
    const informe = this.informe();
    const plantilla = this.plantilla();
    if (!informe || !plantilla) return null;

    const html = renderReportHtml(
      {
        ...informe,
        cliente: informe.cliente ?? {},
        sede: informe.sede ?? {},
        bloques: informe.bloques,
      },
      plantilla,
      {
        resolverImagen: this.resolverImagen(),
        codigoFormato: informe.templateCodigo,
        versionFormato: informe.templateVersion,
      },
    );

    // El HTML lo produce nuestro propio render y ya escapa lo que escribe el
    // usuario; `srcdoc` exige marcarlo como confiable para que Angular no lo
    // vacíe. El `sandbox` vacío es la segunda barrera.
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });
}
