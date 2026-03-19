export function EventFeed({ events, onNavigate }) {
  return (
    <div className="card">
      <h3>Live Events</h3>
      <div className="feed">
        {events.length === 0 && <p className="hint">No events yet.</p>}
        {events.map((event, idx) => (
          <div key={`${event.time}-${idx}`} className="feed-item">
            <div>
              <strong>{event.event}</strong>
              {event.message && <div className="hint">{event.message}</div>}
            </div>
            <div>
              {event.count > 1 && <div className="hint">x{event.count}</div>}
              <span>{event.time}</span>
              {(event.runId || event.taskId) && (
                <button
                  type="button"
                  className="event-jump"
                  onClick={() => onNavigate?.(event)}
                >
                  Jump
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
