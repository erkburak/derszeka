import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getPublicSettings } from "@/lib/settings";
import { getCurrentProfile } from "@/lib/auth";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, profile] = await Promise.all([
    getPublicSettings(),
    getCurrentProfile(),
  ]);

  return (
    <>
      <SiteHeader siteName={settings.siteName} isAuthenticated={Boolean(profile)} />
      <main className="flex-1">{children}</main>
      <SiteFooter
        siteName={settings.siteName}
        supportEmail={settings.supportEmail}
      />
    </>
  );
}
