import Link from 'next/link';
import { NewTenantForm } from './new-tenant-form';

export default function NewTenantPage() {
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <div className="page-head">
        <div>
          <h1 className="h1">New tenant</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Provision an institute. Its modules and terminology come from the type preset.
          </p>
        </div>
        <Link href="/tenants" className="btn btn-ghost">
          Cancel
        </Link>
      </div>
      <div className="card">
        <NewTenantForm />
      </div>
    </div>
  );
}
