"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

// A date field that always reads and accepts DD-MM-YYYY. The browser's own
// <input type="date"> shows its format from the browser's language (Chrome
// in English (US) shows MM-DD-YYYY), which a page can't override — so this
// is a text box in DD-MM-YYYY plus a calendar button that opens the native
// picker. Drop-in for <input type="date">: `value` / onChange's
// e.target.value are still ISO "YYYY-MM-DD" ("" when empty).

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "defaultValue"> & {
  value: string;
  onChange?: (e: { target: { value: string } }) => void;
};

function isoToDisplay(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// "15-10-2026", "15/10/2026", "15.10.2026", "5-1-2026" or "15102026" → ISO;
// null if it isn't a real calendar date.
function displayToIso(text: string): string | null {
  const t = text.trim();
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Width / flex classes belong on the wrapper so the field still fills (or
// sizes within) its row the way the plain input did.
const LAYOUT = /^(?:[a-z]+:)?(?:w-|min-w-|max-w-|flex-|grow|shrink|basis-|self-|col-span-)/;

export default function DateInput({ value, onChange, className = "", required, disabled, onBlur, ...rest }: Props) {
  const [text, setText] = useState(isoToDisplay(value));
  const [focused, setFocused] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Follow outside changes (form reset, quick-range buttons…) unless the
  // user is mid-typing.
  useEffect(() => {
    if (!focused) setText(isoToDisplay(value));
  }, [value, focused]);

  const classes = className.split(/\s+/).filter(Boolean);
  const wrapperLayout = classes.filter((c) => LAYOUT.test(c)).join(" ");
  const inputClasses = classes.filter((c) => !LAYOUT.test(c)).join(" ");

  function emit(iso: string) {
    if (iso !== value) onChange?.({ target: { value: iso } });
  }

  function handleText(next: string) {
    setText(next);
    const el = textRef.current;
    if (next.trim() === "") {
      el?.setCustomValidity("");
      emit("");
      return;
    }
    const iso = displayToIso(next);
    if (iso) {
      el?.setCustomValidity("");
      emit(iso);
    } else {
      el?.setCustomValidity("Enter the date as DD-MM-YYYY");
    }
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker || disabled) return;
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  }

  return (
    <span className={`relative inline-flex ${wrapperLayout}`}>
      <input
        {...rest}
        ref={textRef}
        type="text"
        inputMode="numeric"
        placeholder={rest.placeholder ?? "DD-MM-YYYY"}
        autoComplete="off"
        value={text}
        required={required}
        disabled={disabled}
        onChange={(e) => handleText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          // Leave a valid date neatly formatted; keep invalid text visible
          // so the validation message makes sense.
          const iso = displayToIso(text);
          if (iso) setText(isoToDisplay(iso));
          onBlur?.(e);
        }}
        className={`${inputClasses} w-full min-w-[8.5rem] pr-8`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        disabled={disabled}
        aria-label="Choose date"
        className="absolute inset-y-0 right-0 flex items-center px-2 text-black/40 hover:text-black disabled:opacity-40 dark:text-white/40"
      >
        <CalendarDays size={15} />
      </button>
      {/* Native picker, invisible — only its calendar popup is used. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value}
        onChange={(e) => {
          setText(isoToDisplay(e.target.value));
          textRef.current?.setCustomValidity("");
          emit(e.target.value);
        }}
        className="pointer-events-none absolute right-0 bottom-0 h-px w-px opacity-0"
      />
    </span>
  );
}
