export default function Header({ user, onLogout }) {
  return (
    <header className="top-bar">
      <div className="brand-row">
        <svg
          className="brand-logo-icon"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="32" height="32" fill="var(--red)" rx="2" />
          <text
            x="16"
            y="16"
            fill="var(--paper)"
            fontSize="22"
            fontWeight="bold"
            fontFamily="var(--font-display)"
            textAnchor="middle"
            dominantBaseline="central"
          >
            N
          </text>
        </svg>

        <h1 className="brand-title">NEXUS</h1>
      </div>

      <p className="brand-sub">
        EMERGENCY MANAGEMENT AND RESOURCE OPTIMISATION SYSTEM
      </p>

      {user && (
        <div className="user-section">
          <span>
            Welcome, {user.name || user.email || user.phone || "User"}
          </span>

          <button onClick={onLogout} className="logout-button">
            Logout
          </button>
        </div>
      )}
    </header>
  );
}