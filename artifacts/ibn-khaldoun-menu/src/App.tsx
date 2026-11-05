import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  LoaderCircle,
  Minus,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Route, Switch } from "wouter";
import AdminPanel from "@/pages/AdminPanel";
import NotFound from "@/pages/not-found";
import {
  cancelSessionOrder,
  cancelSessionOrderItem,
  getActiveTableSession,
  requestBill,
  requestWaiter,
  type DiningSession,
} from "@/lib/orders";
import {
  fetchMenu,
  isSupabaseConfigured,
  placeOrder,
  type Dish,
  type DishVariant,
  type IngredientOption,
  type OrderReceipt,
} from "@/lib/supabase";
import ActiveSessionPanel from "@/components/orders/ActiveSessionPanel";
import BillModal from "@/components/orders/BillModal";
import ServiceActions from "@/components/orders/ServiceActions";

type CartEntry = {
  id: string;
  dish: Dish;
  variant: DishVariant | null;
  excludedIngredients: IngredientOption[];
  price: number;
  quantity: number;
  sugar: string;
};

const money = (amount: number) => `${amount.toLocaleString("ar-SY")} ل.س`;
const LAST_TABLE_NUMBER_KEY = "ben-khaldoun:last-table-number";
const sessionStorageKey = (tableNumber: string) =>
  `ben-khaldoun:table-session:${encodeURIComponent(tableNumber)}`;

function readLastTableNumber() {
  try {
    return window.localStorage.getItem(LAST_TABLE_NUMBER_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function rememberLastTableNumber(tableNumber: string) {
  try {
    window.localStorage.setItem(LAST_TABLE_NUMBER_KEY, tableNumber);
  } catch {
    // Table entry remains available in the current app state.
  }
}

function readStoredSessionId(tableNumber: string) {
  try {
    return window.localStorage.getItem(sessionStorageKey(tableNumber));
  } catch {
    return null;
  }
}

function rememberTableSession(tableNumber: string, sessionId: string) {
  try {
    window.localStorage.setItem(LAST_TABLE_NUMBER_KEY, tableNumber);
    window.localStorage.setItem(sessionStorageKey(tableNumber), sessionId);
  } catch {
    // The order is still active in Supabase if local storage is unavailable.
  }
}

function CustomerMenu() {
  const queryTable =
    new URLSearchParams(window.location.search)
      .get("table")
      ?.trim()
      .slice(0, 30) ?? "";
  const [category, setCategory] = useState("الكل");
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dish, setDish] = useState<Dish | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [excludedIngredientIds, setExcludedIngredientIds] = useState<string[]>([]);
  const [sugar, setSugar] = useState("قليل");
  const [quantity, setQuantity] = useState(1);
  const [itemLimitReached, setItemLimitReached] = useState(false);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<OrderReceipt | null>(null);
  const [tableNumber, setTableNumber] = useState(
    () => queryTable || readLastTableNumber(),
  );
  const [tableError, setTableError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [activeSession, setActiveSession] = useState<DiningSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [billSubmitting, setBillSubmitting] = useState(false);
  const [billError, setBillError] = useState("");
  const [waiterCallPending, setWaiterCallPending] = useState(false);
  const [waiterCallSubmitting, setWaiterCallSubmitting] = useState(false);
  const [serviceError, setServiceError] = useState("");
  const [tablePromptOpen, setTablePromptOpen] = useState(false);
  const [tablePromptValue, setTablePromptValue] = useState("");
  const [tablePromptError, setTablePromptError] = useState("");
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [menuLoading, setMenuLoading] = useState(isSupabaseConfigured);
  const [menuError, setMenuError] = useState("");
  const menuRequestInFlight = useRef(false);
  const customerMenuMounted = useRef(false);

  const refreshCustomerSession = useCallback(
    async (
      table: string,
      sessionId: string,
      isCurrent: () => boolean = () => true,
    ) => {
      const session = await getActiveTableSession(table, sessionId);
      if (!isCurrent()) return session;
      setActiveSession((current) =>
        JSON.stringify(current) === JSON.stringify(session) ? current : session,
      );
      setWaiterCallPending(Boolean(session?.waiterRequested));
      setSessionError("");
      if (!session) {
        try {
          if (window.localStorage.getItem(sessionStorageKey(table)) === sessionId) {
            window.localStorage.removeItem(sessionStorageKey(table));
          }
        } catch {
          // The server remains the source of truth when storage is unavailable.
        }
      }
      return session;
    },
    [],
  );

  const refreshMenu = useCallback(async (showLoading = false) => {
    if (!isSupabaseConfigured || menuRequestInFlight.current) return;

    menuRequestInFlight.current = true;
    if (showLoading) {
      setMenuLoading(true);
      setMenuError("");
    }

    try {
      const items = await fetchMenu();
      if (!customerMenuMounted.current) return;

      setDishes((current) =>
        JSON.stringify(current) === JSON.stringify(items) ? current : items,
      );
      setMenuError("");
    } catch {
      if (showLoading && customerMenuMounted.current) {
        setMenuError("تعذّر تحميل القائمة. تحقق من إعداد Supabase.");
      }
    } finally {
      menuRequestInFlight.current = false;
      if (showLoading && customerMenuMounted.current) {
        setMenuLoading(false);
      }
    }
  }, []);

  const categories = useMemo(
    () => ["الكل", ...new Set(dishes.map((item) => item.category))],
    [dishes],
  );
  const filtered = useMemo(
    () =>
      category === "الكل"
        ? dishes
        : dishes.filter((item) => item.category === category),
    [category, dishes],
  );
  const count = cart.reduce((total, row) => total + row.quantity, 0);
  const total = cart.reduce(
    (sum, row) => sum + row.price * row.quantity,
    0,
  );
  const selectedVariant =
    dish?.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const activePrice = selectedVariant?.price ?? dish?.price ?? 0;
  const startingPrice = dish
    ? Math.min(dish.price, ...dish.variants.map((variant) => variant.price))
    : 0;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDish(null);
        setFilterOpen(false);
        setMenuOpen(false);
        setCartOpen(false);
        setSessionPanelOpen(false);
        setBillOpen(false);
        setTablePromptOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    customerMenuMounted.current = true;
    return () => {
      customerMenuMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setDishes([]);
      setMenuLoading(false);
      return;
    }

    void refreshMenu(true);
  }, [refreshMenu]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const refreshMenuSilently = () => {
      if (document.visibilityState === "visible") {
        void refreshMenu();
      }
    };
    const interval = window.setInterval(refreshMenuSilently, 60_000);
    window.addEventListener("focus", refreshMenuSilently);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshMenuSilently);
    };
  }, [refreshMenu]);

  useEffect(() => {
    const table = tableNumber.trim();
    const sessionId = table ? readStoredSessionId(table) : null;
    if (!table || !sessionId || !isSupabaseConfigured) {
      setActiveSession(null);
      setSessionLoading(false);
      setWaiterCallPending(false);
      return;
    }

    let active = true;
    const refreshSession = async (showLoading: boolean) => {
      if (showLoading) setSessionLoading(true);
      try {
        await refreshCustomerSession(table, sessionId, () => active);
      } catch {
        if (active && showLoading) {
          setSessionError("تعذّر تحميل طلبات جلستك. حاول مرة أخرى.");
        }
      } finally {
        if (active && showLoading) setSessionLoading(false);
      }
    };

    void refreshSession(true);
    const interval = window.setInterval(() => void refreshSession(false), 10_000);
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void refreshSession(false);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCustomerSession, tableNumber]);

  const openDish = (item: Dish) => {
    setDish(item);
    setOptionsOpen(false);
    setSelectedVariantId("");
    setExcludedIngredientIds([]);
    setQuantity(1);
    setSugar("قليل");
    setItemLimitReached(false);
  };

  const addToCart = () => {
    if (!dish) return;
    if (dish.variants.length > 0 && !selectedVariant) return;
    if (cart.length >= 20) {
      setItemLimitReached(true);
      return;
    }
    setCart((previous) => [
      ...previous,
      {
        id: `${dish.id}-${crypto.randomUUID()}`,
        dish,
        variant: selectedVariant,
        excludedIngredients: dish.ingredients.filter((ingredient) =>
          excludedIngredientIds.includes(ingredient.id),
        ),
        price: activePrice,
        quantity,
        sugar: dish.drink ? sugar : "—",
      },
    ]);
    setDish(null);
    setOptionsOpen(false);
    setOrderError("");
  };

  const changeQuantity = (id: string, delta: number) => {
    setCart((previous) =>
      previous
        .map((row) =>
          row.id === id
            ? { ...row, quantity: Math.min(99, row.quantity + delta) }
            : row,
        )
        .filter((row) => row.quantity > 0),
    );
  };

  const submitOrder = async () => {
    const submittedTableNumber = tableNumber.trim();
    if (!submittedTableNumber) {
      setTableError("أدخل رقم الطاولة لإرسال الطلب.");
      return;
    }
    if (cart.length === 0 || placingOrder) return;

    setTableError("");
    setOrderError("");
    setPlacingOrder(true);
    try {
      const receipt = await placeOrder(
        submittedTableNumber,
        cart.map((row) => ({
          id: row.dish.id,
          quantity: row.quantity,
          sugar: row.dish.drink ? row.sugar : null,
          variantId: row.variant?.id ?? null,
          excludedIngredientIds: row.excludedIngredients.map(
            (ingredient) => ingredient.id,
          ),
        })),
      );
      rememberTableSession(submittedTableNumber, receipt.sessionId);
      setTableNumber(submittedTableNumber);
      setPlacedOrder(receipt);
      setConfirmed(true);
      void refreshCustomerSession(submittedTableNumber, receipt.sessionId).catch(
        () => setSessionError("تم إرسال الطلب، لكن تعذّر تحديث عرض جلستك."),
      );
    } catch {
      setOrderError(
        "تعذّر إرسال الطلب. تحقق من الاتصال وإعداد القائمة ثم حاول مرة أخرى.",
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  const finishOrder = () => {
    setConfirmed(false);
    setCartOpen(false);
    setCart([]);
    setPlacedOrder(null);
    setOrderError("");
  };

  const sendWaiterCall = async (table: string) => {
    if (waiterCallSubmitting) return;
    setWaiterCallSubmitting(true);
    setServiceError("");
    rememberLastTableNumber(table);
    try {
      const sessionId =
        activeSession?.tableNumber === table ? activeSession.id : null;
      await requestWaiter(table, sessionId);
      setWaiterCallPending(true);
      setTableNumber(table);
    } catch {
      setServiceError("تعذّر إرسال طلب حضور العامل. حاول مرة أخرى.");
    } finally {
      setWaiterCallSubmitting(false);
    }
  };

  const openWaiterCall = () => {
    setServiceError("");
    const table = tableNumber.trim();
    if (!table) {
      setTablePromptValue("");
      setTablePromptError("");
      setTablePromptOpen(true);
      return;
    }
    void sendWaiterCall(table);
  };

  const confirmTableForWaiter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const table = tablePromptValue.trim().slice(0, 30);
    if (!table) {
      setTablePromptError("أدخل رقم الطاولة لإرسال الطلب.");
      return;
    }
    setTablePromptOpen(false);
    setTableNumber(table);
    void sendWaiterCall(table);
  };

  const submitBillRequest = async (tipAmount: number) => {
    if (!activeSession || billSubmitting) return;
    setBillSubmitting(true);
    setBillError("");
    try {
      const result = await requestBill(activeSession.id, tipAmount);
      setActiveSession((current) =>
        current?.id === activeSession.id
          ? {
              ...current,
              tipAmount,
              total: result.billAmount,
              billRequested: true,
            }
          : current,
      );
      void refreshCustomerSession(
        activeSession.tableNumber,
        activeSession.id,
      ).catch(() => undefined);
    } catch {
      setBillError("تعذّر إرسال طلب الحساب. تحقق من الاتصال وحاول مجدداً.");
    } finally {
      setBillSubmitting(false);
    }
  };

  const cancelOrderFromSession = async (orderId: string) => {
    if (!activeSession || sessionBusyId) return;
    setSessionBusyId(orderId);
    setSessionError("");
    try {
      await cancelSessionOrder(activeSession.id, orderId);
      await refreshCustomerSession(activeSession.tableNumber, activeSession.id);
    } catch {
      setSessionError(
        "تعذّر إلغاء الطلب. ربما بدأ العامل بتقديم أحد أصنافه.",
      );
    } finally {
      setSessionBusyId(null);
    }
  };

  const cancelItemFromSession = async (itemId: string) => {
    if (!activeSession || sessionBusyId) return;
    setSessionBusyId(itemId);
    setSessionError("");
    try {
      await cancelSessionOrderItem(activeSession.id, itemId);
      await refreshCustomerSession(activeSession.tableNumber, activeSession.id);
    } catch {
      setSessionError("تعذّر إلغاء الصنف. قد يكون قد قُدّم بالفعل.");
    } finally {
      setSessionBusyId(null);
    }
  };

  return (
    <main className="menu-shell menu-grain min-h-[100dvh]" dir="rtl">
      <header className="menu-header" dir="ltr">
        <button
          className="menu-word"
          aria-label="القائمة"
          data-testid="button-menu-label"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          menu
        </button>
        <div className="brand-mark" data-testid="brand-logo">
          <img src="/brand/logo.png" alt="بن خلدون" />
        </div>
        <button
          className="hamburger"
          aria-label="فتح القائمة"
          aria-expanded={menuOpen}
          data-testid="button-open-menu"
          onClick={() => setMenuOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {tableNumber && (
        <div
          className="table-pill appear"
          dir="rtl"
          data-testid="text-table-number"
        >
          أنت على طاولة <b>{tableNumber}</b>
        </div>
      )}

      <ServiceActions
        hasSession={Boolean(activeSession)}
        waiterPending={waiterCallPending || waiterCallSubmitting}
        billPending={Boolean(activeSession?.billRequested)}
        onWaiterCall={openWaiterCall}
        onViewSession={() => setSessionPanelOpen(true)}
        onOpenBill={() => {
          setBillError("");
          setBillOpen(true);
        }}
      />
      {serviceError && (
        <p className="guest-service-error" role="alert" data-testid="status-service-error">
          {serviceError}
        </p>
      )}

      <section className="menu-content">
        <div className="menu-toolbar">
          <div className="section-title">
            <span className="small-rule" />
            <h2>{category === "الكل" ? "القائمة" : category}</h2>
          </div>
          <button
            className={`filter-button ${filterOpen ? "is-active" : ""}`}
            onClick={() => setFilterOpen((open) => !open)}
            aria-label="تصفية الأصناف"
            aria-expanded={filterOpen}
            disabled={dishes.length === 0}
            data-testid="button-category-filter"
          >
            <SlidersHorizontal size={18} strokeWidth={1.7} />
          </button>
        </div>

        {filterOpen && (
          <div
            className="filter-popover appear"
            role="group"
            aria-label="تصنيفات القائمة"
            data-testid="panel-category-filters"
          >
            <div className="popover-heading">
              <span>اختر التصنيف</span>
              <button
                onClick={() => setFilterOpen(false)}
                aria-label="إغلاق التصنيفات"
                data-testid="button-close-filters"
              >
                <X size={16} />
              </button>
            </div>
            <div className="category-options">
              {categories.map((item, index) => (
                <button
                  key={item}
                  className={category === item ? "selected" : ""}
                  onClick={() => {
                    setCategory(item);
                    setFilterOpen(false);
                  }}
                  data-testid={`filter-category-${index}`}
                >
                  {item}
                  {category === item && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isSupabaseConfigured ? (
          <div
            className="menu-state appear"
            role="status"
            data-testid="status-supabase-not-configured"
          >
            <h3>القائمة غير جاهزة بعد</h3>
            <p>
              أضف إعدادات Supabase وشغّل ملف الإعداد لعرض الأصناف واستقبال
              الطلبات.
            </p>
          </div>
        ) : menuLoading ? (
          <div
            className="menu-state appear"
            role="status"
            data-testid="status-menu-loading"
          >
            <LoaderCircle className="menu-spinner" size={23} />
            <p>جارٍ تحميل القائمة…</p>
          </div>
        ) : menuError ? (
          <div
            className="menu-state is-error appear"
            role="alert"
            data-testid="status-menu-error"
          >
            <h3>تعذّر فتح القائمة</h3>
            <p>{menuError}</p>
            <button
              className="menu-retry"
              onClick={() => void refreshMenu(true)}
              data-testid="button-retry-menu"
            >
              حاول مرة أخرى
            </button>
          </div>
        ) : dishes.length === 0 ? (
          <div className="empty-menu" data-testid="status-menu-empty">
            لم تُضف أصناف إلى القائمة بعد.
          </div>
        ) : (
          <>
            <div className="dish-grid" data-testid="grid-menu-dishes">
              {filtered.map((item, index) => (
                <button
                  className="dish-card appear"
                  style={{ animationDelay: `${index * 55}ms` }}
                  key={item.id}
                  onClick={() => openDish(item)}
                  data-testid={`card-dish-${item.id}`}
                >
                  <span className="dish-photo">
                    <img
                      src={item.image}
                      alt={item.name}
                      loading={index > 3 ? "lazy" : "eager"}
                    />
                    <span className="photo-corner" aria-hidden="true" />
                  </span>
                  <span className="dish-name">{item.name}</span>
                </button>
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="empty-menu">لا توجد أصناف في هذا التصنيف</div>
            )}
          </>
        )}

        <footer className="menu-footer">
          <span className="footer-ornament" aria-hidden="true" />
          <p>على مهل، وبكل محبة</p>
          <span>بن خلدون</span>
        </footer>
      </section>

      <button
        className="order-float"
        onClick={() => setCartOpen(true)}
        disabled={!isSupabaseConfigured || menuLoading || dishes.length === 0}
        data-testid="button-open-order"
        aria-label={`عرض الطلب، ${count} أصناف`}
      >
        <span className="order-count">{count}</span>
        <span>طلبك</span>
        <b>{count ? money(total) : "ابدأ طلبك"}</b>
        <ArrowLeft size={17} />
      </button>

      {dish && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDish(null);
          }}
          role="presentation"
        >
          <section
            className="dish-modal sheet-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dish-modal-title"
            dir="rtl"
            data-testid="dialog-dish-details"
          >
            <button
              className="close-button"
              onClick={() => setDish(null)}
              aria-label="إغلاق التفاصيل"
              data-testid="button-close-dish"
            >
              <X size={18} />
            </button>
            <img
              className="modal-image"
              src={selectedVariant?.image || dish.image}
              alt={dish.name}
            />
            <div className="modal-body">
              <span className="modal-category">{dish.category}</span>
              <h2 id="dish-modal-title">{dish.name}</h2>
              {dish.ingredients.length > 0 && (
                <p className="ingredients">
                  {dish.ingredients.map((ingredient) => ingredient.name).join("، ")}
                </p>
              )}
              <div className="modal-price">
                {dish.variants.length > 0 && !selectedVariant
                  ? `يبدأ من ${money(startingPrice)}`
                  : money(activePrice)}
              </div>
              {!optionsOpen ? (
                <button
                  className="primary-action"
                  onClick={() => setOptionsOpen(true)}
                  data-testid="button-expand-add-options"
                >
                  أضف إلى الطلب <ArrowLeft size={18} />
                </button>
              ) : (
                <div className="options-area appear" data-testid="panel-item-options">
                  {dish.variants.length > 0 && (
                    <fieldset className="variant-options">
                      <legend>اختر النوع</legend>
                      <div className="variant-options-list">
                        {dish.variants.map((variant) => (
                          <button
                            type="button"
                            key={variant.id}
                            className={`variant-choice ${
                              selectedVariantId === variant.id ? "chosen" : ""
                            }`}
                            aria-pressed={selectedVariantId === variant.id}
                            onClick={() => setSelectedVariantId(variant.id)}
                            data-testid={`button-variant-${variant.id}`}
                          >
                            <span>{variant.name}</span>
                            <b>{money(variant.price)}</b>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {dish.ingredients.some((ingredient) => ingredient.isExcludable) && (
                    <fieldset className="ingredient-options">
                      <legend>مكونات يمكن استبعادها</legend>
                      <div className="ingredient-options-list">
                        {dish.ingredients
                          .filter((ingredient) => ingredient.isExcludable)
                          .map((ingredient) => (
                            <label
                              className="ingredient-option"
                              key={ingredient.id}
                            >
                              <input
                                type="checkbox"
                                checked={excludedIngredientIds.includes(
                                  ingredient.id,
                                )}
                                onChange={() =>
                                  setExcludedIngredientIds((previous) =>
                                    previous.includes(ingredient.id)
                                      ? previous.filter(
                                          (id) => id !== ingredient.id,
                                        )
                                      : [...previous, ingredient.id],
                                  )
                                }
                                data-testid={`checkbox-exclude-${ingredient.id}`}
                              />
                              <span>{ingredient.name}</span>
                            </label>
                          ))}
                      </div>
                    </fieldset>
                  )}
                  {dish.variants.length > 0 && !selectedVariant && (
                    <p className="field-error" role="status">
                      اختر النوع قبل إضافة الصنف.
                    </p>
                  )}
                  {dish.drink && (
                    <div className="sugar-row">
                      <span>كمية السكر</span>
                      <div className="sugar-options">
                        {["بدون", "قليل", "عادي"].map((value) => (
                          <button
                            key={value}
                            className={sugar === value ? "chosen" : ""}
                            onClick={() => setSugar(value)}
                            data-testid={`button-sugar-${value}`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="quantity-row">
                    <span>الكمية</span>
                    <div className="stepper">
                      <button
                        aria-label="تقليل الكمية"
                        onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                        data-testid="button-detail-quantity-minus"
                      >
                        <Minus size={15} />
                      </button>
                      <b data-testid="text-detail-quantity">{quantity}</b>
                      <button
                        aria-label="زيادة الكمية"
                        onClick={() =>
                          setQuantity((value) => Math.min(99, value + 1))
                        }
                        data-testid="button-detail-quantity-plus"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                  {itemLimitReached && (
                    <p className="order-error" role="alert" data-testid="status-order-item-limit">
                      وصل طلبك إلى الحد الأعلى البالغ 20 صنفاً.
                    </p>
                  )}
                  <button
                    className="primary-action"
                    onClick={addToCart}
                    disabled={
                      itemLimitReached ||
                      (dish.variants.length > 0 && !selectedVariant)
                    }
                    data-testid="button-add-to-order"
                  >
                    أضف {money(activePrice * quantity)} <ArrowLeft size={18} />
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {cartOpen && (
        <div
          className="overlay drawer-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCartOpen(false);
          }}
          role="presentation"
        >
          <aside
            className="order-drawer sheet-in"
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-heading"
            data-testid="dialog-order"
          >
            <div className="drawer-head">
              <div>
                <span className="modal-category">قائمتك الصغيرة</span>
                <h2 id="cart-heading">طلبك</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setCartOpen(false)}
                aria-label="إغلاق الطلب"
                data-testid="button-close-order"
              >
                <X size={18} />
              </button>
            </div>
            {confirmed && placedOrder ? (
              <div
                className="confirmation appear"
                data-testid="status-order-confirmed"
              >
                <span className="confirmation-mark">
                  <Check size={27} />
                </span>
                <h3>تم استلام طلبك</h3>
                <p>أُرسل طلبك إلى المقهى بنجاح.</p>
                <p className="order-reference">
                  رقم الطلب: {placedOrder.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="confirmed-total">
                  الإجمالي: {money(placedOrder.total)}
                </p>
                <button
                  className="primary-action"
                  onClick={finishOrder}
                  data-testid="button-finish-confirmation"
                >
                  العودة إلى القائمة <ArrowLeft size={18} />
                </button>
              </div>
            ) : cart.length === 0 ? (
              <div className="cart-empty">
                <span className="empty-mark">
                  <ArrowDown size={20} />
                </span>
                <h3>ما زال طلبك فارغاً</h3>
                <p>أضف ما يحلو لك من قائمتنا.</p>
                <button
                  onClick={() => setCartOpen(false)}
                  data-testid="button-browse-menu"
                >
                  تصفّح الأصناف
                </button>
              </div>
            ) : (
              <>
                <div className="cart-list">
                  {cart.map((row) => (
                    <div
                      className="cart-row"
                      key={row.id}
                      data-testid={`row-order-item-${row.dish.id}`}
                    >
                      <img
                        src={row.variant?.image || row.dish.image}
                        alt=""
                      />
                      <div className="cart-row-info">
                        <strong>{row.dish.name}</strong>
                        <span>
                          {[
                            row.variant?.name,
                            row.dish.drink ? `سكر ${row.sugar}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || row.dish.category}
                        </span>
                        {row.excludedIngredients.length > 0 && (
                          <small>
                            بدون:{" "}
                            {row.excludedIngredients
                              .map((ingredient) => ingredient.name)
                              .join("، ")}
                          </small>
                        )}
                        <b>{money(row.price * row.quantity)}</b>
                      </div>
                      <div className="cart-controls">
                        <button
                          aria-label="تقليل العدد"
                          onClick={() => changeQuantity(row.id, -1)}
                          data-testid={`button-remove-one-${row.dish.id}`}
                        >
                          <Minus size={13} />
                        </button>
                        <span>{row.quantity}</span>
                        <button
                          aria-label="زيادة العدد"
                          onClick={() => changeQuantity(row.id, 1)}
                          data-testid={`button-add-one-${row.dish.id}`}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <button
                        className="remove-item"
                        aria-label={`حذف ${row.dish.name}`}
                        onClick={() =>
                          setCart((previous) =>
                            previous.filter((item) => item.id !== row.id),
                          )
                        }
                        data-testid={`button-delete-${row.dish.id}`}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="cart-bottom">
                  <label className="table-field">
                    <span>رقم الطاولة</span>
                    <input
                      value={tableNumber}
                      onChange={(event) => {
                        setTableNumber(event.target.value.slice(0, 30));
                        setTableError("");
                      }}
                      readOnly={Boolean(queryTable)}
                      maxLength={30}
                      autoComplete="off"
                      placeholder="أدخل رقم الطاولة"
                      aria-invalid={Boolean(tableError)}
                      aria-describedby={tableError ? "table-error" : undefined}
                      data-testid="input-table-number"
                    />
                  </label>
                  {tableError && (
                    <p className="field-error" id="table-error" role="alert">
                      {tableError}
                    </p>
                  )}
                  {orderError && (
                    <p className="order-error" role="alert" data-testid="status-order-error">
                      {orderError}
                    </p>
                  )}
                  <div className="total-line">
                    <span>المجموع</span>
                    <b data-testid="text-order-total">{money(total)}</b>
                  </div>
                  <button
                    className="primary-action"
                    onClick={submitOrder}
                    disabled={placingOrder}
                    data-testid="button-confirm-order"
                  >
                    {placingOrder ? (
                      <>
                        جاري إرسال الطلب <LoaderCircle className="menu-spinner" size={18} />
                      </>
                    ) : (
                      <>
                        تأكيد الطلب <ArrowLeft size={18} />
                      </>
                    )}
                  </button>
                  <p>سيُرسل طلبك مباشرة إلى المقهى.</p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <ActiveSessionPanel
        isOpen={sessionPanelOpen}
        session={activeSession}
        loading={sessionLoading}
        error={sessionError}
        busyId={sessionBusyId}
        onClose={() => setSessionPanelOpen(false)}
        onCancelOrder={cancelOrderFromSession}
        onCancelItem={cancelItemFromSession}
      />

      <BillModal
        isOpen={billOpen}
        session={activeSession}
        isSubmitting={billSubmitting}
        error={billError}
        billRequested={Boolean(activeSession?.billRequested)}
        onClose={() => setBillOpen(false)}
        onRequestBill={submitBillRequest}
      />

      {tablePromptOpen && (
        <div
          className="guest-table-prompt-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTablePromptOpen(false);
          }}
        >
          <section
            className="guest-table-prompt"
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-table-prompt-title"
            data-testid="dialog-table-number-prompt"
          >
            <button
              type="button"
              className="close-button"
              onClick={() => setTablePromptOpen(false)}
              aria-label="إغلاق"
              data-testid="button-close-table-prompt"
            >
              <X size={18} />
            </button>
            <span className="modal-category">خدمة الطاولة</span>
            <h2 id="guest-table-prompt-title">على أي طاولة تجلس؟</h2>
            <p>أدخل رقم الطاولة حتى يصل طلب حضور العامل إلى المكان الصحيح.</p>
            <form onSubmit={confirmTableForWaiter}>
              <label className="table-field">
                <span>رقم الطاولة</span>
                <input
                  autoFocus
                  autoComplete="off"
                  dir="ltr"
                  maxLength={30}
                  value={tablePromptValue}
                  onChange={(event) => {
                    setTablePromptValue(event.target.value.slice(0, 30));
                    setTablePromptError("");
                  }}
                  aria-invalid={Boolean(tablePromptError)}
                  data-testid="input-table-prompt"
                />
              </label>
              {tablePromptError && (
                <p className="field-error" role="alert">
                  {tablePromptError}
                </p>
              )}
              <button
                type="submit"
                className="primary-action"
                disabled={waiterCallSubmitting}
                data-testid="button-confirm-table-prompt"
              >
                {waiterCallSubmitting ? "جارٍ إرسال الطلب…" : "نادِ العامل"}
                <ArrowLeft size={17} />
              </button>
            </form>
          </section>
        </div>
      )}

      {menuOpen && (
        <div
          className="overlay drawer-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMenuOpen(false);
          }}
          role="presentation"
        >
          <aside
            className="order-drawer menu-drawer sheet-in"
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-label="قائمة التنقل"
            data-testid="dialog-navigation"
          >
            <div className="drawer-head">
              <div>
                <span className="modal-category">بن خلدون</span>
                <h2>القائمة</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setMenuOpen(false)}
                aria-label="إغلاق القائمة"
                data-testid="button-close-navigation"
              >
                <X size={18} />
              </button>
            </div>
            <button
              className="nav-choice"
              onClick={() => {
                setMenuOpen(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              data-testid="button-navigation-menu"
            >
              <span>تصفّح الأصناف</span>
              <ArrowLeft size={17} />
            </button>
            <button
              className="nav-choice"
              onClick={() => {
                setMenuOpen(false);
                setCartOpen(true);
              }}
              data-testid="button-navigation-order"
            >
              <span>عرض طلبك</span>
              <span className="nav-count">{count}</span>
            </button>
            <p className="demo-caption">قائمة مقهى بن خلدون</p>
          </aside>
        </div>
      )}
    </main>
  );
}

function App() {
  return (
    <Switch>
      <Route path="/admin" component={AdminPanel} />
      <Route path="/" component={CustomerMenu} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default App;
