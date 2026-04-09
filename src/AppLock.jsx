import { useState, useEffect, useCallback, useRef } from "react";

const PIN_KEY = "fintrack_app_pin";
const LOCK_TIMEOUT = 60 * 1000; // 1 minute in milliseconds

export default function AppLock({ children }) {
  const [pin, setPin] = useState(() => localStorage.getItem(PIN_KEY));
  const [mode, setMode] = useState("lock"); // "lock" | "setup" | "confirm" | "unlocked"
  const [input, setInput] = useState("");
  const [tempPin, setTempPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const backgroundTime = useRef(null);
  const isLockedRef = useRef(!localStorage.getItem(PIN_KEY) ? false : true);

  // On mount: if no PIN set → go straight to app (no PIN configured yet)
  useEffect(() => {
    if (!pin) {
      setMode("unlocked");
    } else {
      setMode("lock");
    }
  }, []);

  // Auto-lock on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!localStorage.getItem(PIN_KEY)) return;
      if (document.hidden) {
        backgroundTime.current = Date.now();
      } else {
        if (
          backgroundTime.current &&
          Date.now() - backgroundTime.current >= LOCK_TIMEOUT
        ) {
          setMode("lock");
          setInput("");
          setError("");
        }
        backgroundTime.current = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleDigit = useCallback(
    (digit) => {
      if (input.length >= 4) return;
      const newInput = input + digit;
      setInput(newInput);
      setError("");

      if (newInput.length === 4) {
        setTimeout(() => {
          if (mode === "lock") {
            if (newInput === localStorage.getItem(PIN_KEY)) {
              setMode("unlocked");
              setInput("");
            } else {
              setError("Incorrect PIN. Try again.");
              triggerShake();
              setInput("");
            }
          } else if (mode === "setup") {
            setTempPin(newInput);
            setMode("confirm");
            setInput("");
          } else if (mode === "confirm") {
            if (newInput === tempPin) {
              localStorage.setItem(PIN_KEY, newInput);
              setPin(newInput);
              setMode("unlocked");
              setInput("");
              setTempPin("");
            } else {
              setError("PINs don't match. Start over.");
              triggerShake();
              setTempPin("");
              setMode("setup");
              setInput("");
            }
          }
        }, 150);
      }
    },
    [input, mode, tempPin]
  );

  const handleDelete = useCallback(() => {
    setInput((prev) => prev.slice(0, -1));
    setError("");
  }, []);

  const handleSetupPin = () => {
    setMode("setup");
    setInput("");
    setError("");
  };

  const handleRemovePin = () => {
    localStorage.removeItem(PIN_KEY);
    setPin(null);
    setMode("unlocked");
  };

  // Keyboard support
  useEffect(() => {
    if (mode === "unlocked") return;
    const handleKey = (e) => {
      if (e.key >= "0" && e.key <= "9") handleDigit(e.key);
      if (e.key === "Backspace") handleDelete();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mode, handleDigit, handleDelete]);

  if (mode === "unlocked") {
    return (
      <>
        {children}
        {/* Optional: settings button to manage PIN */}
        <button
          onClick={pin ? handleRemovePin : handleSetupPin}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#1a1a2e",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "10px 18px",
            fontSize: 13,
            cursor: "pointer",
            zIndex: 9999,
            boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
          }}
        >
          {pin ? "Remove PIN Lock" : "Set PIN Lock"}
        </button>
      </>
    );
  }

  const dots = Array.from({ length: 4 }, (_, i) => i < input.length);

  const titles = {
    lock: "Enter your PIN",
    setup: "Create a PIN",
    confirm: "Confirm your PIN",
  };

  const subtitles = {
    lock: "Enter your 4-digit PIN to unlock FinTrack",
    setup: "Choose a 4-digit PIN to secure your app",
    confirm: "Re-enter your PIN to confirm",
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="10" fill="#4F46E5" />
            <path d="M10 22L16 16L20 20L26 13" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="26" cy="13" r="2.5" fill="white" />
          </svg>
          <span style={styles.logoText}>FinTrack</span>
        </div>

        <h2 style={styles.title}>{titles[mode]}</h2>
        <p style={styles.subtitle}>{subtitles[mode]}</p>

        {/* PIN dots */}
        <div style={{ ...styles.dotsRow, ...(shake ? styles.shake : {}) }}>
          {dots.map((filled, i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                background: filled ? "#4F46E5" : "transparent",
                borderColor: filled ? "#4F46E5" : "#CBD5E1",
                transform: filled ? "scale(1.1)" : "scale(1)",
                transition: "all 0.15s ease",
              }}
            />
          ))}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {/* Number pad */}
        <div style={styles.numpad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(
            (key, i) => {
              if (key === "") return <div key={i} />;
              const isDelete = key === "⌫";
              return (
                <button
                  key={i}
                  onClick={() =>
                    isDelete ? handleDelete() : handleDigit(key)
                  }
                  style={{
                    ...styles.numKey,
                    ...(isDelete ? styles.deleteKey : {}),
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#F1F5F9";
                    e.currentTarget.style.transform = "scale(0.97)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDelete
                      ? "transparent"
                      : "#FFFFFF";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  {key}
                </button>
              );
            }
          )}
        </div>

        {mode === "lock" && (
          <button onClick={handleSetupPin} style={styles.linkBtn}>
            Forgot PIN? Reset app lock
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#F8FAFC",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 24,
    padding: "40px 36px 32px",
    width: "100%",
    maxWidth: 360,
    boxShadow: "0 4px 40px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1E293B",
    letterSpacing: "-0.3px",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#1E293B",
    margin: "0 0 8px",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    margin: "0 0 32px",
    lineHeight: 1.5,
  },
  dotsRow: {
    display: "flex",
    gap: 20,
    marginBottom: 12,
  },
  shake: {
    animation: "none",
    transform: "translateX(0)",
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "2px solid",
  },
  error: {
    fontSize: 13,
    color: "#EF4444",
    margin: "4px 0 16px",
    textAlign: "center",
  },
  numpad: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    width: "100%",
    marginTop: 24,
  },
  numKey: {
    height: 68,
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    fontSize: 22,
    fontWeight: 600,
    color: "#1E293B",
    cursor: "pointer",
    transition: "all 0.1s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteKey: {
    background: "transparent",
    border: "none",
    fontSize: 20,
    color: "#64748B",
  },
  linkBtn: {
    marginTop: 24,
    background: "none",
    border: "none",
    color: "#4F46E5",
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
};
