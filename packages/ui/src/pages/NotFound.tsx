import { Link } from 'react-router-dom';
export function Component() {
  return (
    <div className="narrow page">
      <div className="empty-state">
        <span>404</span>
        <h1>
          Esta página <strong>no está</strong> en tu ruta.
        </h1>
        <Link className="button primary" to="/">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
