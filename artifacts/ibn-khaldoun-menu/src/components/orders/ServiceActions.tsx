import { BellRing, ReceiptText, ClipboardList } from "lucide-react";
import "./orders.css";

export type ServiceActionsProps = {
  hasSession: boolean;
  waiterPending: boolean;
  billPending: boolean;
  onWaiterCall(): void;
  onViewSession(): void;
  onOpenBill(): void;
};

export default function ServiceActions({
  hasSession,
  waiterPending,
  billPending,
  onWaiterCall,
  onViewSession,
  onOpenBill,
}: ServiceActionsProps) {
  return (
    <nav className="guest-service-actions" dir="rtl" aria-label="خدمات الطاولة" data-testid="panel-service-actions">
      <button
        type="button"
        className="guest-service-action"
        onClick={onWaiterCall}
        disabled={waiterPending && hasSession}
        aria-label={waiterPending ? "تم طلب حضور العامل" : "طلب حضور العامل"}
        data-testid="button-request-waiter"
      >
        <span className="guest-action-icon"><BellRing size={18} /></span>
        <span><strong>{waiterPending ? "تم طلب العامل" : "نادِ العامل"}</strong><small>{waiterPending ? "سيصل إليك قريباً" : "نحن بقربك"}</small></span>
      </button>
      <button
        type="button"
        className="guest-service-action"
        onClick={onViewSession}
        disabled={!hasSession}
        aria-label="عرض طلبات الجلسة"
        data-testid="button-view-session"
      >
        <span className="guest-action-icon"><ClipboardList size={18} /></span>
        <span><strong>طلباتك</strong><small>{hasSession ? "تابع ما طلبته" : "بعد أول طلب"}</small></span>
      </button>
      <button
        type="button"
        className="guest-service-action guest-service-bill"
        onClick={onOpenBill}
        aria-label={billPending ? "تم طلب الحساب" : "عرض الحساب وطلب الفاتورة"}
        data-testid="button-open-bill"
      >
        <span className="guest-action-icon"><ReceiptText size={18} /></span>
        <span><strong>{billPending ? "الحساب قيد التجهيز" : "الحساب"}</strong><small>{billPending ? "طلبك وصلنا" : "عندما تنتهي"}</small></span>
      </button>
    </nav>
  );
}
