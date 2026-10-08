export function LigaTabs({
  ligas,
  selected,
  onSelect,
  prefix,
}: {
  ligas: Array<{ streakId: string; name: string }>;
  selected: string;
  onSelect: (id: string) => void;
  prefix: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Ligas">
      {ligas.map((liga, index) => (
        <button
          key={liga.streakId}
          id={`${prefix}-tab-${liga.streakId}`}
          role="tab"
          aria-selected={selected === liga.streakId}
          aria-controls={`${prefix}-panel`}
          tabIndex={selected === liga.streakId ? 0 : -1}
          onClick={() => onSelect(liga.streakId)}
          onKeyDown={(event) => {
            const nextIndex =
              event.key === 'ArrowRight'
                ? (index + 1) % ligas.length
                : event.key === 'ArrowLeft'
                  ? (index + ligas.length - 1) % ligas.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? ligas.length - 1
                      : undefined;
            const next = nextIndex === undefined ? undefined : ligas[nextIndex];
            if (next) {
              event.preventDefault();
              onSelect(next.streakId);
              document.getElementById(`${prefix}-tab-${next.streakId}`)?.focus();
            }
          }}
        >
          {liga.name}
        </button>
      ))}
    </div>
  );
}
