import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterOptions, type SearchableFilterOption } from "./searchableFilterUtils";

interface SearchableFilterProps {
  label: string;
  searchText: string;
  selectedValue: string;
  placeholder: string;
  allLabel: string;
  options: SearchableFilterOption[];
  onSearchTextChange: (value: string) => void;
  onSelect: (value: string) => void;
}

type DisplayedOption =
  | { kind: "all"; label: string }
  | { kind: "option"; option: SearchableFilterOption };

export function SearchableFilter({
  label,
  searchText,
  selectedValue,
  placeholder,
  allLabel,
  options,
  onSearchTextChange,
  onSelect,
}: SearchableFilterProps) {
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedOption = options.find((option) => option.value === selectedValue);
  const filteredOptions = useMemo(
    () => filterOptions(options, searchText),
    [options, searchText],
  );
  const displayedOptions = useMemo<DisplayedOption[]>(
    () => searchText.trim()
      ? filteredOptions.map((option) => ({ kind: "option", option }))
      : [
          { kind: "all", label: allLabel },
          ...options.map((option) => ({ kind: "option" as const, option })),
        ],
    [allLabel, filteredOptions, options, searchText],
  );
  const activeOption = displayedOptions[activeIndex];
  const inputValue = searchText || selectedOption?.label || "";

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function selectedIndex() {
    const index = displayedOptions.findIndex(
      (item) => item.kind === "option" && item.option.value === selectedValue,
    );
    return index >= 0 ? index : 0;
  }

  function openAt(index = selectedIndex()) {
    setActiveIndex(index);
    setIsOpen(true);
  }

  function selectOption(option: DisplayedOption) {
    onSelect(option.kind === "all" ? "" : option.option.value);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (displayedOptions.length === 0) return;
      event.preventDefault();
      if (!isOpen) {
        openAt(event.key === "ArrowDown" ? 0 : displayedOptions.length - 1);
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) =>
        (index + direction + displayedOptions.length) % displayedOptions.length,
      );
      return;
    }
    if (event.key === "Enter" && isOpen && activeOption) {
      event.preventDefault();
      selectOption(activeOption);
    }
  }

  return (
    <div
      ref={rootRef}
      className="searchable-filter"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      <div className="searchable-filter__control">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-activedescendant={
            isOpen && activeOption ? `${listboxId}-option-${activeIndex}` : undefined
          }
          value={inputValue}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => {
            onSearchTextChange(event.target.value);
            openAt(0);
          }}
          onFocus={(event) => {
            openAt();
            if (selectedValue && !searchText) event.currentTarget.select();
          }}
          onClick={() => openAt()}
          onKeyDown={handleKeyDown}
        />
        {inputValue ? (
          <button
            type="button"
            className="searchable-filter__clear"
            aria-label={`Effacer ${label}`}
            onClick={() => {
              onSelect("");
              onSearchTextChange("");
              setIsOpen(false);
              inputRef.current?.focus();
            }}
          >
            <span aria-hidden="true">x</span>
          </button>
        ) : null}
        <button
          type="button"
          className="searchable-filter__disclosure"
          aria-label={`${isOpen ? "Masquer" : "Afficher"} les options ${label}`}
          aria-expanded={isOpen}
          aria-controls={listboxId}
          onClick={() => {
            const shouldOpen = !isOpen;
            inputRef.current?.focus();
            if (shouldOpen) openAt();
            else setIsOpen(false);
          }}
        >
          <span aria-hidden="true">v</span>
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {filteredOptions.length} suggestion{filteredOptions.length === 1 ? "" : "s"}
      </span>
      {isOpen ? (
        <ul id={listboxId} className="searchable-filter__listbox" role="listbox">
          {displayedOptions.map((option, index) => {
            const value = option.kind === "all" ? "" : option.option.value;
            return (
              <li
                id={`${listboxId}-option-${index}`}
                key={option.kind === "all" ? "all" : `option:${option.option.value}:${index}`}
                role="option"
                aria-selected={value === selectedValue}
                className={index === activeIndex ? "is-active" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                {option.kind === "all" ? option.label : option.option.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
