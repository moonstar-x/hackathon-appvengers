import { PRIVACY_POLICY_VERSION } from '@club/shared';
import { program } from '../theme';
export function Component() {
  return (
    <article className="narrow page legal">
      <h1>Tu privacidad.</h1>
      <p className="status at_risk">Aviso pendiente de revisión legal</p>
      <p>
        Versión {PRIVACY_POLICY_VERSION}. Este aviso provisional corresponde al programa{' '}
        {program.displayName} de Farmaenlace en Ecuador.
      </p>
      <h2>Qué datos recogemos</h2>
      <p>
        Tu cédula (requerida), correo electrónico (opcional), tu consentimiento, las compras que
        registras en negocios participantes y las recompensas del programa.
      </p>
      <h2>Para qué los usamos</h2>
      <p>
        Para identificar tu cuenta, sumar tus compras mensuales, mostrar tus rachas y validar
        recompensas en caja. No enviamos correos en esta versión.
      </p>
      <h2>Tu consentimiento</h2>
      <p>
        Registrarte en la web requiere aceptar este aviso. En caja, el personal pide tu
        consentimiento verbal. Guardamos la fecha, el canal y la versión de la política aceptada.
      </p>
      <h2>Cómo protegemos tus datos</h2>
      <p>
        Los datos se transmiten con cifrado y el correo se muestra parcialmente oculto. Puedes
        iniciar sesión con tu cédula; presenta los códigos de recompensa al personal de caja para
        canjearlos.
      </p>
      <h2>Tus derechos</h2>
      <p>
        La LOPDP contempla acceso, rectificación, eliminación y otros derechos. Antes de operar el
        programa en producción, Farmaenlace debe publicar el contacto del responsable, los plazos de
        conservación y el procedimiento para ejercerlos. Estos canales están pendientes de
        definición.
      </p>
    </article>
  );
}
