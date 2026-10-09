// Day + month pickers, shared by the signup form and the admin member form.
//
// No year field, because none is stored. The day options for February follow
// the rule from the database: 29 is always offered, because the year is
// unknown, and 29 Feb simply falls on 28 Feb in non-leap years.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(month) {
  if (month === 2) return 29
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

export function DayMonthFields({
  day,
  month,
  onChange,
  idPrefix,
  disabled = false,
}) {
  // Default to January when nothing is chosen yet, so the day list is
  // sensible instead of empty.
  const activeMonth = month || 1
  const maxDay = daysInMonth(activeMonth)

  return (
    <div className="day-month">
      <div className="field">
        <label htmlFor={`${idPrefix}-day`}>Day</label>
        <select
          id={`${idPrefix}-day`}
          value={day ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null, month)}
        >
          <option value="">—</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}-month`}>Month</label>
        <select
          id={`${idPrefix}-month`}
          value={month ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(day, e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">—</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>{name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
