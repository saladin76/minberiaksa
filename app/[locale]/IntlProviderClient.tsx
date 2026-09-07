"use client";

import { NextIntlClientProvider } from "next-intl";

type Props = {
  locale: string;
  messages: Record<string, unknown>;
  children: React.ReactNode;
};

export default function IntlProviderClient({ locale, messages, children }: Props) {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      now={now}
      timeZone={timeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}
