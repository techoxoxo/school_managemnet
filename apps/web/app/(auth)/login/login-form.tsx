'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';

export function LoginForm({ knownSlug }: { knownSlug: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState(knownSlug);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim(), email, password }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Sign in failed. Please try again.');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {!knownSlug && (
          <div>
            <Label htmlFor="slug">School</Label>
            <Input
              id="slug"
              name="slug"
              placeholder="e.g. springfield"
              autoComplete="organization"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />
          </div>
        )}

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error)}
            required
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
            required
          />
          <FieldError message={undefined} />
        </div>

        <Button type="submit" className="w-full" loading={loading} size="lg">
          Sign in
        </Button>
      </form>
    </Card>
  );
}
