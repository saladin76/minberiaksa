'use client';

import { use, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { translationsFromRows } from '../../../_components/ContentTranslationTabs';
import {
  BankAccountForm,
  BANK_TRANSLATION_FIELDS,
  emptyBankAccount,
  type BankAccountFormValues,
  type CurrencyRow,
} from '../../_components/BankAccountForm';

type ApiCurrency = { id: string; code: string; accountNo: string | null; extNo: string | null; iban: string | null };

export default function EditBankAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<BankAccountFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    axios
      .get(`/api/bank-accounts/${id}`)
      .then((res) => {
        if (!live) return;
        const b = res.data;
        const currencies = ((b.currencies ?? []) as ApiCurrency[]).map<CurrencyRow>((c) => ({
          id: c.id,
          code: c.code ?? '',
          accountNo: c.accountNo ?? '',
          extNo: c.extNo ?? '',
          iban: c.iban ?? '',
        }));
        setInitial({
          ...emptyBankAccount(),
          slug: b.slug ?? '',
          name: b.name ?? '',
          branch: b.branch ?? '',
          swift: b.swift ?? '',
          holder: b.holder ?? '',
          logo: b.logo ?? '',
          locales: Array.isArray(b.locales) ? b.locales : [],
          isActive: b.isActive !== false,
          translations: translationsFromRows(b.translations ?? [], BANK_TRANSLATION_FIELDS),
          currencies: currencies.length ? currencies : emptyBankAccount().currencies,
        });
      })
      .catch((e) => {
        if (!live) return;
        setMissing(true);
        toast.error(errorMessage(e, 'تعذّر تحميل الحساب البنكي'));
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (missing) {
    return <p className="py-24 text-center text-sm text-slate-500">الحساب البنكي غير موجود.</p>;
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <BankAccountForm key={id} mode="edit" accountId={id} initial={initial} />;
}
