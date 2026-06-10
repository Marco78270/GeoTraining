import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the GeoTrainer Atlas brand", () => {
  render(<App />);

  expect(screen.getByText("GeoTrainer")).toBeInTheDocument();
  expect(screen.getByText("Atlas")).toBeInTheDocument();
});
