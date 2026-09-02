"use client";

/** Last resort: the root layout itself failed, so this renders its own document. */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{
        fontFamily: "system-ui, sans-serif", background: "#f4f5f8",
        display: "flex", minHeight: "100vh", alignItems: "center",
        justifyContent: "center", margin: 0, padding: 24,
      }}>
        <div style={{
          maxWidth: 420, width: "100%", background: "#fff", borderRadius: 16,
          border: "1px solid #e2e6ec", padding: 24, textAlign: "center",
        }}>
          <h1 style={{ fontSize: 16, margin: "0 0 8px", color: "#171b22" }}>
            The app could not start
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#4b5768", margin: 0 }}>
            Reload the page. If it keeps failing, the office should check that the
            database is reachable.
          </p>
          {error.digest && (
            <p style={{
              marginTop: 12, background: "#f6f7f9", borderRadius: 8,
              padding: "8px 12px", fontFamily: "ui-monospace, monospace",
              fontSize: 12, color: "#4b5768",
            }}>{error.digest}</p>
          )}
          <button onClick={reset} style={{
            marginTop: 20, background: "#2f5ceb", color: "#fff", border: 0,
            borderRadius: 8, padding: "10px 18px", fontSize: 14,
            fontWeight: 600, cursor: "pointer",
          }}>Reload</button>
        </div>
      </body>
    </html>
  );
}
