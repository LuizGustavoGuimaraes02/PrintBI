import {
  breakdownSummary,
  formatMoney,
  toDecimalString,
  type CompanyView,
  type QuoteLineView,
  type QuoteView,
} from '@printbi/shared';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import grotesk400 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-400-normal.woff?url';
import grotesk600 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-600-normal.woff?url';
import grotesk700 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-700-normal.woff?url';
import { PDF_LABELS, type PdfLabels } from './labels';

// The app's typeface, self-hosted (no request to a font service when a PDF is made). The PDF
// uses Schibsted Grotesk throughout: the PDF engine can't embed IBM Plex Mono's accented letters
// (as in "VÁLIDO ATÉ"), so numbers use the same face, right-aligned in their columns.
const FONTS = [
  { src: grotesk400, fontWeight: 400 },
  { src: grotesk600, fontWeight: 600 },
  { src: grotesk700, fontWeight: 700 },
];

/**
 * Registers the fonts afresh. Called before every PDF: the engine keeps a loaded font between
 * documents and then drops letters a later document uses for the first time (an English "Quote"
 * after a Portuguese PDF lost its "Q"). Registering again loads clean copies; the browser serves
 * the files from its cache.
 */
export function registerPdfFonts() {
  Font.clear();
  // Clearing also drops the built-in Helvetica, which the engine falls back on internally.
  Font.register({
    family: 'Helvetica',
    fonts: [
      { src: 'Helvetica', fontWeight: 400 },
      { src: 'Helvetica-Bold', fontWeight: 700 },
    ],
  });
  Font.register({ family: 'Grotesk', fonts: FONTS });
  // Long words wrap whole instead of being hyphenated mid-word.
  Font.registerHyphenationCallback((word) => [word]);
}

const INK = '#14232A';
const MUTED = '#3A5560';
const RULE = '#D5DCDF';
const SOFT = '#EEF7F8';
const TEAL = '#0B6E7C';

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: 'Grotesk',
    // No "fi"/"fl" ligatures, so text copied from the PDF reads "profit", not "proft".
    fontFeatureSettings: { liga: false },
    fontSize: 9.5,
    color: INK,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  brand: { flexDirection: 'row', gap: 12, alignItems: 'center', maxWidth: 300 },
  logo: { width: 52, height: 52, objectFit: 'contain' },
  businessName: { fontSize: 15, fontWeight: 700 },
  contact: { color: MUTED, fontSize: 8.5, marginTop: 2, lineHeight: 1.4 },
  docTitle: { fontSize: 24, fontWeight: 700, textAlign: 'right' },
  code: { fontSize: 11, textAlign: 'right', color: TEAL, marginTop: 2 },
  meta: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 18,
    padding: 12,
    backgroundColor: SOFT,
    borderRadius: 8,
  },
  metaBlock: { flexGrow: 1 },
  label: {
    fontSize: 7,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  title: { fontSize: 13, fontWeight: 600, marginBottom: 10 },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 5,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
  },
  subRow: { flexDirection: 'row', paddingVertical: 2.5, paddingLeft: 12 },
  colDesc: { flexGrow: 1, flexBasis: 0, paddingRight: 8 },
  colQty: { width: 70, textAlign: 'right' },
  colUnit: { width: 78, textAlign: 'right' },
  colAmount: { width: 80, textAlign: 'right' },
  mono: {},
  muted: { color: MUTED },
  breakdown: {
    marginTop: 4,
    marginBottom: 2,
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: TEAL,
    backgroundColor: '#F7FBFB',
  },
  totals: { marginTop: 12, marginLeft: 'auto', width: 230 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: INK,
  },
  grandText: { fontSize: 13, fontWeight: 700 },
  terms: { marginTop: 22, gap: 10 },
  termText: { lineHeight: 1.45 },
  note: { marginTop: 18, fontSize: 8, color: MUTED, lineHeight: 1.4 },
  thanks: { marginTop: 14, fontSize: 11, fontWeight: 600, color: TEAL },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
  },
});

export interface QuoteDocumentProps {
  quote: QuoteView;
  company: CompanyView;
  /** A PNG/JPG address the PDF library can draw; null leaves the logo out. */
  logoUrl: string | null;
}

function formatDate(iso: string, locale: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1)),
  );
}

/** Quantities: up to 2 decimals, in the document's language. */
function quantity(micro: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    Number(toDecimalString(micro)),
  );
}

/** The breakdown shows only when it still describes the line (same quantity it was made for). */
const showsBreakdown = (quote: QuoteView, line: QuoteLineView) =>
  quote.showBreakdown &&
  Boolean(line.breakdown?.length) &&
  line.breakdownQuantity === line.quantity;

/** The quote as a PDF. Every printed amount comes from the stored totals, so it adds up. */
export function QuoteDocument({ quote, company, logoUrl }: QuoteDocumentProps) {
  const t: PdfLabels = PDF_LABELS[quote.language];
  const money = (amount: number, precision: 'cents' | 'unit' = 'cents') =>
    formatMoney(
      { amount, currency: quote.currency },
      { locale: t.locale, display: 'symbol', precision },
    );
  const contact = [company.email, company.phone, company.website, company.social].filter(Boolean);

  return (
    <Document title={`${t.quote} ${quote.code}`} author={company.name} language={quote.language}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.brand}>
            {logoUrl && <Image src={logoUrl} style={s.logo} />}
            <View>
              <Text style={s.businessName}>{company.name}</Text>
              {company.address && <Text style={s.contact}>{company.address}</Text>}
              {contact.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 }}>
                  {contact.map((item) => (
                    <Text key={item} style={s.contact}>
                      {item}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </View>
          <View>
            <Text style={s.docTitle}>{t.quote}</Text>
            <Text style={s.code}>{quote.code}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.metaBlock}>
            <Text style={s.label}>{t.to}</Text>
            <Text style={{ fontWeight: 600 }}>{quote.customer.name}</Text>
            {quote.customer.company && <Text style={s.muted}>{quote.customer.company}</Text>}
            {[quote.customer.email, quote.customer.phone].filter(Boolean).length > 0 && (
              <Text style={s.muted}>
                {[quote.customer.email, quote.customer.phone].filter(Boolean).join('  ·  ')}
              </Text>
            )}
            {quote.customer.address && <Text style={s.muted}>{quote.customer.address}</Text>}
          </View>
          <View>
            <Text style={s.label}>{t.issued}</Text>
            <Text style={s.mono}>{formatDate(quote.issuedAt, t.locale)}</Text>
            {quote.validUntil && (
              <>
                <Text style={[s.label, { marginTop: 6 }]}>{t.validUntil}</Text>
                <Text style={s.mono}>{formatDate(quote.validUntil, t.locale)}</Text>
              </>
            )}
          </View>
        </View>

        {quote.title && <Text style={s.title}>{quote.title}</Text>}

        <View style={s.tableHead} fixed>
          <Text style={[s.colDesc, s.label, { marginBottom: 0 }]}>{t.description}</Text>
          <Text style={[s.colQty, s.label, { marginBottom: 0 }]}>{t.quantity}</Text>
          <Text style={[s.colUnit, s.label, { marginBottom: 0 }]}>{t.unitPrice}</Text>
          <Text style={[s.colAmount, s.label, { marginBottom: 0 }]}>{t.amount}</Text>
        </View>

        {quote.lines.map((line, index) => {
          const summary = line.breakdown ? breakdownSummary(line.breakdown, line.amount) : null;
          return (
            <View key={index} style={s.row} wrap={false}>
              <View style={{ flexGrow: 1 }}>
                <View style={{ flexDirection: 'row' }}>
                  <Text style={s.colDesc}>{line.description}</Text>
                  <Text style={[s.colQty, s.mono]}>
                    {quantity(line.quantity, t.locale)}
                    {line.unit ? ` ${line.unit}` : ''}
                  </Text>
                  <Text style={[s.colUnit, s.mono]}>{money(line.unitPrice)}</Text>
                  <Text style={[s.colAmount, s.mono]}>{money(line.amount)}</Text>
                </View>
                {line.discount > 0 && (
                  <Text style={[s.muted, { fontSize: 8, marginTop: 2 }]}>
                    {t.discount}: −{money(line.discount)}
                  </Text>
                )}
                {showsBreakdown(quote, line) && line.breakdown && summary && (
                  <View style={s.breakdown}>
                    {line.breakdown.map((row, i) => (
                      <View key={i} style={s.subRow}>
                        <Text style={[s.colDesc, s.muted]}>
                          {row.label ? `${t.kinds[row.kind]} · ${row.label}` : t.kinds[row.kind]}
                        </Text>
                        <Text style={[s.colQty, s.mono, s.muted]}>
                          {row.quantity !== null && row.unit
                            ? `${quantity(row.quantity, t.locale)} ${t.units[row.unit]}`
                            : '—'}
                        </Text>
                        <Text style={[s.colUnit, s.mono, s.muted]}>
                          {row.unitPrice !== null ? money(row.unitPrice, 'unit') : '—'}
                        </Text>
                        <Text style={[s.colAmount, s.mono, s.muted]}>{money(row.amount)}</Text>
                      </View>
                    ))}
                    <View
                      style={[
                        s.subRow,
                        { borderTopWidth: 0.5, borderTopColor: RULE, marginTop: 2, paddingTop: 4 },
                      ]}
                    >
                      <Text style={[s.colDesc, { fontWeight: 600 }]}>{t.estimatedCost}</Text>
                      <Text style={[s.colAmount, s.mono, { fontWeight: 500 }]}>
                        {money(summary.cost)}
                      </Text>
                    </View>
                    <View style={s.subRow}>
                      <Text style={s.colDesc}>{t.addedProfit}</Text>
                      <Text style={[s.colAmount, s.mono]}>{money(summary.profit)}</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={s.muted}>{t.subtotal}</Text>
            <Text style={s.mono}>{money(quote.subtotal)}</Text>
          </View>
          {quote.discount > 0 && (
            <View style={s.totalRow}>
              <Text style={s.muted}>{t.discount}</Text>
              <Text style={s.mono}>−{money(quote.discount)}</Text>
            </View>
          )}
          {quote.delivery > 0 && (
            <View style={s.totalRow}>
              <Text style={s.muted}>{t.delivery}</Text>
              <Text style={s.mono}>{money(quote.delivery)}</Text>
            </View>
          )}
          {quote.taxes.map((tax, i) => (
            <View key={i} style={s.totalRow}>
              <Text style={s.muted}>
                {tax.label} ({quantity(tax.percent, t.locale)}%)
              </Text>
              <Text style={s.mono}>{money(tax.amount)}</Text>
            </View>
          ))}
          <View style={s.grandTotal}>
            <Text style={s.grandText}>{t.total}</Text>
            <Text style={[s.grandText, s.mono]}>{money(quote.total)}</Text>
          </View>
        </View>

        <View style={s.terms} wrap={false}>
          {quote.leadTime && (
            <View>
              <Text style={s.label}>{t.leadTime}</Text>
              <Text style={s.termText}>{quote.leadTime}</Text>
            </View>
          )}
          {quote.deliveryMethod && (
            <View>
              <Text style={s.label}>{t.deliveryMethod}</Text>
              <Text style={s.termText}>{quote.deliveryMethod}</Text>
            </View>
          )}
          {quote.paymentTerms && (
            <View>
              <Text style={s.label}>{t.paymentTerms}</Text>
              <Text style={s.termText}>{quote.paymentTerms}</Text>
            </View>
          )}
          {quote.notes && (
            <View>
              <Text style={s.label}>{t.notes}</Text>
              <Text style={s.termText}>{quote.notes}</Text>
            </View>
          )}
        </View>

        <Text style={s.note}>{t.estimate}</Text>
        <Text style={s.thanks}>{t.thanks}</Text>

        <View style={s.footer} fixed>
          <Text>
            {company.name} · {quote.code}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `${t.page} ${pageNumber} ${t.of} ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
