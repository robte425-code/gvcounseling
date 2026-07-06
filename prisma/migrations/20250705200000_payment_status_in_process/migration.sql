-- L&I remittance uses Paid, Denied, and In process — store In process exactly on invoices.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'IN_PROCESS';
