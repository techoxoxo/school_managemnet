import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div className="brand" style={{ fontSize: '1.4rem' }}>
            Schoolmate
          </div>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Platform Admin
          </p>
        </div>
        <div className="card">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
