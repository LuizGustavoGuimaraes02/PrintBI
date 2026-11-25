import './buffer-shim';
import type { CompanyView, QuoteView } from '@printbi/shared';
import { pdf, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { QuoteDocument, registerPdfFonts } from './QuoteDocument';

/**
 * The PDF library can't draw WebP or SVG, so the logo is asked from Cloudinary as PNG.
 * If it can't be fetched, the PDF is made without it rather than failing.
 */
export async function pdfLogoUrl(company: CompanyView): Promise<string | null> {
  const url = company.logo?.urls.thumb.replace('c_fill,g_auto', 'c_pad').replace('f_auto', 'f_png');
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

/** The document element; QuoteDocument renders a <Document>, which `pdf()` expects. */
const documentFor = (quote: QuoteView, company: CompanyView, logoUrl: string | null) => {
  registerPdfFonts();
  return createElement(QuoteDocument, {
    quote,
    company,
    logoUrl,
  }) as unknown as ReactElement<DocumentProps>;
};

/** Builds the PDF and hands it to the browser as a download named after the quote. */
export async function downloadQuotePdf(quote: QuoteView, company: CompanyView): Promise<void> {
  const logoUrl = await pdfLogoUrl(company);
  const blob = await pdf(documentFor(quote, company, logoUrl)).toBlob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${quote.code}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** A blob URL of the PDF, for the in-app preview. */
export async function quotePdfUrl(quote: QuoteView, company: CompanyView): Promise<string> {
  const logoUrl = await pdfLogoUrl(company);
  const blob = await pdf(documentFor(quote, company, logoUrl)).toBlob();
  return URL.createObjectURL(blob);
}
