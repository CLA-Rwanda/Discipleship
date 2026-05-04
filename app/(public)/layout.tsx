export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh" style={{ background: "var(--cla-bg-dark)" }}>
      {children}
    </main>
  );
}
