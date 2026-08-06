"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cx } from "../cx";
import {
  filterOptions,
  nextIndex,
  reconcileIndex,
  SEARCH_THRESHOLD,
  shouldSearch,
  type ComboboxOption,
} from "./combobox-filter";

export type ComboboxProps = {
  /** The choices, in the order they should appear. */
  options: ReadonlyArray<ComboboxOption>;
  /** The selected option's value; "" for nothing selected. */
  value: string;
  onChange: (value: string) => void;
  /** Submits the value with the surrounding form. Omit for a controlled form
   *  that collects its own values. */
  name?: string;
  /** Ids the trigger so a Field's label can point at it. */
  id?: string;
  /** Shown on the trigger while nothing is selected. */
  placeholder?: string;
  /** Above this many options the search field appears. */
  searchThreshold?: number;
  searchPlaceholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Names the search field and the listbox for screen readers, e.g.
   *  "Hochschule". */
  label: string;
};

const TRIGGER =
  "flex w-full items-center justify-between gap-2 rounded-bdas border border-bdas-soft " +
  "bg-bdas-surface px-3 py-2.5 text-left text-base text-bdas-ink " +
  "transition-colors duration-bdas-quick ease-bdas " +
  "focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const TRIGGER_OPEN = "border-bdas-red";
const TRIGGER_INVALID = "border-bdas-red focus:ring-bdas-red/30";

const POPUP =
  "absolute z-10 mt-1 w-full overflow-hidden rounded-bdas border border-bdas-soft " +
  "bg-bdas-surface shadow-bdas-dropdown animate-bdas-fade-slide-down";

const SEARCH =
  "w-full border-b border-bdas-soft bg-bdas-surface px-3 py-2.5 text-base text-bdas-ink " +
  "placeholder:text-bdas-ink-muted focus:outline-none";

const OPTION =
  "cursor-pointer rounded-bdas-sm px-3 py-2 text-base text-bdas-ink-body " +
  "transition-colors duration-bdas-quick ease-bdas";

const OPTION_ACTIVE = "bg-bdas-surface-hover text-bdas-ink";
const OPTION_SELECTED = "text-bdas-red";

/**
 * A select that can be searched. Past `searchThreshold` options it grows a
 * filter field; below it the field would be noise, so the popup is just the
 * list. Either way the keyboard contract is the same.
 */
export function Combobox({
  options,
  value,
  onChange,
  name,
  id,
  placeholder = "— bitte wählen —",
  searchThreshold = SEARCH_THRESHOLD,
  searchPlaceholder = "Tippen zum Suchen …",
  invalid,
  disabled,
  label,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listboxId = `${generatedId}-listbox`;

  const searchable = shouldSearch(options.length, searchThreshold);
  const visible = useMemo(
    () => (searchable ? filterOptions(options, query) : options),
    [options, query, searchable],
  );

  const selected = options.find((o) => o.value === value);

  /** Re-rank on every keystroke, but do not let the highlight jump off the
   *  option the member was already on. */
  useEffect(() => {
    setActive((prev) => reconcileIndex(visible, visible[prev]?.value));
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  /** Keep the highlighted option in view during arrow-key travel — with 388
   *  universities it is otherwise off-screen immediately. */
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function close(focusTrigger = true) {
    setOpen(false);
    setQuery("");
    setActive(-1);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function pick(option: ComboboxOption) {
    onChange(option.value);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
      return;
    }

    if (e.key === "Enter" || (e.key === " " && !open)) {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (active >= 0 && visible[active]) pick(visible[active]);
      return;
    }

    if (e.key === "Tab") {
      if (open) close(false);
      return;
    }

    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (delta !== 0) {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((prev) => nextIndex(prev, visible.length, delta));
      return;
    }

    if (open && visible.length > 0 && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : visible.length - 1);
    }
  }

  const activeOptionId = active >= 0 && visible[active] ? `${listboxId}-${active}` : undefined;

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={invalid || undefined}
        {...(searchable ? {} : { role: "combobox", "aria-activedescendant": activeOptionId })}
        className={cx(TRIGGER, open && TRIGGER_OPEN, invalid && TRIGGER_INVALID)}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className={cx("truncate", selected ? "" : "text-bdas-ink-muted")}>
          {selected?.label ?? placeholder}
        </span>
        <span aria-hidden="true" className="text-bdas-ink-muted">
          ▾
        </span>
      </button>

      {open ? (
        <div className={POPUP}>
          {searchable ? (
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              aria-label={`${label} durchsuchen`}
              className={SEARCH}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          ) : null}

          {visible.length === 0 ? (
            <p className="px-3 py-2.5 text-base text-bdas-ink-muted">Kein Treffer</p>
          ) : (
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label={label}
              className="max-h-72 overflow-y-auto p-1"
            >
              {visible.map((option, i) => (
                <li
                  key={option.value}
                  id={`${listboxId}-${i}`}
                  role="option"
                  aria-selected={option.value === value}
                  /** What `<option value>` used to expose: the identity behind
                   *  the label, for anything reading the rendered list. */
                  data-value={option.value}
                  className={cx(
                    OPTION,
                    i === active && OPTION_ACTIVE,
                    option.value === value && OPTION_SELECTED,
                  )}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(option)}
                >
                  {option.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
