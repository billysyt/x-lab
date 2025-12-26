import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import SiteFooter from "../_components/SiteFooter";
import SiteHeader from "../_components/SiteHeader";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <div className="min-h-screen">
        <SiteHeader />
        <main className="pb-24">{children}</main>
        <SiteFooter />
      </div>
    </NextIntlClientProvider>
  );
}
