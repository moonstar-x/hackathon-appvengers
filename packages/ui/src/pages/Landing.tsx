import { Link } from 'react-router-dom';
import { useProgram } from '../api/queries';
import { tenant } from '../theme';
import { Money, TierBadge, Spinner, Alert } from '../components/ui';
export function Component() {
  const { data, isPending, error } = useProgram();
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-inner">
          <div>
            <span className="eyebrow">TU CONSTANCIA MERECE MÁS</span>
            <h1>
              Lo cotidiano
              <br />
              se vuelve
              <br />
              <span>extraordinario.</span>
            </h1>
            <p>{tenant.tagline} Suma tus compras cada mes y descubre todo lo que puedes ganar.</p>
            <div className="hero-actions">
              <Link className="button hero-button" to="/registro">
                Únete gratis <span aria-hidden="true">↗</span>
              </Link>
              <Link className="hero-link" to="/ingresar">
                Ver mi progreso →
              </Link>
            </div>
            <div className="hero-note">
              ✓ Sin costo &nbsp; ✓ Sin tarjetas &nbsp; ✓ Con tu cédula
            </div>
          </div>
          <div className="hero-visual" aria-label="Tres niveles: Bronce, Plata y Oro">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="floating-note">
              Cada compra cuenta <span>↗</span>
            </div>
            <div className="hero-loyalty-card">
              <span>{tenant.displayName} / TU PRÓXIMO NIVEL</span>
              <strong>
                Una racha.
                <br />
                Más recompensas.
              </strong>
              <div className="mini-tiers">
                <span>
                  01
                  <br />
                  <b>Bronce</b>
                </span>
                <span>
                  02
                  <br />
                  <b>Plata</b>
                </span>
                <span>
                  03
                  <br />
                  <b>Oro</b>
                </span>
              </div>
              <div className="hero-card-line" />
              <small>Tu bienestar tiene beneficios.</small>
            </div>
            <div className="floating-medallion" aria-hidden="true">
              ✦
            </div>
          </div>
        </div>
      </section>
      <section className="business-strip">
        <span>TUS MARCAS DE CONFIANZA</span>
        <div>
          {tenant.businesses.map((b) => (
            <strong key={b.businessId}>{b.name}</strong>
          ))}
        </div>
        {tenant.id === 'farmaclub' && (
          <p>
            Tu farmacia, tu hogar, tu belleza y tu mascota. Todas las marcas suman a una misma
            racha.
          </p>
        )}
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow text-brand-strong">ASÍ DE SIMPLE</span>
            <h2>Un hábito que te recompensa.</h2>
          </div>
          <p>
            No cambies tus compras.
            <br />
            Dales un nuevo propósito.
          </p>
        </div>
        <div className="steps-grid">
          {[
            [
              '01',
              'Únete con tu cédula',
              'Regístrate gratis con tu cédula y correo. Sin descargar nada.',
            ],
            [
              '02',
              'Suma durante el mes',
              'Da tu cédula en cada compra. Todo lo que compras en tu club se acumula.',
            ],
            [
              '03',
              'Mantén tu racha',
              'Llega a un nivel y vuelve cada mes. Tu constancia desbloquea más beneficios.',
            ],
          ].map(([n, title, text]) => (
            <article key={n}>
              <span className="step-number">{n}</span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section tiers-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow text-brand-strong">CADA MES, UN NUEVO MOTIVO</span>
            <h2>Encuentra tu siguiente nivel.</h2>
          </div>
          <p>
            Desde tu primera recompensa
            <br />
            hasta experiencias especiales.
          </p>
        </div>
        {isPending ? (
          <Spinner />
        ) : error ? (
          <Alert>No pudimos cargar los beneficios. Intenta de nuevo.</Alert>
        ) : (
          <div className="tier-grid">
            {data.streaks[0]?.tiers.map((tier, i) => (
              <article className={'tier-card tier-' + tier.tierId.toLowerCase()} key={tier.tierId}>
                <span className="tier-number">0{i + 1}</span>
                <TierBadge tierId={tier.tierId} name={tier.name} />
                <h3>
                  <Money cents={tier.minMonthlyCents} />
                  <small> / mes</small>
                </h3>
                <p className="tier-timing">
                  {tier.rewards[0]?.requiredConsecutiveMonths === 1
                    ? 'Al instante'
                    : 'Mantén 3 meses'}
                </p>
                <ul>
                  {tier.rewards.flatMap((r) =>
                    r.benefits.map((b) => <li key={b.benefitId}>{b.title}</li>),
                  )}
                </ul>
                {tier.rewards.some((r) => r.selection === 'ONE_OF') && (
                  <small className="muted">Elige uno de estos beneficios.</small>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="receipt-callout section">
        <div>
          <span className="eyebrow text-brand-strong">TAMBIÉN EN TU FACTURA</span>
          <h2>
            Tu progreso va contigo.
            <br />
            Con o sin celular.
          </h2>
          <p className="muted">
            Después de cada compra, tu factura te cuenta cuánto llevas, qué te falta y qué acabas de
            ganar.
          </p>
          <Link to="/registro" className="text-link">
            Empieza tu racha →
          </Link>
        </div>
        <div className="sample-receipt">
          <small>{tenant.displayName.toUpperCase()} — TU RACHA</small>
          <div className="receipt-dashed" />
          <p>¡Vas por buen camino!</p>
          <p>
            Cada compra te acerca
            <br />a tu próxima recompensa.
          </p>
          <div className="receipt-dashed" />
          <span>|||| ||| |||||| || |||||</span>
        </div>
      </section>
      <section className="section faq">
        <span className="eyebrow text-brand-strong">RESOLVEMOS TUS DUDAS</span>
        <h2>Claro desde el primer día.</h2>
        {[
          [
            '¿Necesito la app?',
            'No: tu progreso sale en tu factura. También puedes verlo aquí con tu cédula, sin descargar nada.',
          ],
          [
            '¿Cómo funciona la racha?',
            'Suma compras durante cada mes calendario. Bronce te recompensa al instante; Plata y Oro requieren tres meses seguidos en ese nivel o uno superior.',
          ],
          [
            '¿Qué pasa si no llego un mes?',
            'La racha se reinicia. Puedes empezar otra el mes siguiente y tus recompensas anteriores mantienen su fecha de validez.',
          ],
          [
            '¿Dónde canjeo mis recompensas?',
            'Presenta tu código en caja. Algunos beneficios se canjean en una marca específica; revisa las condiciones de tu recompensa.',
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
          Tu próxima compra puede ser
          <br />
          el inicio de algo bueno.
        </h2>
        <Link className="button hero-button" to="/registro">
          Quiero ser parte →
        </Link>
      </section>
    </div>
  );
}
