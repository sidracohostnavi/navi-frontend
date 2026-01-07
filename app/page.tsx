export default function HomePage() {
  const links = [
    { href: "/orakl", title: "Orakl", desc: "Life coach agent (Oracle)" },
    { href: "/cohost", title: "CoHost", desc: "STR operations hub" },
    { href: "/cohost/messaging/inbox", title: "Messaging Inbox", desc: "Human-in-the-loop guest messaging" },
    { href: "/cohost/calendar", title: "Calendar", desc: "Calendar tools" },
    { href: "/cohost/dailyops", title: "Daily Ops", desc: "Daily operations dashboard" },
  ];

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ fontSize: 40, marginBottom: 8 }}>Naviverse</h1>
      <p style={{ opacity: 0.8, marginBottom: 28 }}>
        Choose an agent / module:
      </p>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 16,
              textDecoration: "none",
              display: "block",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{l.title}</div>
            <div style={{ opacity: 0.75, fontSize: 14 }}>{l.desc}</div>
            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>{l.href}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
