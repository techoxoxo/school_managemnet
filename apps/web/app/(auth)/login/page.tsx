import { cookies } from 'next/headers';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const jar = await cookies();
  const knownSlug = jar.get('tenant_slug')?.value ?? '';

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-brand">Schoolmate</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your school</p>
        </div>
        <LoginForm knownSlug={knownSlug} />
      </div>
    </main>
  );
}
