import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { SearchableFilter } from "./SearchableFilter";

const options = [
  { value: "CI", label: "Cote d'Ivoire" },
  { value: "MX", label: "Mexique" },
  { value: "PE", label: "Perou" },
];

function renderFilter(initialSelection = "", onSelect = vi.fn()) {
  function Harness() {
    const [searchText, setSearchText] = useState("");
    const [selectedValue, setSelectedValue] = useState(initialSelection);
    return (
      <SearchableFilter
        label="Pays"
        searchText={searchText}
        selectedValue={selectedValue}
        placeholder="Tous les pays"
        allLabel="Tous les pays"
        options={options}
        onSearchTextChange={(value) => {
          setSelectedValue("");
          setSearchText(value);
        }}
        onSelect={(value) => {
          onSelect(value);
          setSelectedValue(value);
          setSearchText("");
        }}
      />
    );
  }
  return { onSelect, ...render(<Harness />) };
}

it("opens the full list from disclosure", async () => {
  const user = userEvent.setup();
  renderFilter();
  const combobox = screen.getByRole("combobox", { name: "Pays" });
  await user.click(screen.getByRole("button", { name: "Afficher les options Pays" }));
  expect(combobox).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByRole("option")).toHaveLength(4);
});

it("opens from a click and reopens when focused but closed", async () => {
  const user = userEvent.setup();
  renderFilter();
  const combobox = screen.getByRole("combobox", { name: "Pays" });
  await user.click(combobox);
  expect(screen.getAllByRole("option")).toHaveLength(4);
  await user.keyboard("{Escape}");
  await user.click(combobox);
  expect(screen.getAllByRole("option")).toHaveLength(4);
});

it("filters while typing and announces the suggestion count politely", async () => {
  const user = userEvent.setup();
  renderFilter();
  await user.type(screen.getByRole("combobox", { name: "Pays" }), "per");
  expect(screen.getByRole("option", { name: "Perou" })).toBeVisible();
  expect(screen.queryByRole("option", { name: "Mexique" })).not.toBeInTheDocument();
  expect(screen.getByText("1 suggestion", { selector: "[aria-live='polite']" })).toBeVisible();
});

it("selects the exact option value then reopens the complete list", async () => {
  const user = userEvent.setup();
  const { onSelect } = renderFilter();
  const combobox = screen.getByRole("combobox", { name: "Pays" });
  await user.type(combobox, "mex");
  await user.click(screen.getByRole("option", { name: "Mexique" }));
  expect(onSelect).toHaveBeenCalledWith("MX");
  expect(combobox).toHaveValue("Mexique");
  expect(combobox).toHaveFocus();
  await user.click(combobox);
  expect(screen.getAllByRole("option")).toHaveLength(4);
});

it("uses aria-selected for selection and aria-activedescendant for navigation", async () => {
  const user = userEvent.setup();
  renderFilter("MX");
  const combobox = screen.getByRole("combobox", { name: "Pays" });
  await user.click(combobox);
  const selected = screen.getByRole("option", { name: "Mexique" });
  expect(selected).toHaveAttribute("aria-selected", "true");
  expect(combobox).toHaveAttribute("aria-activedescendant", selected.id);
  await user.keyboard("{ArrowDown}");
  expect(selected).toHaveAttribute("aria-selected", "true");
  expect(combobox.getAttribute("aria-activedescendant")).not.toBe(selected.id);
});

it("navigates with arrows, selects with Enter, and closes with Escape", async () => {
  const user = userEvent.setup();
  const { onSelect } = renderFilter();
  const combobox = screen.getByRole("combobox", { name: "Pays" });
  await user.click(combobox);
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onSelect).toHaveBeenCalledWith("CI");
  await user.click(combobox);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

it("closes when Tab moves focus outside", async () => {
  const user = userEvent.setup();
  render(<><SearchableFilter label="Pays" searchText="" selectedValue="" placeholder="Tous les pays" allLabel="Tous les pays" options={options} onSearchTextChange={vi.fn()} onSelect={vi.fn()} /><button>Apres</button></>);
  await user.click(screen.getByRole("combobox", { name: "Pays" }));
  await user.tab();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

it("clears selection and ignores navigation with no suggestions", async () => {
  const user = userEvent.setup();
  const selected = renderFilter("MX");
  await user.click(screen.getByRole("button", { name: "Effacer Pays" }));
  expect(selected.onSelect).toHaveBeenCalledWith("");
  const combobox = screen.getByRole("combobox", { name: "Pays" });
  await user.type(combobox, "inconnu");
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  expect(fireEvent.keyDown(combobox, { key: "ArrowDown" })).toBe(true);
});
