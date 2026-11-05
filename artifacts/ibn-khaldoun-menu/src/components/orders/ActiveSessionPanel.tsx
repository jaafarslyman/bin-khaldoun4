import { Check, Clock3, X } from "lucide-react";
import type { DiningSession } from "@/lib/orders";
import "./orders.css";

export type ActiveSessionPanelProps = {
  isOpen: boolean;
  session: DiningSession | null;
  loading: boolean;
  error: string;
  busyId: string | null;
  onClose(): void;
  onCancelOrder(orderId: string): Promise<void>;
  onCancelItem(itemId: string): Promise<void>;
};

const money = (amount: number) => `${amount.toLocaleString("ar-SY")} ل.س`;
const time = (value: string) =>
  new Intl.DateTimeFormat("ar-SY", { hour: "numeric", minute: "2-digit" }).format(new Date(value));

export default function ActiveSessionPanel({
  isOpen,
  session,
  loading,
  error,
  busyId,
  onClose,
  onCancelOrder,
  onCancelItem,
}: ActiveSessionPanelProps) {
  if (!isOpen) return null;
  return (
    <div className="guest-order-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="guest-order-sheet" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="session-panel-title" data-testid="dialog-active-session">
        <header className="guest-order-head">
          <div><span className="guest-order-kicker">طاولة {session?.tableNumber ?? "—"}</span><h2 id="session-panel-title">طلبات جلستك</h2></div>
          <button type="button" className="guest-order-close" onClick={onClose} aria-label="إغلاق الطلبات" data-testid="button-close-session"><X size={19} /></button>
        </header>
        {loading && !session ? (
          <div className="guest-order-loading" role="status" data-testid="status-session-loading"><i /><i /><i />جارٍ تحميل طلباتك</div>
        ) : error ? (
          <div className="guest-order-error" role="alert" data-testid="status-session-error">{error}</div>
        ) : !session ? (
          <div className="guest-order-empty" data-testid="status-session-empty"><span>—</span><h3>لا توجد جلسة مفتوحة</h3><p>أرسل أول طلب لتظهر تفاصيل جلستك هنا.</p></div>
        ) : (
          <div className="guest-session-orders">
            {session.orders.length === 0 ? <div className="guest-order-empty"><h3>لم يصل طلب بعد</h3><p>سيظهر طلبك هنا بعد إرساله.</p></div> : session.orders.map((order) => (
              <article className="guest-session-order" key={order.id} data-testid={`card-session-order-${order.id}`}>
                <header className="guest-session-order-head">
                  <span><Clock3 size={14} /> {time(order.createdAt)}</span>
                  <b>{order.status === "served" ? "تم التقديم" : order.status === "cancelled" ? "ملغى" : "قيد التحضير"}</b>
                </header>
                <div className="guest-session-lines">
                  {order.items.map((item) => (
                    <div className={`guest-session-line ${item.status === "cancelled" ? "is-cancelled" : ""}`} key={item.id} data-testid={`row-session-item-${item.id}`}>
                      <div className="guest-session-line-copy">
                        <strong>{item.quantity.toLocaleString("ar-SY")} × {item.itemName}</strong>
                        <small>{[item.variantName, item.sugar ? `سكر ${item.sugar}` : null].filter(Boolean).join(" · ") || " "}</small>
                        {item.excludedIngredients.length > 0 && <small>بدون {item.excludedIngredients.join("، ")}</small>}
                      </div>
                      <div className="guest-session-line-end">
                        <b>{money(item.total)}</b>
                        {item.status === "served" ? <span className="guest-line-state"><Check size={13} /> قُدّم</span> : item.status === "cancelled" ? <span className="guest-line-state">ملغى</span> : (
                          <button type="button" className="guest-cancel-link" disabled={busyId === item.id || busyId === order.id} onClick={() => void onCancelItem(item.id)} data-testid={`button-cancel-session-item-${item.id}`}>{busyId === item.id ? "جارٍ الإلغاء…" : "إلغاء الصنف"}</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <footer className="guest-session-order-foot">
                  <span>مجموع الطلب</span><b>{money(order.total)}</b>
                  {order.items.length > 0 && order.items.every((item) => item.status === "pending") && <button type="button" className="guest-cancel-order" disabled={busyId === order.id} onClick={() => void onCancelOrder(order.id)} data-testid={`button-cancel-session-order-${order.id}`}>{busyId === order.id ? "جارٍ الإلغاء…" : "إلغاء الطلب بالكامل"}</button>}
                </footer>
              </article>
            ))}
            <div className="guest-session-total"><span>إجمالي الجلسة</span><strong>{money(session.total)}</strong></div>
          </div>
        )}
      </section>
    </div>
  );
}
