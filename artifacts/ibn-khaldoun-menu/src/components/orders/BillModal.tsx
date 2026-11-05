import { ArrowLeft, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { DiningSession } from "@/lib/orders";
import "./orders.css";

export type BillModalProps = {
  isOpen: boolean;
  session: DiningSession | null;
  isSubmitting: boolean;
  error: string;
  billRequested: boolean;
  onClose(): void;
  onRequestBill(tipAmount: number): Promise<void>;
};

const money = (amount: number) => `${amount.toLocaleString("ar-SY")} ل.س`;

export default function BillModal({
  isOpen,
  session,
  isSubmitting,
  error,
  billRequested,
  onClose,
  onRequestBill,
}: BillModalProps) {
  const [tip, setTip] = useState("");
  useEffect(() => {
    if (isOpen) setTip(session?.tipAmount ? String(session.tipAmount) : "");
  }, [isOpen, session?.id, session?.tipAmount]);
  if (!isOpen) return null;
  const items = session?.orders.flatMap((order) => order.items.filter((item) => item.status !== "cancelled")) ?? [];
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const normalizedTip = tip.trim();
  const tipAmount = normalizedTip === "" ? 0 : Number(normalizedTip);
  const tipIsValid =
    normalizedTip === "" ||
    (/^\d{1,13}$/.test(normalizedTip) &&
      Number.isSafeInteger(tipAmount) &&
      tipAmount <= 1_000_000_000_000);
  return (
    <div className="guest-order-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onClose(); }}>
      <section className="guest-order-sheet guest-bill-sheet" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="bill-modal-title" data-testid="dialog-bill">
        <header className="guest-order-head">
          <div><span className="guest-order-kicker">بن خلدون · طاولة {session?.tableNumber ?? "—"}</span><h2 id="bill-modal-title">الحساب</h2></div>
          <button type="button" className="guest-order-close" onClick={onClose} disabled={isSubmitting} aria-label="إغلاق الحساب" data-testid="button-close-bill"><X size={19} /></button>
        </header>
        {!session ? <div className="guest-order-empty"><h3>الحساب غير متاح</h3><p>افتح جلسة طاولة لعرض الحساب.</p></div> : (
          <>
            <div className="guest-receipt" data-testid="receipt-session">
              <div className="guest-receipt-brand"><span>بن خلدون</span><small>حساب الطاولة {session.tableNumber}</small></div>
              <div className="guest-receipt-lines">
                {items.length === 0 ? <p className="guest-receipt-empty">لا توجد أصناف في الحساب بعد.</p> : items.map((item) => (
                  <div className="guest-receipt-row" key={item.id} data-testid={`row-receipt-item-${item.id}`}>
                    <div><strong>{item.itemName}</strong>{(item.variantName || item.sugar) && <small>{[item.variantName, item.sugar ? `سكر ${item.sugar}` : null].filter(Boolean).join(" · ")}</small>}<small>{item.quantity.toLocaleString("ar-SY")} × {money(item.unitPrice)}</small></div>
                    <b>{money(item.total)}</b>
                  </div>
                ))}
              </div>
              <div className="guest-receipt-total"><span>المجموع</span><strong>{money(subtotal)}</strong></div>
              {tipAmount > 0 && <div className="guest-receipt-tip"><span>إكرامية</span><b>{money(tipAmount)}</b></div>}
              <div className="guest-receipt-grand"><span>الإجمالي</span><strong>{money(subtotal + tipAmount)}</strong></div>
              <p className="guest-receipt-note">شكراً لزيارتكم، ونرجو أن نراكم قريباً.</p>
            </div>
            <label className="guest-tip-field"><span>إكرامية اختيارية <small>ل.س</small></span><input type="number" min="0" max="1000000000000" step="1" inputMode="numeric" value={tip} onChange={(event) => setTip(event.target.value)} placeholder="0" aria-label="مبلغ الإكرامية الاختياري" data-testid="input-bill-tip" /></label>
            {error && <p className="guest-order-error" role="alert" data-testid="status-bill-error">{error}</p>}
            {billRequested ? <div className="guest-bill-requested" role="status" data-testid="status-bill-requested">تم طلب الحساب. سيأتيكم العامل لإتمام الدفع.</div> : (
              <button type="button" className="guest-bill-submit" disabled={isSubmitting || !session || !tipIsValid} onClick={() => void onRequestBill(tipAmount)} data-testid="button-request-bill">
                {isSubmitting ? "جارٍ إرسال الطلب…" : "اطلب الحساب"} <ArrowLeft size={17} />
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
