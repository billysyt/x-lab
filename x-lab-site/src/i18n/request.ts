import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ locale }) => {
  const supported = ["en", "zh-Hant"];
  const safeLocale = locale && supported.includes(locale) ? locale : "zh-Hant";
  return {
    locale: safeLocale,
    messages: (await import(`../../messages/${safeLocale}.json`)).default,
  };
});
