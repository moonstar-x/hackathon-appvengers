import { Link } from 'react-router-dom';
export function Component() {
  return (
    <div className="narrow page empty-state">
      <span>404</span>
      <h1>Esta página no está en tu ruta.</h1>
      <Link className="button primary" to="/">
        Volver al inicio
      </Link>
    </div>
  );
}
