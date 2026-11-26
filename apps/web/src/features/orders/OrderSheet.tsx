import { BLOCK_REASONS, ORDER_PRIORITIES, PAYMENT_STATUSES, type OrderType } from '@printbi/shared';
import {
  Banknote,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  Disc3,
  Flag,
  Hash,
  Hourglass,
  Image as ImageIcon,
  NotebookPen,
  Package,
  Printer,
  Shapes,
  Tags,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn, Hint } from '../../design-system';
import { toField } from '../../lib/money';
import { useCan } from '../auth/account';
import { LabelPicker } from '../catalog/LabelPicker';
import { useLabels, useProducts } from '../catalog/queries';
import { CustomerDialog } from '../customers/CustomerDialog';
import { useCustomers } from '../customers/queries';
import { usePrinters } from '../settings/queries';
import type { FileField } from './form';
import { HOLD_OPTION, PAYMENT_LABEL, PRIORITY_LABEL, TYPE_LABEL } from './labels';
import { PrintFileDrop } from './PrintFileDrop';
import { SpoolPicker } from './SpoolPicker';
import type { OrderFormState } from './useOrderForm';

interface OrderSheetProps {
  state: OrderFormState;
  /** New orders can be filled from a print file and start already waiting for something. */
  isNew: boolean;
  /** The extra properties (price, payment, labels…) are open. */
  more: boolean;
  onMore: (more: boolean) => void;
  quoteCode?: string;
  /** The saved order's picture, when editing. */
  existingPicture?: string | null;
}

/**
 * An order as a title and a short list of properties, one per line (label left, value right).
 * The few that matter every time are always there; the rest open with "Show more".
 */
export function OrderSheet({
  state,
  isNew,
  more,
  onMore,
  quoteCode,
  existingPicture = null,
}: OrderSheetProps) {
  const { form, set, setForm, errors, owned, file } = state;
  const ids = useId();
  const canSeeMoney = useCan('finance:view');
  const canPay = useCan('finance:manage');
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: printers = [] } = usePrinters();
  const { data: labels = [] } = useLabels();
  const [addingCustomer, setAddingCustomer] = useState(false);
  const sale = form.type === 'sale';
  const id = (name: string) => `${ids}-${name}`;
  const fromFile = (key: FileField) =>
    owned.has(key) && (
      <span className="label-mono shrink-0 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] text-teal-ink">
        from file
      </span>
    );

  const setType = (type: OrderType) =>
    setForm((f) => ({
      ...f,
      type,
      // A personal job is for you; a customer only makes sense for a sale or a gift.
      ...(type === 'personal' && f.recipientKind === 'customer' && { recipientKind: 'myself' }),
      ...(type !== 'sale' && { quoteId: '' }),
    }));
  const pickProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    setForm((f) => ({
      ...f,
      productId,
      title: f.title || product?.name || '',
      ...(product?.price &&
        canSeeMoney &&
        !f.agreedPrice && {
          agreedPrice: toField(product.price.amount * Number(f.quantity || 1)),
          currency: product.price.currency,
        }),
    }));
  };
  const recipientValue =
    form.recipientKind === 'customer' ? `c:${form.customerId}` : form.recipientKind;
  const pickRecipient = (value: string) => {
    if (value === 'new') setAddingCustomer(true);
    else if (value.startsWith('c:')) {
      setForm((f) => ({ ...f, recipientKind: 'customer', customerId: value.slice(2) }));
    } else setForm((f) => ({ ...f, recipientKind: value as 'name' | 'myself' }));
  };
  const pickedRolls = form.filaments.map((f) => f.itemId);
  const activePrinters = printers.filter((p) => p.status !== 'retired' || p.id === form.printerId);
  const extra = [
    sale && canSeeMoney && 'price',
    sale && 'payment',
    isNew && 'waiting',
    'priority',
    'labels',
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-col gap-1 px-2.5">
        <label htmlFor={id('title')} className="sr-only">
          Title
        </label>
        <div className="flex items-center gap-3">
          <input
            id={id('title')}
            value={form.title}
            placeholder="Untitled print"
            aria-invalid={Boolean(errors.title)}
            onChange={(e) => set('title', e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[26px] leading-tight font-extrabold tracking-[-0.02em] outline-none placeholder:text-steel md:text-[30px]"
          />
          {fromFile('title')}
        </div>
        {errors.title && <p className="text-[13px] text-hot-ink">{errors.title}</p>}
        <label htmlFor={id('note')} className="sr-only">
          Note
        </label>
        <textarea
          id={id('note')}
          rows={1}
          value={form.description}
          placeholder="Add a note…"
          onChange={(e) => set('description', e.target.value)}
          className="field-sizing-content max-h-40 resize-none bg-transparent text-[15px] outline-none placeholder:text-steel"
        />
      </div>

      {isNew && (
        <div className="px-2.5 pt-2 pb-1">
          <PrintFileDrop
            file={file}
            printerMatched={owned.has('printerId') || !file?.printerModel}
            onFile={(info) => state.takeFile(info, printers)}
            onRemove={state.dropFile}
          />
        </div>
      )}

      <Prop icon={ImageIcon} label="Picture" top>
        <PictureField state={state} existing={existingPicture} />
      </Prop>

      <Prop icon={Disc3} label="Filament" top>
        <SpoolPicker
          value={pickedRolls}
          fileMaterial={file?.material}
          onChange={(rolls) =>
            set(
              'filaments',
              rolls.map(
                (itemId) =>
                  form.filaments.find((f) => f.itemId === itemId) ?? { itemId, grams: '' },
              ),
            )
          }
        />
        {errors.filaments && <Error text={errors.filaments} />}
      </Prop>

      <Prop icon={User} label="For whom" htmlFor={id('who')} top>
        <Select
          id={id('who')}
          value={recipientValue}
          onChange={(e) => pickRecipient(e.target.value)}
        >
          <option value="name">Someone (type a name)</option>
          <option value="myself">Myself or the workshop</option>
          {form.type !== 'personal' && (
            <optgroup label="Customers">
              {form.recipientKind === 'customer' && !form.customerId && (
                <option value="c:">Choose a customer…</option>
              )}
              {customers
                .filter((c) => !c.archived || c.id === form.customerId)
                .map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>
                    {c.name}
                    {c.company ? ` · ${c.company}` : ''}
                  </option>
                ))}
              <option value="new">+ New customer…</option>
            </optgroup>
          )}
        </Select>
        {form.recipientKind === 'name' && (
          <input
            aria-label="Name"
            value={form.recipientName}
            placeholder="Type their name"
            aria-invalid={Boolean(errors['recipient.name'])}
            onChange={(e) => set('recipientName', e.target.value)}
            className={cn(control, 'mt-1')}
          />
        )}
        {(errors['recipient.name'] || errors['recipient.customerId']) && (
          <Error text={errors['recipient.name'] ?? errors['recipient.customerId']!} />
        )}
      </Prop>

      <Prop icon={Shapes} label="Type">
        <div role="group" aria-label="Type" className="flex gap-1 px-1">
          {(['sale', 'gift', 'personal'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={form.type === t}
              onClick={() => setType(t)}
              className={cn(
                'h-9 rounded-full px-3.5 text-[14px] font-semibold',
                form.type === t ? 'bg-ink text-white' : 'text-ink-muted hover:bg-bench',
              )}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </Prop>

      <Prop icon={CalendarDays} label="Due date" htmlFor={id('due')}>
        <input
          id={id('due')}
          type="date"
          value={form.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
          className={cn(control, 'w-auto', !form.dueDate && 'text-steel')}
        />
        {errors.dueDate && <Error text={errors.dueDate} />}
      </Prop>

      <Prop icon={Printer} label="Printer" htmlFor={id('printer')} after={fromFile('printerId')}>
        <Select
          id={id('printer')}
          value={form.printerId}
          onChange={(e) => set('printerId', e.target.value)}
        >
          <option value="">None yet</option>
          {activePrinters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.status === 'maintenance' ? ' (maintenance)' : ''}
            </option>
          ))}
        </Select>
      </Prop>

      <Prop icon={Hash} label="Quantity" htmlFor={id('qty')} after={fromFile('quantity')}>
        <input
          id={id('qty')}
          inputMode="numeric"
          value={form.quantity}
          aria-invalid={Boolean(errors.quantity)}
          onChange={(e) => set('quantity', e.target.value)}
          className={cn(control, 'figure w-28')}
        />
        {errors.quantity && <Error text={errors.quantity} />}
      </Prop>

      {more && (
        <>
          {sale && canSeeMoney && (
            <Prop icon={Banknote} label="Price" htmlFor={id('price')}>
              <div className="flex items-center gap-2">
                <input
                  id={id('price')}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.agreedPrice}
                  aria-invalid={Boolean(errors['agreedPrice.amount'])}
                  onChange={(e) => set('agreedPrice', e.target.value)}
                  className={cn(control, 'figure w-36')}
                />
                <span className="figure text-[13px] text-ink-muted">{form.currency}</span>
              </div>
              {errors['agreedPrice.amount'] && <Error text={errors['agreedPrice.amount']} />}
            </Prop>
          )}
          {sale && (
            <Prop icon={CircleCheck} label="Payment" htmlFor={id('payment')}>
              <Select
                id={id('payment')}
                value={form.paymentStatus}
                disabled={!canPay}
                title={canPay ? undefined : 'Changed by people who manage finances'}
                onChange={(e) => set('paymentStatus', e.target.value as typeof form.paymentStatus)}
              >
                {PAYMENT_STATUSES.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Prop>
          )}
          {isNew && (
            <Prop icon={Hourglass} label="Waiting for" htmlFor={id('waiting')}>
              <Select
                id={id('waiting')}
                value={form.holdReason}
                onChange={(e) => set('holdReason', e.target.value as typeof form.holdReason)}
              >
                <option value="">Nothing, ready to start</option>
                {BLOCK_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {HOLD_OPTION[r]}
                  </option>
                ))}
              </Select>
            </Prop>
          )}
          <Prop icon={Flag} label="Priority" htmlFor={id('priority')}>
            <Select
              id={id('priority')}
              value={form.priority}
              onChange={(e) => set('priority', e.target.value as typeof form.priority)}
            >
              {ORDER_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Prop>
          <Prop icon={Tags} label="Labels" top>
            <div className="px-1">
              <LabelPicker
                labels={labels}
                value={form.labelIds}
                onChange={(ids) => set('labelIds', ids)}
                error={errors.labelIds}
                hideLegend
              />
            </div>
          </Prop>
          {!isNew && (
            <>
              <Prop icon={Package} label="Product" htmlFor={id('product')}>
                <Select
                  id={id('product')}
                  value={form.productId}
                  onChange={(e) => pickProduct(e.target.value)}
                >
                  <option value="">Not in the catalog</option>
                  {products
                    .filter((p) => !p.archived || p.id === form.productId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </Prop>
              <Prop icon={NotebookPen} label="Private notes" htmlFor={id('internal')} top>
                <textarea
                  id={id('internal')}
                  rows={2}
                  value={form.internalNotes}
                  placeholder="Only your team sees this"
                  onChange={(e) => set('internalNotes', e.target.value)}
                  className={cn(control, 'field-sizing-content h-auto min-h-10 resize-none py-2')}
                />
              </Prop>
            </>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => onMore(!more)}
        className="mt-1 self-start rounded-full px-2.5 py-1.5 text-[14px] font-semibold text-teal hover:bg-bench"
      >
        {more ? 'Show fewer' : `Show ${extra} more`}
      </button>

      {sale && quoteCode && (
        <p className="px-2.5 text-[13px] text-ink-muted">
          Linked to quote <span className="figure font-semibold text-ink">{quoteCode}</span>.
        </p>
      )}

      {addingCustomer && (
        <CustomerDialog
          onClose={() => setAddingCustomer(false)}
          onSaved={(customer) => {
            setForm((f) => ({ ...f, recipientKind: 'customer', customerId: customer.id }));
            setAddingCustomer(false);
          }}
        />
      )}
    </div>
  );
}

/** A value that reads as text until hovered or focused. */
const control =
  'h-10 w-full min-w-0 rounded-[10px] border-[1.5px] border-transparent bg-transparent px-2.5 text-[15px] outline-none hover:border-rule focus:border-teal aria-invalid:border-hot';

function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative flex items-center">
      <select
        {...props}
        className={cn(
          control,
          'cursor-pointer appearance-none pr-8 disabled:cursor-default',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 text-ink-muted"
      />
    </span>
  );
}

function Prop({
  icon: Icon,
  label,
  htmlFor,
  top,
  after,
  children,
}: {
  icon: LucideIcon;
  label: string;
  htmlFor?: string;
  /** Aligns the label to the top, for tall values such as the roll list. */
  top?: boolean;
  after?: ReactNode;
  children: ReactNode;
}) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div
      className={cn(
        'grid gap-1 rounded-xl px-2.5 py-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3',
        top ? 'sm:items-start' : 'sm:items-center',
      )}
    >
      <Label
        htmlFor={htmlFor}
        className={cn('flex items-center gap-2.5 text-[14px] text-ink-muted', top && 'sm:pt-2.5')}
      >
        <Icon size={17} aria-hidden="true" className="shrink-0 text-steel" />
        {label}
      </Label>
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {after && <span className="pt-2.5">{after}</span>}
      </div>
    </div>
  );
}

/** The card picture: the file's plate preview, a chosen photo, or none. */
function PictureField({ state, existing }: { state: OrderFormState; existing: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { picture } = state;
  const shown =
    picture.kind === 'new' ? picture.dataUrl : picture.kind === 'keep' ? existing : null;
  const pick = async (blob: Blob | undefined) => {
    if (!blob) return;
    setProblem(null);
    try {
      await state.choosePicture(blob);
    } catch (e) {
      setProblem(e instanceof globalThis.Error ? e.message : 'This picture could not be read.');
    } finally {
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="flex flex-col gap-1 px-1">
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-bench">
          {shown ? (
            <img src={shown} alt="Card picture" className="size-full object-contain" />
          ) : (
            <ImageIcon size={20} aria-hidden="true" className="text-steel" />
          )}
        </div>
        <div className="flex flex-col items-start gap-0.5">
          <Hint text="Shown at the top of the card on the board. A plate preview from the print file is used when there is one.">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="rounded-full px-2 py-1 text-[13px] font-semibold text-teal hover:bg-bench"
            >
              {shown ? 'Change picture' : 'Choose a picture'}
            </button>
          </Hint>
          {shown && (
            <button
              type="button"
              onClick={() => state.setPicture({ kind: existing ? 'remove' : 'keep' })}
              className="rounded-full px-2 py-1 text-[13px] font-semibold text-ink-muted hover:bg-bench hover:text-ink"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      {picture.kind === 'new' && picture.fromFile && (
        <p className="text-[12px] text-ink-muted">From the print file</p>
      )}
      {problem && <p className="text-[13px] text-hot-ink">{problem}</p>}
    </div>
  );
}

function Error({ text }: { text: string }) {
  return <p className="px-2.5 pt-0.5 text-[13px] text-hot-ink">{text}</p>;
}
