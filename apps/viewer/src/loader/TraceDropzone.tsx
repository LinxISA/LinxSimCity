import { useId, useState, type ChangeEvent, type DragEvent } from "react";

import type { PlayerStatus } from "../player/types.js";

interface TraceDropzoneProps {
  readonly onLoad: (file: File) => Promise<void> | void;
  readonly status: PlayerStatus;
}

export function TraceDropzone({ onLoad, status }: TraceDropzoneProps) {
  const inputId = useId();
  const [localError, setLocalError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".linxtrace")) {
      setLocalError(
        "Choose a .linxtrace bundle; other archive types are not supported.",
      );
      return;
    }
    setLocalError(undefined);
    void onLoad(file);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.currentTarget.files?.[0]);
    event.currentTarget.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="trace-loader">
      <div
        className={`trace-dropzone${dragging ? " is-dragging" : ""}`}
        data-testid="trace-dropzone"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="dropzone-icon" aria-hidden="true">
          ↗
        </div>
        <div>
          <strong>
            {status === "loading" ? "Validating trace…" : "Open trace bundle"}
          </strong>
          <span>Drop a .linxtrace file or browse locally</span>
        </div>
        <label className="primary-button" htmlFor={inputId}>
          Choose trace
        </label>
        <input
          id={inputId}
          aria-label="Choose trace file"
          type="file"
          accept=".linxtrace"
          onChange={onChange}
        />
        {status === "loading" ? (
          <div className="loader-scan" aria-hidden="true" />
        ) : null}
      </div>
      {localError ? (
        <p className="inline-error" role="alert">
          {localError}
        </p>
      ) : null}
    </div>
  );
}
