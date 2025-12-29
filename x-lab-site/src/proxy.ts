import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: ["en", "zh-Hant"],
  defaultLocale: "zh-Hant",
});

export const config = {
  matcher: ["/((?!api|_next|.*\\..*|premium).*)"],
};
