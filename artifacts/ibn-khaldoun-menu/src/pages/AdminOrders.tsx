import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, BellRing, Check, CheckCheck, ChevronLeft, Clock3, CreditCard, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  adminCloseDiningSession,
  adminMarkDiningSessionPaid,
  adminMarkOrderPaid,
  adminMarkOrderItemServed,
  adminMarkOrderServed,
  loadAdminOrders,
  type AdminOrdersSnapshot,
  type AdminServiceRequest,
  type DiningSession,
  type SessionOrder,
  type SessionOrderItem,
} from "@/lib/orders";
import "./admin-orders.css";

export type AdminOrdersProps = { isActive: boolean };

const money = (amount: number) => `${amount.toLocaleString("ar-SY")} ل.س`;
const time = (value: string) => new Intl.DateTimeFormat("ar-SY", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("ar-SY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));

function elapsed(openedAt: string, closedAt: string | null, now: number) {
  const seconds = Math.max(0, Math.floor((new Date(closedAt ?? now).getTime() - new Date(openedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0 ? `${hours.toLocaleString("ar-SY")} س ${String(minutes).padStart(2, "0")} د` : `${minutes.toLocaleString("ar-SY")} د ${String(remainder).padStart(2, "0")} ث`;
}

function playCounterBell(context: AudioContext) {
  try {
    const master = context.createGain();
    const startAt = context.currentTime + 0.01;
    master.gain.setValueAtTime(0.22, startAt);
    master.connect(context.destination);

    // Inharmonic partials with a long decay give the alert a small counter-bell ring.
    for (const [frequency, volume, decay] of [
      [1760, 0.22, 1.25],
      [2489, 0.13, 1.05],
      [3510, 0.075, 0.82],
      [4580, 0.04, 0.62],
    ]) {
      const oscillator = context.createOscillator();
      const partial = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      partial.gain.setValueAtTime(0.0001, startAt);
      partial.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
      partial.gain.exponentialRampToValueAtTime(0.0001, startAt + decay);
      oscillator.connect(partial);
      partial.connect(master);
      oscillator.start(startAt);
      oscillator.stop(startAt + decay + 0.03);
    }

    master.gain.setValueAtTime(0.22, startAt);
    master.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.3);
  } catch {
    // Audio may be unavailable in this browser.
  }
}

function requestLabel(request: AdminServiceRequest) {
  return request.type === "waiter" ? "طلب حضور العامل" : "طلب الحساب";
}

function ItemRow({ item, busyId, onServe }: { item: SessionOrderItem; busyId: string | null; onServe(id: string): void }) {
  return (
    <div className={`orders-line ${item.status === "served" ? "is-served" : ""} ${item.status === "cancelled" ? "is-cancelled" : ""}`} data-testid={`row-admin-order-item-${item.id}`}>
      <div className="orders-line-main">
        <strong>{item.quantity.toLocaleString("ar-SY")} × {item.itemName}</strong>
        <small>{[item.variantName, item.sugar ? `سكر ${item.sugar}` : null].filter(Boolean).join(" · ") || "بدون خيارات إضافية"}</small>
        {item.excludedIngredients.length > 0 && <small>بدون {item.excludedIngredients.join("، ")}</small>}
        {item.servedAt && <small>قُدّم في {time(item.servedAt)}</small>}
      </div>
      <div className="orders-line-side">
        <b>{money(item.total)}</b>
        {item.status === "pending" ? (
          <button type="button" className="orders-small-action" disabled={busyId === item.id} onClick={() => onServe(item.id)} data-testid={`button-serve-item-${item.id}`}>{busyId === item.id ? "جارٍ…" : "تم التقديم"}</button>
        ) : <span className={`orders-item-status ${item.status}`}>{item.status === "served" ? "قُدّم" : "ملغى"}</span>}
      </div>
    </div>
  );
}

function CloseSessionAction({ session, busyId, runAction, compact = false, testIdSuffix = session.id }: { session: DiningSession; busyId: string | null; runAction(id: string, action: () => Promise<void>): void; compact?: boolean; testIdSuffix?: string }) {
  const [warningOpen, setWarningOpen] = useState(false);
  const hasServedUnpaidOrder = session.orders.some((order) => order.status === "served" && !order.paidAt);
  const close = () => runAction(session.id, () => adminCloseDiningSession(session.id));
  return (
    <>
      <button type="button" className={`orders-close-action ${compact ? "is-compact" : ""}`} disabled={busyId === session.id || Boolean(session.closedAt)} onClick={hasServedUnpaidOrder ? () => setWarningOpen(true) : close} data-testid={`button-close-session-${testIdSuffix}`}>
        {busyId === session.id ? "جارٍ التحديث…" : "إغلاق الجلسة"}
      </button>
      <AlertDialog open={warningOpen} onOpenChange={setWarningOpen}>
        <AlertDialogContent className="orders-warning-dialog" dir="rtl" data-testid={`dialog-close-session-warning-${testIdSuffix}`}>
          <AlertDialogHeader>
            <AlertDialogTitle>إغلاق جلسة فيها طلبات قُدّمت وغير مدفوعة؟</AlertDialogTitle>
            <AlertDialogDescription>يوجد طلب قُدّم ولم يُسجّل دفعه بعد. سيؤدي الإغلاق على أي حال إلى إنهاء الجلسة دون تحصيل هذا المبلغ.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="orders-warning-actions">
            <AlertDialogCancel data-testid={`button-cancel-close-session-${testIdSuffix}`}>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="orders-warning-confirm" disabled={busyId === session.id} onClick={(event) => { event.preventDefault(); setWarningOpen(false); close(); }} data-testid={`button-confirm-close-session-${testIdSuffix}`}>{busyId === session.id ? "جارٍ التحديث…" : "إغلاق على أي حال"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OrderCard({ order, session, busyId, runAction }: { order: SessionOrder; session: DiningSession; busyId: string | null; runAction(id: string, action: () => Promise<void>): void }) {
  const canServe = order.status === "received" && order.items.some((item) => item.status === "pending");
  const itemCount = order.items.reduce((count, item) => count + item.quantity, 0);
  const itemPreview = order.items.slice(0, 2).map((item) => `${item.quantity.toLocaleString("ar-SY")} × ${item.itemName}`).join("، ");
  return (
    <Dialog>
      <article className="orders-order-card" data-testid={`card-admin-order-${order.id}`}>
        <div className="orders-order-actions" aria-label={`إجراءات طلب الطاولة ${order.tableNumber}`}>
          {canServe && <button type="button" className="orders-order-serve" disabled={busyId === order.id} onClick={() => runAction(order.id, () => adminMarkOrderServed(order.id))} data-testid={`button-serve-order-${order.id}`}><CheckCheck size={15} />{busyId === order.id ? "جارٍ…" : "تم التقديم"}</button>}
          {!session.paidAt && <button type="button" className="orders-pay-action orders-card-pay" disabled={busyId === session.id} onClick={() => runAction(session.id, () => adminMarkDiningSessionPaid(session.id))} data-testid={`button-mark-session-paid-from-order-${order.id}`}><CreditCard size={14} />{busyId === session.id ? "جارٍ…" : "تحصيل حساب الجلسة"}</button>}
          {!session.closedAt && !session.paidAt && <CloseSessionAction session={session} busyId={busyId} runAction={runAction} compact testIdSuffix={`${session.id}-${order.id}`} />}
          {session.paidAt && <span className="orders-card-settled"><Check size={13} /> مدفوع</span>}
        </div>
        <DialogTrigger asChild>
          <button type="button" className="orders-order-card-content" data-testid={`button-open-admin-order-${order.id}`} aria-label={`تفاصيل طلب الطاولة ${order.tableNumber}، ${dateTime(order.createdAt)}`}>
            <span className="orders-order-card-head">
              <span className={`orders-order-status ${order.status}`}>{order.status === "served" ? "مكتمل" : order.status === "cancelled" ? "ملغى" : "طلب جديد"}</span>
              <span className="orders-order-table">طاولة {order.tableNumber}</span>
              <span className={`orders-order-paid ${order.paidAt ? "is-paid" : "is-unpaid"}`} data-testid={`status-order-payment-${order.id}`}>{order.paidAt ? "مدفوع" : "غير مدفوع"}</span>
              <time dateTime={order.createdAt}>{time(order.createdAt)}</time>
            </span>
            <strong className="orders-order-preview">{itemPreview || "لا توجد أصناف"}</strong>
            <span className="orders-order-card-foot">
              <span>{itemCount.toLocaleString("ar-SY")} {itemCount === 1 ? "صنف" : "أصناف"}</span>
              <b>{money(order.total)}</b>
              <span className="orders-order-open">التفاصيل <ChevronLeft size={15} /></span>
            </span>
          </button>
        </DialogTrigger>
      </article>
      <DialogContent className="orders-detail-dialog" dir="rtl">
        <DialogHeader className="orders-detail-heading">
          <span className={`orders-order-status ${order.status}`}>{order.status === "served" ? "مكتمل" : order.status === "cancelled" ? "ملغى" : "طلب جديد"}</span>
          <DialogTitle>طلب الطاولة {order.tableNumber}</DialogTitle>
          <DialogDescription>{dateTime(order.createdAt)}</DialogDescription>
          <span className={`orders-order-paid ${order.paidAt ? "is-paid" : "is-unpaid"}`} data-testid={`status-order-payment-detail-${order.id}`}>{order.paidAt ? "مدفوع" : "غير مدفوع"}</span>
        </DialogHeader>
        <div className="orders-detail-items">
          {order.items.map((item) => <ItemRow key={item.id} item={item} busyId={busyId} onServe={(id) => runAction(id, () => adminMarkOrderItemServed(id))} />)}
        </div>
        <footer className="orders-order-total"><span>مجموع الطلب</span><b>{money(order.total)}</b></footer>
        <div className="orders-detail-actions">
          {canServe && <button type="button" className="orders-order-serve orders-detail-serve" disabled={busyId === order.id} onClick={() => runAction(order.id, () => adminMarkOrderServed(order.id))} data-testid={`button-serve-order-detail-${order.id}`}><CheckCheck size={16} />{busyId === order.id ? "جارٍ التحديث…" : "تم تقديم الطلب"}</button>}
          {!order.paidAt && order.status !== "cancelled" && <button type="button" className="orders-pay-action orders-detail-pay" disabled={busyId === order.id} onClick={() => runAction(order.id, () => adminMarkOrderPaid(order.id))} data-testid={`button-mark-order-paid-detail-${order.id}`}><CreditCard size={15} />{busyId === order.id ? "جارٍ التحديث…" : "تسجيل دفع هذا الطلب"}</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SessionCard({ session, now, busyId, runAction }: { session: DiningSession; now: number; busyId: string | null; runAction(id: string, action: () => Promise<void>): void }) {
  const isClosed = Boolean(session.closedAt);
  return (
    <article className={`orders-session-card ${isClosed ? "is-closed" : ""}`} data-testid={`card-dining-session-${session.id}`}>
      <header className="orders-session-head">
        <div className="orders-table-stamp"><span>طاولة</span><strong>{session.tableNumber}</strong></div>
        <div className="orders-session-details">
          <h2>جلسة الطاولة {session.tableNumber}</h2>
          <div className="orders-session-meta"><span><Clock3 size={14} /> {elapsed(session.openedAt, session.closedAt, now)}</span><span>بدأت {dateTime(session.openedAt)}</span>{isClosed && <span className="orders-closed-label">أُغلقت {dateTime(session.closedAt!)}</span>}</div>
        </div>
        <div className="orders-session-value"><small>المبلغ المتبقي</small><strong>{money(session.total)}</strong>{session.tipAmount > 0 && <small>يشمل إكرامية {money(session.tipAmount)}</small>}</div>
      </header>
      <div className="orders-session-flags">
        <span className={session.paidAt ? "is-paid" : "is-unpaid"}>{session.paidAt ? <><Check size={13} /> مدفوع</> : <><CreditCard size={13} /> غير مدفوع</>}</span>
        {session.waiterRequested && <span className="is-request">طلب عامل</span>}
        {session.billRequested && <span className="is-request">طلب حساب</span>}
      </div>
      <div className="orders-session-orders">
        {session.orders.length === 0 ? <p className="orders-no-orders">لا توجد طلبات مسجلة في هذه الجلسة.</p> : session.orders.map((order) => <OrderCard key={order.id} order={order} session={session} busyId={busyId} runAction={runAction} />)}
      </div>
      {session.orders.length === 0 && (!session.paidAt || !isClosed) && (
        <footer className="orders-session-actions">
          {!session.paidAt && <button type="button" className="orders-pay-action" disabled={busyId === session.id} onClick={() => runAction(session.id, () => adminMarkDiningSessionPaid(session.id))} data-testid={`button-mark-session-paid-${session.id}`}><CreditCard size={16} />{busyId === session.id ? "جارٍ التحديث…" : "تسجيل الدفع وإغلاق الجلسة"}</button>}
          {!isClosed && !session.paidAt && <CloseSessionAction session={session} busyId={busyId} runAction={runAction} />}
        </footer>
      )}
    </article>
  );
}

export default function AdminOrders({ isActive }: AdminOrdersProps) {
  const [snapshot, setSnapshot] = useState<AdminOrdersSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const knownRequestIds = useRef<Set<string> | null>(null);
  const knownOrderIds = useRef<Set<string> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const queuedBellRef = useRef(0);

  const unlockAlertSound = useCallback(() => {
    try {
      const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;
      if (context.state === "running") {
        if (queuedBellRef.current > 0) {
          queuedBellRef.current = 0;
          playCounterBell(context);
        }
        return;
      }
      void context.resume().then(() => {
        if (context.state !== "running" || queuedBellRef.current === 0) return;
        queuedBellRef.current = 0;
        playCounterBell(context);
      }).catch(() => undefined);
    } catch {
      // Browser audio is optional; requests still appear in the admin panel.
    }
  }, []);

  const ringForNewActivity = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") {
      queuedBellRef.current += 1;
      return;
    }
    playCounterBell(context);
  }, []);

  useEffect(() => {
    window.addEventListener("pointerdown", unlockAlertSound);
    window.addEventListener("keydown", unlockAlertSound);
    return () => {
      window.removeEventListener("pointerdown", unlockAlertSound);
      window.removeEventListener("keydown", unlockAlertSound);
      void audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, [unlockAlertSound]);

  const refresh = useCallback(async (initial = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (initial) setLoading(true);
    try {
      const next = await loadAdminOrders();
      if (!mounted.current) return;
      const pending = next.requests.filter((request) => request.status === "pending");
      const currentIds = new Set(pending.map((request) => request.id));
      const currentOrderIds = new Set(next.sessions.flatMap((session) => session.orders.map((order) => order.id)));
      let newServiceRequest = false;
      if (knownRequestIds.current === null) {
        knownRequestIds.current = currentIds;
        newServiceRequest = pending.length > 0;
      } else {
        newServiceRequest = pending.some((request) => !knownRequestIds.current?.has(request.id));
        knownRequestIds.current = currentIds;
      }
      let newOrder = false;
      if (knownOrderIds.current === null) {
        knownOrderIds.current = currentOrderIds;
      } else {
        newOrder = [...currentOrderIds].some((id) => !knownOrderIds.current?.has(id));
        knownOrderIds.current = currentOrderIds;
      }
      if (newServiceRequest || newOrder) {
        try { navigator.vibrate?.([180, 90, 180]); } catch { /* vibration is optional */ }
        ringForNewActivity();
      }
      setSnapshot(next);
      setError("");
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error && caught.message ? caught.message : "تعذّر تحميل الطلبات. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [ringForNewActivity]);

  useEffect(() => {
    mounted.current = true;
    void refresh(true);
    const interval = window.setInterval(() => { void refresh(); }, 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.clearInterval(clock);
    };
  }, [refresh]);

  const runAction = async (id: string, action: () => Promise<void>) => {
    if (busyId) return;
    setBusyId(id);
    setError("");
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "تعذّر حفظ التغيير. حاول مرة أخرى.");
    } finally {
      setBusyId(null);
    }
  };

  const pendingRequests = snapshot?.requests.filter((request) => request.status === "pending") ?? [];
  const openSessions = snapshot?.sessions.filter((session) => !session.closedAt) ?? [];
  const recentSessions = snapshot?.sessions.filter((session) => Boolean(session.closedAt)) ?? [];

  return (
    <>
      <section className="orders-admin" dir="rtl" hidden={!isActive} data-testid="panel-admin-orders" aria-label="طلبات الطاولات">
        <div className="orders-page-heading">
          <div><span className="orders-eyebrow"><i /> متابعة الطاولات</span><h1>طلبات وخدمة الطاولات</h1><p>كل ما يحتاج الانتباه الآن، في مكان واحد.</p></div>
          <div className="orders-live-state"><span className="orders-live-dot" /> تحديث تلقائي كل ٥ ثوانٍ <button type="button" aria-label="تحديث الطلبات الآن" onClick={() => void refresh()} data-testid="button-refresh-orders"><RefreshCw size={15} /> تحديث</button></div>
        </div>
        <div className="orders-overview" data-testid="panel-orders-summary">
          <div><span>جلسات مفتوحة</span><strong data-testid="text-open-session-count">{(openSessions.length).toLocaleString("ar-SY")}</strong></div>
          <div><span>طلبات تنتظر الانتباه</span><strong className={pendingRequests.length ? "has-pending" : ""} data-testid="text-pending-request-count">{pendingRequests.length.toLocaleString("ar-SY")}</strong></div>
          <div className="orders-overview-aside">{snapshot ? `آخر تحديث ${time(new Date(now).toISOString())}` : "بانتظار أول تحديث"}</div>
        </div>
        {error && <div className="orders-alert" role="alert" data-testid="status-orders-error"><AlertCircle size={17} /><span>{error}</span><button type="button" onClick={() => void refresh(true)} data-testid="button-retry-orders">إعادة المحاولة</button></div>}
        {loading && !snapshot ? <div className="orders-skeleton-list" role="status" data-testid="status-orders-loading">{[1, 2].map((item) => <div className="orders-skeleton-card" key={item}><i /><div><b /><b /><b /></div></div>)}</div> : (
          <>
            <section className="orders-section orders-requests-section" aria-labelledby="orders-requests-heading">
              <div className="orders-section-heading"><div><span>تنبيهات مباشرة</span><h2 id="orders-requests-heading">طلبات الخدمة</h2></div><b>{pendingRequests.length.toLocaleString("ar-SY")}</b></div>
              {pendingRequests.length === 0 ? <p className="orders-no-requests" data-testid="status-no-service-requests">لا توجد طلبات خدمة جديدة.</p> : <div className="orders-request-list">{pendingRequests.map((request) => <article className={`orders-request-card ${request.type}`} key={request.id} data-testid={`card-service-request-${request.id}`}><span className="orders-request-mark"><BellRing size={18} /></span><div className="orders-request-copy"><strong>{requestLabel(request)}</strong><small>طاولة {request.tableNumber}{request.type === "bill" && request.billAmount !== null ? ` · ${money(request.billAmount)}` : ""}</small><time dateTime={request.createdAt}>وصل {dateTime(request.createdAt)}</time></div></article>)}</div>}
            </section>
            <section className="orders-section" aria-labelledby="orders-open-heading">
              <div className="orders-section-heading"><div><span>الآن</span><h2 id="orders-open-heading">جلسات مفتوحة</h2></div><b>{openSessions.length.toLocaleString("ar-SY")}</b></div>
              {openSessions.length === 0 ? <div className="orders-empty" data-testid="status-no-open-sessions"><span className="orders-empty-rule" /><h3>الطاولات هادئة الآن</h3><p>ستظهر الجلسات الجديدة هنا فور وصولها.</p></div> : <div className="orders-session-list">{openSessions.map((session) => <SessionCard key={session.id} session={session} now={now} busyId={busyId} runAction={runAction} />)}</div>}
            </section>
            {recentSessions.length > 0 && <section className="orders-section orders-recent-section" aria-labelledby="orders-recent-heading"><div className="orders-section-heading"><div><span>آخر ٢٤ ساعة</span><h2 id="orders-recent-heading">جلسات مغلقة</h2></div><b>{recentSessions.length.toLocaleString("ar-SY")}</b></div><div className="orders-session-list">{recentSessions.map((session) => <SessionCard key={session.id} session={session} now={now} busyId={busyId} runAction={runAction} />)}</div></section>}
          </>
        )}
      </section>
    </>
  );
}
