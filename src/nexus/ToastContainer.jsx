export default function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.alertType}`}>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
