'use client';

import { BankAccountForm, emptyBankAccount } from '../_components/BankAccountForm';

export default function NewBankAccountPage() {
  return <BankAccountForm mode="create" initial={emptyBankAccount()} />;
}
