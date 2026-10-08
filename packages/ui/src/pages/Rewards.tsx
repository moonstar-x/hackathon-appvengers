import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CustomerRewardDto } from '@club/shared';
import { request } from '../api/client';
import { RewardCard, Button, Spinner, Alert } from '../components/ui';
export function Component() {
  const [tab, setTab] = useState<CustomerRewardDto['status']>('AVAILABLE');
  const [selected, setSelected] = useState<CustomerRewardDto | null>(null);
  const [benefit, setBenefit] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const query = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ['me', 'rewards'],
    queryFn: () => request<CustomerRewardDto[]>('/me/rewards'),
  });
  const choose = useMutation({
    mutationFn: () =>
      request('/me/rewards/' + (selected?.code ?? '') + '/choose', {
        body: { benefitId: benefit },
      }),
    onSuccess: () => {
      setSelected(null);
      setTab('AVAILABLE');
      void query.invalidateQueries({ queryKey: ['me'] });
    },
  });
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  return (
    <div className="narrow page">
      <span className="eyebrow text-brand-strong">GANADAS CON TU CONSTANCIA</span>
      <h1>Tus recompensas.</h1>
      <p className="muted">Presenta tu código en caja y disfruta tu beneficio.</p>
      <div className="tabs" role="tablist" aria-label="Estado de recompensas">
        {(
          [
            ['AVAILABLE', 'Disponibles'],
            ['PENDING_CHOICE', 'Por elegir'],
            ['REDEEMED', 'Usadas'],
            ['EXPIRED', 'Vencidas'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            aria-controls="reward-panel"
            id={'tab-' + key}
            onClick={() => setTab(key)}
          >
            {label} <span>{data?.filter((r) => r.status === key).length ?? 0}</span>
          </button>
        ))}
      </div>
      <div id="reward-panel" role="tabpanel" aria-labelledby={'tab-' + tab}>
        {isPending ? (
          <Spinner />
        ) : error ? (
          <Alert>{error.message}</Alert>
        ) : data.filter((r) => r.status === tab).length ? (
          data
            .filter((r) => r.status === tab)
            .map((r) => (
              <RewardCard
                key={r.code}
                reward={r}
                onChoose={(r) => {
                  setSelected(r);
                  setBenefit('');
                  choose.reset();
                }}
              />
            ))
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">✦</span>
            <h2>Aquí aparecerán tus beneficios.</h2>
            <p>Cada compra te acerca a tu próxima recompensa.</p>
          </div>
        )}
      </div>
      <dialog ref={dialog} onCancel={() => setSelected(null)} aria-labelledby="choice-title">
        <h2 id="choice-title">Elige tu beneficio</h2>
        <p className="muted">Puedes elegir una sola opción.</p>
        {selected?.options?.map((o) => (
          <label htmlFor={'choice-' + o.benefitId} key={o.benefitId} className="choice-option">
            <input
              id={'choice-' + o.benefitId}
              type="radio"
              name="benefit"
              value={o.benefitId}
              checked={benefit === o.benefitId}
              onChange={() => setBenefit(o.benefitId)}
            />
            <span>
              <strong>{o.title}</strong>
              <small>{o.description}</small>
            </span>
          </label>
        ))}
        {choose.error && <Alert>{choose.error.message}</Alert>}
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Cancelar
          </Button>
          <Button disabled={!benefit || choose.isPending} onClick={() => choose.mutate()}>
            Confirmar elección
          </Button>
        </div>
      </dialog>
    </div>
  );
}
