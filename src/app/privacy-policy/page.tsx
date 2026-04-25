export const metadata = {
  title: "Privacy Policy | Gavelogy Admin",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-4 text-3xl font-semibold">Privacy Policy</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: April 25, 2026
      </p>

      <section className="space-y-3 text-sm leading-6">
        <p>
          This Gavelogy Admin GPT Action is used only for authorized admin
          automation in Gavelogy. It supports create, read, update, and publish
          workflows for course content.
        </p>
        <p>
          The API is protected with admin authentication and a private
          `x-admin-secret` header. Secrets are server-side only and are never
          exposed to end users.
        </p>
        <p>
          We do not expose delete actions through GPT Actions. Deletion, if
          needed, must be performed manually inside the Gavelogy admin UI.
        </p>
        <p>
          The system is not intended to process payment credentials, OTPs, or
          other consumer authentication secrets through GPT Actions.
        </p>
        <p>
          For privacy or data handling requests, contact the Gavelogy admin
          team.
        </p>
      </section>
    </main>
  );
}
