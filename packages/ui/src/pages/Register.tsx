import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { registrationSchema } from '@club/shared';
import { ApiError, request } from '../api/client';
import { useAuth } from '../api/auth-context';
import { program } from '../theme';
import { CiField } from '../components/CiField';
import { TextField, Checkbox } from '../components/fields';
import { Button, Alert } from '../components/ui';
export function Component() {
  const location = useLocation();
  const state = location.state as { ci?: string } | null;
  const [ci, setCi] = useState(state?.ci ?? '');
  const [email, setEmail] = useState('');
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const mutation = useMutation({
    mutationFn: (body: unknown) => request<{ token: string }>('/auth/register', { body }),
    onSuccess: (r) => {
      auth.login(r.token);
      void navigate('/mi-club');
    },
  });
  const exists = mutation.error instanceof ApiError && mutation.error.code === 'CUSTOMER_EXISTS';
  return (
    <div className="narrow page">
      <span className="eyebrow text-brand-strong">EMPIEZA ALGO BUENO</span>
      <h1>Bienvenido a {program.displayName}.</h1>
      <p className="muted">Tu cédula. Tus compras. Tus recompensas.</p>
      <form
        className="card form-card"
        onSubmit={(e) => {
          e.preventDefault();
          const canal = params.get('canal');
          const body = registrationSchema.safeParse({
            ci,
            email,
            acceptPrivacyPolicy: accept,
            source: {
              channel: canal === 'qr' ? 'QR' : canal === 'social' ? 'SOCIAL' : 'DIRECT',
              ...(params.get('negocio') ? { businessId: params.get('negocio') } : {}),
            },
          });
          if (!body.success) {
            setError('Revisa tu cédula, correo y aceptación de privacidad.');
            return;
          }
          setError('');
          mutation.mutate(body.data);
        }}
      >
        <CiField value={ci} onChange={setCi} />
        <TextField
          label="Correo electrónico (opcional)"
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
        />
        <p className="small muted">Para ingresar solo necesitas tu cédula.</p>
        <Checkbox required checked={accept} onChange={(e) => setAccept(e.target.checked)}>
          Acepto el uso de mi cédula (y de mi correo, si lo ingreso) para SmartClub 2.0 según la{' '}
          <Link to="/privacidad">política de privacidad</Link>.
        </Checkbox>
        {(error || mutation.error) && (
          <Alert>
            {exists ? 'Ya eres parte del club' : error || mutation.error?.message}
            {exists && (
              <Link className="button secondary" to="/ingresar" state={{ ci }}>
                Ingresar a mi club
              </Link>
            )}
          </Alert>
        )}
        <Button disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Creando tu cuenta…' : 'Únete gratis →'}
        </Button>
        <p className="small muted">Solo necesitas tu cédula. Sin costo de inscripción.</p>
      </form>
      <p className="center">
        ¿Ya eres parte?{' '}
        <Link to="/ingresar" state={{ ci }}>
          Ingresa aquí
        </Link>
      </p>
    </div>
  );
}
