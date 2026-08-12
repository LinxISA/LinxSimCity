// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { TraceDropzone } from "./TraceDropzone.js";

afterEach(cleanup);

test("accepts one linxtrace file through the picker", async () => {
  const onLoad = vi.fn(async () => {});
  render(<TraceDropzone onLoad={onLoad} status="empty" />);
  const file = new File(["zip"], "matmul.linxtrace", {
    type: "application/zip",
  });
  await userEvent.upload(screen.getByLabelText(/choose trace/i), file);
  expect(onLoad).toHaveBeenCalledWith(file);
});

test("rejects a wrong extension and supports drag/drop", async () => {
  const onLoad = vi.fn(async () => {});
  render(<TraceDropzone onLoad={onLoad} status="empty" />);
  fireEvent.change(screen.getByLabelText(/choose trace/i), {
    target: { files: [new File(["bad"], "trace.zip")] },
  });
  expect(screen.getByRole("alert").textContent).toMatch(/\.linxtrace/i);
  expect(onLoad).not.toHaveBeenCalled();

  const valid = new File(["zip"], "fa.linxtrace");
  fireEvent.drop(screen.getByTestId("trace-dropzone"), {
    dataTransfer: { files: [valid] },
  });
  expect(onLoad).toHaveBeenCalledWith(valid);
});

test("shows load progress without hiding the picker", () => {
  render(<TraceDropzone onLoad={vi.fn()} status="loading" />);
  expect(screen.getByText(/validating trace/i)).toBeTruthy();
  expect(screen.getByLabelText(/choose trace/i)).toBeTruthy();
});
