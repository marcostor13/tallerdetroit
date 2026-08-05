import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import type { ProblemDetails } from '../../core/auth/auth.models';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { LogoComponent } from '../../shared/ui/logo/logo.component';
import { ThemeToggleComponent } from '../../shared/ui/theme-toggle/theme-toggle.component';

@Component({
  selector: 'dps-login-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FieldComponent,
    IconComponent,
    LogoComponent,
    ThemeToggleComponent,
  ],
  templateUrl: './login.page.html',
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly serverError = signal('');
  protected readonly showPassword = signal(false);

  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(12)]],
  });

  /**
   * Los errores solo se muestran tras intentar enviar o al salir del campo:
   * marcar en rojo mientras el usuario aún escribe es hostil.
   */
  protected readonly emailError = computed(() => {
    const c = this.form.controls.email;
    if (!this.submitted() && !c.touched) return '';
    if (c.hasError('required')) return 'Escribe tu correo corporativo.';
    if (c.hasError('email')) return 'El correo debe tener el formato nombre@empresa.com.';
    return '';
  });

  protected readonly passwordError = computed(() => {
    const c = this.form.controls.password;
    if (!this.submitted() && !c.touched) return '';
    if (c.hasError('required')) return 'Escribe tu contraseña.';
    if (c.hasError('minlength')) return 'La contraseña tiene al menos 12 caracteres.';
    return '';
  });

  // Se recalculan al enviar; `signal` las expone al template con OnPush.
  private readonly touchTick = signal(0);

  protected markTouched(): void {
    this.touchTick.update((v) => v + 1);
  }

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.serverError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }

    this.submitting.set(true);
    try {
      await this.auth.login(this.form.getRawValue());
      const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') ?? '/inicio';
      await this.router.navigateByUrl(redirectTo);
    } catch (error: unknown) {
      this.serverError.set(this.describe(error));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Lleva el foco al primer campo con error (UX-07).
   *
   * Se resuelve contra los controles del formulario y no consultando el DOM por
   * `aria-invalid`: en modo zoneless ese atributo aún no está pintado en el
   * momento del envío, así que la búsqueda no encontraría nada.
   */
  private focusFirstInvalid(): void {
    const candidates: readonly [boolean, HTMLInputElement | undefined][] = [
      [this.form.controls.email.invalid, this.emailInput()?.nativeElement],
      [this.form.controls.password.invalid, this.passwordInput()?.nativeElement],
    ];
    candidates.find(([invalid]) => invalid)?.[1]?.focus();
  }

  private describe(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'No se pudo completar el inicio de sesión. Inténtalo de nuevo.';
    }
    if (error.status === 0) {
      return 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
    }
    if (error.status === 401) {
      return 'Correo o contraseña incorrectos.';
    }
    if (error.status === 423) {
      return 'La cuenta está bloqueada por intentos fallidos. Espera 15 minutos o contacta al administrador.';
    }
    const problem = error.error as ProblemDetails | null;
    return problem?.detail ?? problem?.title ?? 'Ocurrió un error inesperado.';
  }
}
