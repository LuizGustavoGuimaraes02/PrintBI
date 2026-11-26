import type { PrinterView } from '@printbi/shared';
import { useState } from 'react';
import { applyPrintFile, clearPrintFile, type FileField, type OrderForm } from './form';
import { shrinkPicture } from './picture';
import { matchPrinter, type PrintFileInfo } from './printFile';

/**
 * The card picture while editing: unchanged, a new one to upload (from the file or chosen),
 * or removed.
 */
export type PictureChange =
  { kind: 'keep' } | { kind: 'new'; dataUrl: string; fromFile: boolean } | { kind: 'remove' };

/** The order being written: its fields, what a print file filled, and the save errors. */
export function useOrderForm(initial: OrderForm) {
  const [form, setForm] = useState(initial);
  const [owned, setOwned] = useState<Set<FileField>>(() => new Set());
  const [file, setFile] = useState<PrintFileInfo | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picture, setPicture] = useState<PictureChange>({ kind: 'keep' });

  /** A photo the person picked, shrunk for the card. */
  const choosePicture = async (blob: Blob) =>
    setPicture({ kind: 'new', dataUrl: await shrinkPicture(blob), fromFile: false });

  /** Sets a field; one the file filled stops showing "from file" once the person edits it. */
  const set = <K extends keyof OrderForm>(key: K, value: OrderForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (owned.has(key as FileField)) {
      setOwned((prev) => {
        const next = new Set(prev);
        next.delete(key as FileField);
        return next;
      });
    }
  };
  const takeFile = (info: PrintFileInfo, printers: PrinterView[]) => {
    const result = applyPrintFile(
      form,
      { ...info, printerId: matchPrinter(info.printerModel, printers) },
      owned,
    );
    setForm(result.form);
    setOwned(result.owned);
    setFile(info);
    // The plate preview becomes the card picture, unless the person chose one.
    if (info.thumbnail && !(picture.kind === 'new' && !picture.fromFile)) {
      const blob = new Blob([info.thumbnail.bytes as BlobPart], { type: info.thumbnail.type });
      void shrinkPicture(blob)
        .then((dataUrl) => setPicture({ kind: 'new', dataUrl, fromFile: true }))
        .catch(() => undefined);
    }
  };
  const dropFile = () => {
    setForm(clearPrintFile(form, owned));
    setOwned(new Set());
    setFile(null);
    if (picture.kind === 'new' && picture.fromFile) setPicture({ kind: 'keep' });
  };
  const reset = (next: OrderForm) => {
    setForm(next);
    setOwned(new Set());
    setFile(null);
    setErrors({});
    setPicture({ kind: 'keep' });
  };
  return {
    form,
    setForm,
    set,
    owned,
    file,
    takeFile,
    dropFile,
    reset,
    errors,
    setErrors,
    picture,
    setPicture,
    choosePicture,
  };
}

export type OrderFormState = ReturnType<typeof useOrderForm>;
