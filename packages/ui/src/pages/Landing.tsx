import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgram } from '../api/queries';
import { program } from '../theme';
import { Money, TierBadge, Spinner, Alert, DiscountCap } from '../components/ui';
import { LigaTabs } from '../components/LigaTabs';
import { brandLogos } from '../brandLogos';
function BrandTile({ id, name }: { id: string; name: string }) {
  const [broken, setBroken] = useState(false);
  const logo = brandLogos[id];
  if (!logo || broken) return <div className="brand-tile">{name}</div>;
  return (
    <img
      className="brand-tile brand-logo"
      src={logo}
      alt={name}
      width={389}
      height={389}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
export function Component() {
  const { data, isPending, error } = useProgram();
  const [selected, setSelected] = useState('');
  const liga = data?.streaks.find((s) => s.streakId === selected) ?? data?.streaks[0];
  const names = (ids: string[]) =>
    new Intl.ListFormat('es', { type: 'conjunction' }).format(
      ids.map((id) => data?.businesses.find((b) => b.businessId === id)?.name ?? id),
    );
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">{program.displayName}</span>
            <h1>
              Tus compras <strong>suman</strong>.<br />
              Tu constancia <strong>gana</strong>.
            </h1>
            <p>
              Suma cada mes en tus marcas favoritas. Cada liga tiene nuevos motivos para volver.
            </p>
            <div className="hero-actions">
              <Link className="button hero-button" to="/registro">
                Únete gratis <span aria-hidden="true">›</span>
              </Link>
              <Link className="hero-link" to="/ingresar">
                Ver mi progreso ›
              </Link>
            </div>
            <p className="hero-note">✓ Sin costo · ✓ Sin tarjetas · ✓ Con tu cédula</p>
          </div>
          <div className="hero-visual" aria-label="Tres niveles: Bronce, Plata y Oro">
            <svg className="hero-arcs" viewBox="0 0 600 600" aria-hidden="true">
              <circle className="arc-orange" cx="600" cy="300" r="430" />
              <circle className="arc-warm" cx="600" cy="300" r="310" />
            </svg>
            <div className="hero-loyalty-card">
              <span>SMARTCLUB 2.0 / TU PRÓXIMO NIVEL</span>
              <strong>
                Más ligas.
                <br />
                Más recompensas.
              </strong>
              <div className="mini-tiers">
                {['Bronce', 'Plata', 'Oro'].map((name, i) => (
                  <span key={name}>
                    0{i + 1}
                    <br />
                    <b>{name}</b>
                  </span>
                ))}
              </div>
              <div className="hero-card-line" />
              <small>Un solo ingreso, todas tus ligas.</small>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <h2>Cómo funciona</h2>
          <p>Solo necesitas tu cédula.</p>
        </div>
        <div className="steps-grid">
          {[
            ['1', 'Únete con tu cédula', 'Regístrate gratis. El correo es opcional.'],
            [
              '2',
              'Suma durante el mes',
              'Da tu cédula en caja. Tu compra cuenta en cada liga de esa marca.',
            ],
            ['3', 'Mantén tu racha', 'Vuelve cada mes y desbloquea beneficios smart.'],
          ].map(([n, title, text]) => (
            <article key={n}>
              <span className="step-number">{n}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section tiers-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">BENEFICIOS SMART</span>
            <h2>Ligas</h2>
          </div>
          <p>Tu progreso crece por separado en cada liga.</p>
        </div>
        {isPending ? (
          <Spinner />
        ) : error ? (
          <Alert>{error.message}</Alert>
        ) : (
          liga && (
            <>
              <LigaTabs
                ligas={data.streaks}
                selected={liga.streakId}
                onSelect={setSelected}
                prefix="landing"
              />
              <div
                id="landing-panel"
                role="tabpanel"
                aria-labelledby={`landing-tab-${liga.streakId}`}
              >
                <h3>{liga.name}</h3>
                <p>{names(liga.businessIds)}</p>
                <div className="tier-grid">
                  {liga.tiers.map((tier, i) => (
                    <article
                      className={`tier-card tier-${tier.tierId.toLowerCase()}`}
                      key={tier.tierId}
                    >
                      <span className="tier-number" aria-hidden="true">
                        0{i + 1}
                      </span>
                      <TierBadge tierId={tier.tierId} name={tier.name} />
                      <h3>
                        <Money cents={tier.minMonthlyCents} /> <small>al mes</small>
                      </h3>
                      <p className="tier-timing">
                        {tier.rewards[0]?.requiredConsecutiveMonths === 1
                          ? 'Cada mes que llegas a este nivel'
                          : 'Cada 3 meses consecutivos en este nivel'}
                      </p>
                      {tier.rewards.map((reward) => (
                        <div key={reward.rewardId}>
                          <p>
                            {reward.selection === 'ONE_OF'
                              ? 'Elige uno:'
                              : 'Gana estos beneficios:'}
                          </p>
                          <ul>
                            {reward.benefits.map((b) => (
                              <li key={b.benefitId}>
                                {b.title}
                                <DiscountCap benefit={b} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              </div>
            </>
          )
        )}
      </section>
      {data && (
        <section className="section brands-section">
          <h2>Marcas smart</h2>
          {data.streaks.map((s) => (
            <div key={s.streakId}>
              <h3>{s.name}</h3>
              <div className="brand-tiles">
                {s.businessIds.map((id) => (
                  <BrandTile
                    key={id}
                    id={id}
                    name={data.businesses.find((b) => b.businessId === id)?.name ?? id}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="receipt-callout">
        <div>
          <span className="eyebrow">CADA COMPRA TE CUENTA MÁS</span>
          <h2>Así sale en tu factura</h2>
          <p>
            Tu liga, tu acumulado y lo que te falta para el siguiente nivel. Todo en tu comprobante.
          </p>
          <Link className="button hero-button" to="/registro">
            Empieza tu racha ›
          </Link>
        </div>
        <div className="sample-receipt">
          <strong>SMARTCLUB - LIGA AHORRO</strong>
          <div className="receipt-dashed" />
          <p>Acumulado: $18,00</p>
          <p>Nivel: Plata</p>
          <p>Te faltan $7,00 para Oro</p>
          <small>Tu constancia se ve aquí.</small>
        </div>
      </section>
      <section className="section faq">
        <h2>Tus preguntas, en simple.</h2>
        {[
          ['¿Necesito correo?', 'No. Solo tu cédula.'],
          [
            '¿Necesito la app?',
            'No: tu progreso sale en tu factura y puedes verlo aquí con tu cédula.',
          ],
          [
            '¿Cómo se suman mis compras?',
            'Cada compra suma a las ligas de esa marca durante el mes. Los montos de ligas distintas no se mezclan.',
          ],
          [
            '¿Qué pasa si no llego un mes?',
            'Ese mes termina tu racha. El siguiente puedes empezar otra.',
          ],
          [
            '¿Cómo canjeo mis beneficios?',
            'Presenta el código en una marca de tu liga. Cada recompensa indica dónde se canjea y su descuento máximo.',
          ],
          [
            '¿Tiene costo?',
            'Estas ligas son gratuitas e independientes de la membresía y la app de cashback de SmartClub.',
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
      <section className="join-banner">
        <h2>
          Tu próxima racha <strong>empieza hoy</strong>.
        </h2>
        <Link className="button hero-button" to="/registro">
          Únete al club ›
        </Link>
      </section>
    </div>
  );
}
