export default function MfaEnrollmentLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center px-6 py-12"
    >
      <p className="text-sm text-stone-600">
        Förbereder Microsoft Authenticator…
      </p>
    </main>
  );
}
