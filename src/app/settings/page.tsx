import { PageHeader } from "@/components/PageHeader";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="text-center text-slate-500">
          <p className="text-lg font-medium text-slate-700">Coming soon</p>
          <p className="mt-1 text-sm">
            Preferences and account settings will live here.
          </p>
        </div>
      </section>
    </>
  );
}
