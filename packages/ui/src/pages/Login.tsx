import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { loginSchema } from '@club/shared';
import { ApiError, request } from '../api/client';
import { useAuth } from '../api/auth-context';
import { CiField } from '../components/CiField';
import { Button, Alert } from '../components/ui';
export function Component() {
  const location = useLocation();
  const state = location.state as { ci?: string } | null;
  const [ci, setCi] = useState(state?.ci ?? '');
  const [error, setError] = useState('');
  const auth = useAuth();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (body: unknown) => request<{ token: string }>('/auth/login', { body }),
    onSuccess: (r) => {
      auth.login(r.token);
      void navigate('/mi-club');
    },
  });
  const missing =
    mutation.error instanceof ApiError && mutation.error.code === 'CUSTOMER_NOT_FOUND';
  return (
    <div className="narrow page">
      <span className="eyebrow text-brand-strong">QUÉ BUENO VERTE DE NUEVO</span>
      <h1>
        Tu club, a <strong>un paso</strong>.
      </h1>
      <p className="muted">Ingresa con tu cédula y mira todo lo que llevas.</p>
      <form
        className="card form-card"
        onSubmit={(e) => {
          e.preventDefault();
          const body = loginSchema.safeParse({ ci });
          if (!body.success) {
            setError('Revisa tu número de cédula');
            return;
          }
          setError('');
          mutation.mutate(body.data);
        }}
      >
        <CiField value={ci} onChange={setCi} />
        {(error || mutation.error) && (
          <Alert>
            {missing ? 'No encontramos esa cédula' : error || mutation.error?.message}
            {missing && (
              <Link to="/registro" state={{ ci }}>
                Únete gratis
              </Link>
            )}
          </Alert>
        )}
        <Button disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Ingresando…' : 'Ver mi progreso ›'}
        </Button>
      </form>
      <p className="form-footnote">
        ¿Aún no eres parte? <Link to="/registro">Únete gratis</Link>
      </p>
    </div>
  );
}
