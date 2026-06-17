import {
  combineDatetimeLocal,
  formatDatetimeParts,
  parseDatetimeLocal,
  todayDateInputMin,
} from "../utils/datetimeLocal";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

export default function DayTimePickerField({ value, onChange, label }: Props) {
  const { date, time } = parseDatetimeLocal(value);
  const { dateLine, timeLine } = formatDatetimeParts(value);

  return (
    <div className="idp-daytime-field">
      {label ? <span className="idp-daytime-label">{label}</span> : null}
      <div className="idp-daytime-summary" aria-live="polite">
        <span className="idp-daytime-summary-eyebrow">Your hangout</span>
        <span className="idp-daytime-summary-date">{dateLine}</span>
        <span className="idp-daytime-summary-time">{timeLine}</span>
      </div>
      <div className="idp-daytime-inputs">
        <label className="idp-daytime-input-wrap">
          <span className="idp-daytime-input-caption">📅 Day</span>
          <input
            type="date"
            className="idp-daytime-input"
            value={date}
            min={todayDateInputMin()}
            onChange={(e) => onChange(combineDatetimeLocal(e.target.value, time))}
          />
        </label>
        <label className="idp-daytime-input-wrap">
          <span className="idp-daytime-input-caption">⏰ Time</span>
          <input
            type="time"
            className="idp-daytime-input"
            value={time}
            onChange={(e) => onChange(combineDatetimeLocal(date, e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
