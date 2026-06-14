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
        { id: "one", name: "STOP", role: "owner", visibility: "private" },
        {
          id: "two",
          name: "Collection officielle",
          role: null,
          visibility: "public_readonly",
        },
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
  expect(
    screen.getByRole("option", {
      name: /Collection officielle/i,
    }),
  ).toBeVisible();
});
