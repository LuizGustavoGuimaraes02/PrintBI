import { FileUp, LoaderCircle } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { cn } from '../../design-system';
import { showMinutes } from './labels';
import {
  blobSource,
  PrintFileError,
  readPrintFile,
  SUPPORTED_EXTENSIONS,
  type PrintFileInfo,
} from './printFile';

interface PrintFileDropProps {
  file: PrintFileInfo | null;
  /** False when the file names a printer that is not one of yours. */
  printerMatched: boolean;
  onFile: (info: PrintFileInfo) => void;
  onRemove: () => void;
}

/** Drop or pick a slicer file; it is read here and never uploaded. */
export function PrintFileDrop({ file, printerMatched, onFile, onRemove }: PrintFileDropProps) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const read = async (picked: File | undefined) => {
    if (!picked) return;
    setProblem(null);
    setReading(true);
    try {
      onFile(await readPrintFile(picked.name, blobSource(picked)));
    } catch (e) {
      setProblem(
        e instanceof PrintFileError ? e.message : 'This file could not be read. Fill it in below.',
      );
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    void read(event.dataTransfer.files[0]);
  };
  const dragProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop,
  };
  const picker = (
    <input
      ref={input}
      type="file"
      accept={SUPPORTED_EXTENSIONS.join(',')}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => void read(e.target.files?.[0])}
    />
  );

  if (file) {
    const facts = [
      file.printerModel &&
        (printerMatched ? file.printerModel : `${file.printerModel} (not yours)`),
      file.material,
      file.plates > 1 && `${file.plates} plates`,
      file.objects && `${file.objects} ${file.objects === 1 ? 'part' : 'parts'}`,
      file.minutes !== null && showMinutes(file.minutes),
      file.grams !== null && `${file.gramsEstimated ? '≈ ' : ''}${Math.round(file.grams)} g`,
    ].filter(Boolean);
    return (
      <div
        {...dragProps}
        className={cn(
          'flex items-center gap-3 rounded-[var(--radius-tile)] bg-bench p-3',
          over && 'ring-2 ring-teal',
        )}
      >
        <Thumbnail file={file} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <strong className="truncate text-[14px]">{file.fileName}</strong>
          <span className="text-[13px] leading-snug text-ink-muted">
            {facts.length === 0
              ? 'Nothing to fill from this file'
              : facts.map((fact, i) => (
                  <span key={i} className="whitespace-nowrap">
                    {i > 0 && ' · '}
                    {fact}
                  </span>
                ))}
          </span>
          {file.kind === '3mf' && file.minutes === null && (
            <span className="text-[13px] text-ink-muted">Not sliced yet: no time or weight.</span>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full px-2 py-1 text-[13px] font-semibold text-ink-muted hover:bg-surface hover:text-ink"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="rounded-full px-2 py-1 text-[13px] font-semibold text-teal hover:bg-surface"
          >
            Change
          </button>
        </div>
        {picker}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        {...dragProps}
        onClick={() => input.current?.click()}
        disabled={reading}
        className={cn(
          'flex items-center gap-3 rounded-[var(--radius-tile)] border-2 border-dashed px-4 py-3 text-left',
          over ? 'border-teal bg-teal-soft' : 'border-[#9FC9CF] bg-[#F7FBFC] hover:border-teal',
        )}
      >
        {reading ? (
          <LoaderCircle size={26} aria-hidden="true" className="shrink-0 animate-spin text-teal" />
        ) : (
          <FileUp size={26} aria-hidden="true" className="shrink-0 text-teal" />
        )}
        <span className="flex flex-col gap-0.5">
          <b className="text-[15px]">{reading ? 'Reading the file…' : 'Drop a .3mf or .gcode'}</b>
          <span className="text-[13px] text-ink-muted">
            Optional. Fills title, printer, quantity and more; the file is not stored.
          </span>
        </span>
      </button>
      {problem && (
        <p role="alert" className="px-1 text-[13px] text-hot-ink">
          {problem}
        </p>
      )}
      {picker}
    </div>
  );
}

/** The slicer's preview as a data URL: small, and nothing to revoke afterwards. */
function previewUrl(thumbnail: NonNullable<PrintFileInfo['thumbnail']>): string {
  let binary = '';
  for (let i = 0; i < thumbnail.bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...thumbnail.bytes.subarray(i, i + 0x8000));
  }
  return `data:${thumbnail.type};base64,${btoa(binary)}`;
}

function Thumbnail({ file }: { file: PrintFileInfo }) {
  const url = useMemo(() => (file.thumbnail ? previewUrl(file.thumbnail) : null), [file]);
  return (
    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface">
      {url ? (
        <img src={url} alt="" className="size-full object-contain" />
      ) : (
        <FileUp size={22} aria-hidden="true" className="text-steel" />
      )}
    </div>
  );
}
