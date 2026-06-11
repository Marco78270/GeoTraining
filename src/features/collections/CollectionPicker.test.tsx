import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CollectionPicker } from "./CollectionPicker";

it("selects an active collection with an accessible label", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <CollectionPicker
      collections={[
        { id: "one", name: "STOP", role: "owner" },
        { id: "two", name: "Bollards", role: "editor" },
      ]}
      value="one"
      onChange={onChange}
    />,
  );

  await user.selectOptions(
    screen.getByRole("combobox", { name: "Collection active" }),
    "two",
  );
  expect(onChange).toHaveBeenCalledWith("two");
});
