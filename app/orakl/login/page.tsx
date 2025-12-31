"use client";

import { useEffect, useState } from "react";
import { supabaseOrakl } from "@/lib/supabaseOraklClient";

export default function OraklPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseOrakl.auth.getSession();
      const session = data.session;

      if (!session) {
        window.location.href = "/orakl/login";
        return;
      }

      setEmail(session.user.email ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <p>Checking login…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Navi ORAKL</h1>
      <p>Logged in as: {email}</p>
      <p>Next: CAPTCHA + the chat UI.</p>
    </main>
  );
}
