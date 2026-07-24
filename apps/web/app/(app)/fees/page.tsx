import { PageHeader } from '@/components/ui/card';
import { FeeCollection } from './fee-collection';

/**
 * P2-MOD-06: fee collection desk. Search a student → see outstanding dues →
 * collect a payment (cash/UPI/cheque) → download the receipt PDF. The heavy
 * lifting (FIFO allocation, receipt numbering) is server-side; this is the
 * accountant's daily entry point.
 */
export default function FeesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Collection"
        description="Search a student, review outstanding dues, and collect payments."
      />
      <FeeCollection />
    </div>
  );
}
