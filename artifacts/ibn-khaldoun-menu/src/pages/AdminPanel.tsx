import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  AlertCircle,
  ArrowDown,
  Check,
  ClipboardList,
  Coffee,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import AdminOrders from "./AdminOrders";
import {
  deleteMenuItem,
  getCurrentAdmin,
  loadAdminMenu,
  saveMenuItem,
  signInAdmin,
  signOutAdmin,
  uploadMenuImage,
  type AdminMenuItem,
  type MenuItemDraft,
} from "@/lib/admin";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Form } from "@/components/ui/form";
import "./admin.css";

type LoginValues = { email: string; password: string };
type ItemValues = {
  name: string;
  category: string;
  price: string;
  imageUrl: string;
  isDrink: boolean;
  isAvailable: boolean;
  sortOrder: string;
};
type IngredientDraft = { name: string; isExcludable: boolean };
type VariantDraft = {
  name: string;
  priceOverride: string;
  imageUrl: string;
  isAvailable: boolean;
};

const money = (price: number) => `${price.toLocaleString("ar-SY")} ل.س`;
const isOrderable = (item: AdminMenuItem) =>
  item.isAvailable &&
  (item.variants.length === 0 || item.variants.some((variant) => variant.isAvailable));
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function AdminPanel() {
  const loginForm = useForm<LoginValues>({
    defaultValues: { email: "", password: "" },
  });
  const itemForm = useForm<ItemValues>({
    defaultValues: {
      name: "",
      category: "",
      price: "",
      imageUrl: "",
      isDrink: false,
      isAvailable: true,
      sortOrder: "0",
    },
  });
  const [admin, setAdmin] = useState<{ id: string; email: string } | null>(null);
  const [activeAdminSection, setActiveAdminSection] = useState<"menu" | "orders">(
    "menu",
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [items, setItems] = useState<AdminMenuItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [editing, setEditing] = useState<AdminMenuItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingBase, setUploadingBase] = useState(false);
  const [uploadingVariant, setUploadingVariant] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminMenuItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void getCurrentAdmin()
      .then((current) => {
        if (active) setAdmin(current);
      })
      .catch((error: unknown) => {
        if (active) setAuthError(errorMessage(error, "تعذّر التحقق من صلاحية الدخول."));
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshItems = async () => {
    setListLoading(true);
    setListError("");
    try {
      setItems(await loadAdminMenu());
    } catch (error) {
      setListError(errorMessage(error, "تعذّر تحميل الأصناف. حاول مرة أخرى."));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (!admin) return;

    void refreshItems();
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") {
        void refreshItems();
      }
    };
    const interval = window.setInterval(refreshWhenActive, 60_000);
    window.addEventListener("focus", refreshWhenActive);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenActive);
    };
  }, [admin]);

  const openNewItem = () => {
    setEditing(null);
    itemForm.reset({
      name: "",
      category: "",
      price: "",
      imageUrl: "",
      isDrink: false,
      isAvailable: true,
      sortOrder: String(items.length),
    });
    setIngredients([]);
    setVariants([]);
    setFormError("");
    setFormOpen(true);
  };

  const openEditItem = (item: AdminMenuItem) => {
    setEditing(item);
    itemForm.reset({
      name: item.name,
      category: item.category,
      price: String(item.price),
      imageUrl: item.imageUrl ?? "",
      isDrink: item.isDrink,
      isAvailable: item.isAvailable,
      sortOrder: String(item.sortOrder),
    });
    setIngredients(
      item.ingredients.map((ingredient) => ({
        name: ingredient.name,
        isExcludable: ingredient.isExcludable,
      })),
    );
    setVariants(
      item.variants.map((variant) => ({
        name: variant.name,
        priceOverride:
          variant.priceOverride === null ? "" : String(variant.priceOverride),
        imageUrl: variant.imageUrl ?? "",
        isAvailable: variant.isAvailable,
      })),
    );
    setFormError("");
    setFormOpen(true);
  };

  const handleSignIn = loginForm.handleSubmit(async (values) => {
    setAuthError("");
    try {
      const signedIn = await signInAdmin(values.email, values.password);
      setAdmin(signedIn);
    } catch (error) {
      setAuthError(
        error instanceof Error && error.message === "ADMIN_NOT_AUTHORIZED"
          ? "هذا الحساب غير مخوّل لإدارة القائمة."
          : "تعذّر تسجيل الدخول. تحقّق من البريد الإلكتروني وكلمة المرور.",
      );
    }
  });

  const handleSignOut = async () => {
    setAuthError("");
    try {
      await signOutAdmin();
      setAdmin(null);
      setItems([]);
      loginForm.reset();
    } catch (error) {
      setAuthError(errorMessage(error, "تعذّر تسجيل الخروج."));
    }
  };

  const uploadBaseImage = async (file?: File) => {
    if (!file) return;
    setUploadingBase(true);
    setFormError("");
    try {
      itemForm.setValue("imageUrl", await uploadMenuImage(file), {
        shouldDirty: true,
      });
    } catch (error) {
      setFormError(errorMessage(error, "تعذّر رفع الصورة."));
    } finally {
      setUploadingBase(false);
    }
  };

  const uploadVariantImage = async (index: number, file?: File) => {
    if (!file) return;
    setUploadingVariant(index);
    setFormError("");
    try {
      const imageUrl = await uploadMenuImage(file);
      setVariants((current) =>
        current.map((variant, position) =>
          position === index ? { ...variant, imageUrl } : variant,
        ),
      );
    } catch (error) {
      setFormError(errorMessage(error, "تعذّر رفع صورة الخيار."));
    } finally {
      setUploadingVariant(null);
    }
  };

  const handleSave = itemForm.handleSubmit(async (values) => {
    const price = Number(values.price);
    const sortOrder = Number(values.sortOrder);
    if (!values.name.trim() || !values.category.trim()) {
      setFormError("أدخل اسم الصنف والتصنيف.");
      return;
    }
    if (
      !values.price.trim() ||
      !Number.isInteger(price) ||
      price < 0 ||
      price > 999999999999 ||
      !Number.isInteger(sortOrder) ||
      sortOrder < 0
    ) {
      setFormError("أدخل سعراً وترتيباً صحيحين.");
      return;
    }
    if (!values.imageUrl.trim()) {
      setFormError("أضف رابط صورة أو ارفع صورة للصنف.");
      return;
    }
    if (ingredients.some((ingredient) => !ingredient.name.trim())) {
      setFormError("أكمل أسماء المكوّنات أو احذف الصفوف الفارغة.");
      return;
    }
    if (variants.some((variant) => !variant.name.trim())) {
      setFormError("أكمل أسماء الخيارات أو احذف الصفوف الفارغة.");
      return;
    }
    if (
      values.isAvailable &&
      variants.length > 0 &&
      !variants.some((variant) => variant.isAvailable)
    ) {
      setFormError("فعّل خياراً واحداً على الأقل أو اجعل الصنف غير متاح.");
      return;
    }
    if (
      variants.some(
        (variant) =>
          variant.priceOverride.trim() !== "" &&
          (!Number.isInteger(Number(variant.priceOverride)) ||
            Number(variant.priceOverride) < 0 ||
            Number(variant.priceOverride) > 999999999999),
      )
    ) {
      setFormError("تأكّد من صحة أسعار الخيارات.");
      return;
    }
    const ingredientNames = ingredients.map((ingredient) =>
      ingredient.name.trim().toLocaleLowerCase(),
    );
    const variantNames = variants.map((variant) =>
      variant.name.trim().toLocaleLowerCase(),
    );
    if (new Set(ingredientNames).size !== ingredientNames.length) {
      setFormError("احذف المكوّنات المكررة.");
      return;
    }
    if (new Set(variantNames).size !== variantNames.length) {
      setFormError("احذف الخيارات المكررة.");
      return;
    }

    setSaving(true);
    setFormError("");
    const draft: MenuItemDraft = {
      id: editing?.id ?? crypto.randomUUID(),
      name: values.name.trim(),
      category: values.category.trim(),
      price,
      image_url: values.imageUrl.trim(),
      is_drink: values.isDrink,
      is_available: values.isAvailable,
      sort_order: sortOrder,
      ingredients: ingredients.map((ingredient, index) => ({
        name: ingredient.name.trim(),
        is_excludable: ingredient.isExcludable,
        sort_order: index,
      })),
      variants: variants.map((variant, index) => ({
        name: variant.name.trim(),
        price_override:
          variant.priceOverride.trim() === ""
            ? null
            : Number(variant.priceOverride),
        image_url: variant.imageUrl.trim() || null,
        is_available: variant.isAvailable,
        sort_order: index,
      })),
    };
    try {
      await saveMenuItem(draft);
      await refreshItems();
      setFormOpen(false);
      setNotice(editing ? "تم تحديث الصنف." : "تمت إضافة الصنف.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (error) {
      setFormError(errorMessage(error, "تعذّر حفظ الصنف. حاول مرة أخرى."));
    } finally {
      setSaving(false);
    }
  });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setListError("");
    try {
      await deleteMenuItem(deleteTarget.id);
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setNotice("تم حذف الصنف.");
      setDeleteTarget(null);
      window.setTimeout(() => setNotice(""), 3200);
    } catch (error) {
      setListError(errorMessage(error, "تعذّر حذف الصنف. حاول مرة أخرى."));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="admin-shell" dir="rtl">
        <div className="admin-auth-wrap admin-setup-wrap">
          <header className="admin-brand">
            <span className="admin-brand-mark"><img src="/brand/logo.png" alt="" /></span>
            <span>بن خلدون <small>إدارة القائمة</small></span>
          </header>
          <section className="admin-auth-card" role="alert" data-testid="status-supabase-not-configured">
            <div className="admin-auth-icon"><ShieldCheck size={22} /></div>
            <span className="admin-eyebrow">لوحة إدارة القائمة</span>
            <h1>إعداد Supabase مطلوب</h1>
            <p className="admin-intro">
              أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY إلى متغيرات البيئة، ثم أعد تشغيل التطبيق.
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="admin-shell" dir="rtl">
        <section className="admin-auth-card admin-skeleton" role="status" data-testid="status-auth-loading">
          <span className="admin-skeleton-line" />
          <span className="admin-skeleton-line short" />
          <span className="admin-skeleton-block" />
        </section>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="admin-shell" dir="rtl">
        <div className="admin-auth-wrap">
          <header className="admin-brand">
            <span className="admin-brand-mark"><img src="/brand/logo.png" alt="" /></span>
            <span>بن خلدون <small>إدارة القائمة</small></span>
          </header>
          <section className="admin-auth-card">
            <div className="admin-auth-icon"><ShieldCheck size={22} /></div>
            <span className="admin-eyebrow">مساحة فريق المقهى</span>
            <h1>أهلاً بعودتك</h1>
            <p className="admin-intro">سجّل الدخول لتحديث الأصناف ومكوّناتها.</p>
            {authError && <div className="admin-alert" role="alert" data-testid="status-auth-error"><AlertCircle size={17} />{authError}</div>}
            <Form {...loginForm}>
              <form className="admin-form" onSubmit={handleSignIn} noValidate>
              <label className="admin-field">
                <span>البريد الإلكتروني</span>
                <input
                  type="email"
                  dir="ltr"
                  autoComplete="username"
                  placeholder="name@example.com"
                  data-testid="input-admin-email"
                  {...loginForm.register("email", { required: "أدخل البريد الإلكتروني." })}
                />
                {loginForm.formState.errors.email && <small className="admin-field-error">{loginForm.formState.errors.email.message}</small>}
              </label>
              <label className="admin-field">
                <span>كلمة المرور</span>
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  data-testid="input-admin-password"
                  {...loginForm.register("password", { required: "أدخل كلمة المرور." })}
                />
                {loginForm.formState.errors.password && <small className="admin-field-error">{loginForm.formState.errors.password.message}</small>}
              </label>
              <button className="admin-primary-button full" type="submit" disabled={loginForm.formState.isSubmitting} data-testid="button-admin-sign-in">
                {loginForm.formState.isSubmitting ? <><LoaderCircle className="admin-spin" size={18} /> جارٍ التحقق…</> : <>تسجيل الدخول <ArrowDown size={17} /></>}
              </button>
              </form>
            </Form>
            <p className="admin-auth-foot">الدخول متاح لحسابات فريق الإدارة فقط.</p>
          </section>
          <footer className="admin-auth-footer">بن خلدون <span>—</span> قائمة الحيّ، على مهل</footer>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-shell admin-workspace" dir="rtl">
      <div className="admin-topbar">
        <div className="admin-brand">
          <span className="admin-brand-mark"><img src="/brand/logo.png" alt="" /></span>
          <span>بن خلدون <small>إدارة المقهى</small></span>
        </div>
        <div className="admin-session">
          <span className="admin-session-email" dir="ltr" data-testid="text-admin-email">{admin.email}</span>
          <button className="admin-quiet-button" onClick={handleSignOut} data-testid="button-admin-sign-out"><LogOut size={16} /><span>خروج</span></button>
        </div>
      </div>

      <nav className="admin-section-nav" role="tablist" aria-label="أقسام لوحة الإدارة">
        <button
          type="button"
          role="tab"
          aria-selected={activeAdminSection === "menu"}
          className={activeAdminSection === "menu" ? "is-active" : ""}
          onClick={() => setActiveAdminSection("menu")}
          data-testid="tab-admin-menu"
        >
          <Coffee size={16} /> أصناف القائمة
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeAdminSection === "orders"}
          className={activeAdminSection === "orders" ? "is-active" : ""}
          onClick={() => setActiveAdminSection("orders")}
          data-testid="tab-admin-orders"
        >
          <ClipboardList size={16} /> الطلبات والطاولات
        </button>
      </nav>

      <section className="admin-content" hidden={activeAdminSection !== "menu"}>
        <div className="admin-page-heading">
          <div>
            <span className="admin-eyebrow">لوحة التشغيل <span className="admin-live-dot" /></span>
            <h1>أصناف القائمة</h1>
            <p>عدّل ما يظهر للضيوف، وحدّد بوضوح ما يمكن استبعاده.</p>
          </div>
          <button className="admin-primary-button" onClick={openNewItem} data-testid="button-add-menu-item"><Plus size={18} /> إضافة صنف</button>
        </div>

        <div className="admin-summary" data-testid="panel-menu-summary">
          <div><span className="summary-label">إجمالي الأصناف</span><strong data-testid="text-item-count">{items.length.toLocaleString("ar-SY")}</strong></div>
          <span className="summary-divider" />
           <div><span className="summary-label">متاح للطلب</span><strong data-testid="text-available-count">{items.filter(isOrderable).length.toLocaleString("ar-SY")}</strong></div>
          <span className="summary-note">التغييرات تُحدّث قائمة الضيوف بعد الحفظ</span>
        </div>

        {notice && <div className="admin-toast" role="status" data-testid="status-admin-success"><Check size={16} />{notice}</div>}
        {listError && <div className="admin-alert list-alert" role="alert" data-testid="status-menu-error"><AlertCircle size={17} /><span>{listError}</span><button onClick={() => void refreshItems()} data-testid="button-retry-menu">إعادة المحاولة</button></div>}

        {listLoading ? (
          <div className="admin-item-list" aria-label="جارٍ تحميل الأصناف" data-testid="status-menu-loading">
            {[1, 2, 3].map((row) => <div className="admin-list-skeleton" key={row}><span /><div><i /><i /></div><b /></div>)}
          </div>
        ) : items.length === 0 ? (
          <section className="admin-empty" data-testid="status-menu-empty">
            <div className="admin-empty-mark"><Coffee size={25} /></div>
            <h2>القائمة تبدأ من هنا</h2>
            <p>أضف أول صنف، ثم حدّد مكوّناته وما يستطيع الضيف استبعاده.</p>
            <button className="admin-secondary-button" onClick={openNewItem} data-testid="button-add-first-item"><Plus size={17} /> إضافة أول صنف</button>
          </section>
        ) : (
          <div className="admin-item-list" data-testid="list-menu-items">
            {items.map((item, index) => (
              <article className={`admin-item-row ${!isOrderable(item) ? "is-unavailable" : ""}`} key={item.id} data-testid={`row-menu-item-${item.id}`}>
                <div className="admin-item-photo">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <Coffee size={21} />}
                </div>
                <div className="admin-item-details">
                  <div className="admin-item-title">
                    <h2 data-testid={`text-item-name-${item.id}`}>{item.name}</h2>
                    <span className={`admin-status ${isOrderable(item) ? "available" : "unavailable"}`} data-testid={`status-item-availability-${item.id}`}>{isOrderable(item) ? "متاح" : "غير متاح"}</span>
                  </div>
                  <div className="admin-item-meta">
                    <span>{item.category}</span><i />
                    <b data-testid={`text-item-price-${item.id}`}>{money(item.price)}</b><i />
                    <span>{item.isDrink ? "مشروب" : "طبق"}</span>
                    <span className="admin-ingredient-count">{item.ingredients.length.toLocaleString("ar-SY")} مكوّن</span>
                  </div>
                </div>
                <div className="admin-row-actions">
                  <button className="admin-edit-button" onClick={() => openEditItem(item)} data-testid={`button-edit-item-${item.id}`}>تعديل</button>
                  <button className="admin-icon-button danger" aria-label={`حذف ${item.name}`} onClick={() => setDeleteTarget(item)} data-testid={`button-delete-item-${item.id}`}><Trash2 size={17} /></button>
                </div>
                <span className="admin-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              </article>
            ))}
          </div>
        )}
        <footer className="admin-list-foot"><span className="admin-foot-rule" />إدارة قائمة بن خلدون</footer>
      </section>

      <AdminOrders isActive={activeAdminSection === "orders"} />

      {formOpen && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}>
          <section className="admin-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title" data-testid="dialog-menu-item-editor">
            <header className="admin-editor-head">
              <div><span className="admin-eyebrow">{editing ? "تحديث تفاصيل الصنف" : "إضافة إلى القائمة"}</span><h2 id="editor-title">{editing ? "تعديل الصنف" : "صنف جديد"}</h2></div>
              <button className="admin-icon-button" onClick={() => setFormOpen(false)} disabled={saving} aria-label="إغلاق النموذج" data-testid="button-close-editor"><X size={19} /></button>
            </header>
            <Form {...itemForm}>
            <form onSubmit={handleSave} className="admin-editor-form" noValidate>
              <div className="admin-editor-scroll">
                <section className="admin-form-section">
                  <div className="admin-section-heading"><span>01</span><div><h3>التفاصيل الأساسية</h3><p>المعلومات التي تظهر في قائمة الضيوف</p></div></div>
                  <div className="admin-fields-grid">
                    <label className="admin-field wide"><span>اسم الصنف</span><input placeholder="مثال: شاي بالنعناع" data-testid="input-item-name" {...itemForm.register("name")} /></label>
                    <label className="admin-field"><span>التصنيف</span><input placeholder="مثال: مشروبات ساخنة" data-testid="input-item-category" {...itemForm.register("category")} /></label>
                    <label className="admin-field"><span>السعر الأساسي <small>ل.س</small></span><input type="number" min="0" step="1" inputMode="numeric" placeholder="١٢٠٠٠" data-testid="input-item-price" {...itemForm.register("price")} /></label>
                    <label className="admin-field"><span>ترتيب العرض</span><input type="number" min="0" step="1" inputMode="numeric" data-testid="input-item-sort-order" {...itemForm.register("sortOrder")} /></label>
                  </div>
                  <div className="admin-image-field">
                    <label className="admin-field"><span>رابط الصورة الأساسية</span><input type="url" dir="ltr" placeholder="https://…" data-testid="input-item-image-url" {...itemForm.register("imageUrl")} /></label>
                    <label className="admin-upload-button">
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadBaseImage(event.target.files?.[0]); event.currentTarget.value = ""; }} data-testid="input-item-image-upload" />
                      {uploadingBase ? <LoaderCircle size={17} className="admin-spin" /> : <ImagePlus size={17} />}
                      <span>{uploadingBase ? "جارٍ الرفع…" : "رفع صورة"}</span>
                    </label>
                    <small>JPG أو PNG أو WebP — حتى 5 ميغابايت</small>
                  </div>
                  {itemForm.watch("imageUrl") && <div className="admin-image-preview" data-testid="preview-item-image"><img src={itemForm.watch("imageUrl")} alt="معاينة صورة الصنف" /><span>معاينة الصورة</span></div>}
                  <div className="admin-toggle-row">
                    <label className="admin-check"><input type="checkbox" {...itemForm.register("isDrink")} data-testid="checkbox-item-is-drink" /><span className="admin-checkmark"><Check size={13} /></span><span><b>مشروب</b><small>يُعرض ضمن المشروبات</small></span></label>
                    <label className="admin-check availability-check"><input type="checkbox" {...itemForm.register("isAvailable")} data-testid="checkbox-item-available" /><span className="admin-checkmark"><Check size={13} /></span><span><b>متاح للطلب</b><small>إظهار الصنف للضيوف</small></span></label>
                  </div>
                </section>

                <section className="admin-form-section">
                  <div className="admin-section-heading"><span>02</span><div><h3>المكوّنات</h3><p>حدّد بدقة ما يمكن للضيف استبعاده</p></div></div>
                  <div className="admin-ingredient-legend"><span className="legend-excludable">قابل للاستبعاد</span><span className="legend-core">أساسي — لا يمكن استبعاده</span></div>
                  {ingredients.length === 0 && <p className="admin-inline-empty" data-testid="text-no-ingredients">لا توجد مكوّنات مضافة بعد.</p>}
                  <div className="admin-dynamic-list">
                    {ingredients.map((ingredient, index) => (
                      <div className="admin-ingredient-row" key={`ingredient-${index}`} data-testid={`row-ingredient-${index}`}>
                        <span className="admin-dynamic-index">{String(index + 1).padStart(2, "0")}</span>
                        <input aria-label={`اسم المكوّن ${index + 1}`} value={ingredient.name} onChange={(event) => setIngredients((current) => current.map((row, position) => position === index ? { ...row, name: event.target.value } : row))} placeholder="اسم المكوّن" data-testid={`input-ingredient-name-${index}`} />
                        <label className={`ingredient-mode ${ingredient.isExcludable ? "can-exclude" : "core"}`} title={ingredient.isExcludable ? "يمكن للضيف استبعاده" : "مكوّن أساسي لا يمكن استبعاده"}>
                          <input type="checkbox" checked={ingredient.isExcludable} onChange={(event) => setIngredients((current) => current.map((row, position) => position === index ? { ...row, isExcludable: event.target.checked } : row))} data-testid={`checkbox-ingredient-excludable-${index}`} />
                          <span>{ingredient.isExcludable ? "يُستبعد" : "أساسي"}</span>
                        </label>
                        <button type="button" className="admin-remove-row" aria-label="حذف المكوّن" onClick={() => setIngredients((current) => current.filter((_, position) => position !== index))} data-testid={`button-remove-ingredient-${index}`}><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="admin-add-row" onClick={() => setIngredients((current) => [...current, { name: "", isExcludable: true }])} data-testid="button-add-ingredient"><Plus size={16} /> إضافة مكوّن</button>
                </section>

                <section className="admin-form-section variants-section">
                  <div className="admin-section-heading"><span>03</span><div><h3>الخيارات</h3><p>أحجام أو تحضيرات بسعر وصورة اختياريين</p></div></div>
                  {variants.length === 0 && <p className="admin-inline-empty" data-testid="text-no-variants">لا توجد خيارات إضافية لهذا الصنف.</p>}
                  <div className="admin-variant-list">
                    {variants.map((variant, index) => (
                      <div className="admin-variant-card" key={`variant-${index}`} data-testid={`card-variant-${index}`}>
                        <div className="admin-variant-heading"><span>الخيار {String(index + 1).padStart(2, "0")}</span><button type="button" className="admin-remove-row" aria-label="حذف الخيار" onClick={() => setVariants((current) => current.filter((_, position) => position !== index))} data-testid={`button-remove-variant-${index}`}><Trash2 size={15} /></button></div>
                        <div className="admin-variant-fields">
                          <label className="admin-field"><span>اسم الخيار</span><input value={variant.name} onChange={(event) => setVariants((current) => current.map((row, position) => position === index ? { ...row, name: event.target.value } : row))} placeholder="مثال: كبير" data-testid={`input-variant-name-${index}`} /></label>
                          <label className="admin-field"><span>السعر البديل <small>اتركه فارغاً للسعر الأساسي</small></span><input type="number" min="0" step="1" inputMode="numeric" value={variant.priceOverride} onChange={(event) => setVariants((current) => current.map((row, position) => position === index ? { ...row, priceOverride: event.target.value } : row))} placeholder="السعر الأساسي" data-testid={`input-variant-price-${index}`} /></label>
                          <label className="admin-field variant-image-input"><span>رابط صورة بديلة <small>اختياري</small></span><input type="url" dir="ltr" value={variant.imageUrl} onChange={(event) => setVariants((current) => current.map((row, position) => position === index ? { ...row, imageUrl: event.target.value } : row))} placeholder="https://…" data-testid={`input-variant-image-url-${index}`} /></label>
                          <label className="admin-upload-button variant-upload">
                            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadVariantImage(index, event.target.files?.[0]); event.currentTarget.value = ""; }} data-testid={`input-variant-image-upload-${index}`} />
                            {uploadingVariant === index ? <LoaderCircle size={16} className="admin-spin" /> : <Upload size={16} />}<span>رفع صورة</span>
                          </label>
                        </div>
                        <label className="admin-check variant-availability"><input type="checkbox" checked={variant.isAvailable} onChange={(event) => setVariants((current) => current.map((row, position) => position === index ? { ...row, isAvailable: event.target.checked } : row))} data-testid={`checkbox-variant-available-${index}`} /><span className="admin-checkmark"><Check size={13} /></span><span><b>الخيار متاح</b></span></label>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="admin-add-row" onClick={() => setVariants((current) => [...current, { name: "", priceOverride: "", imageUrl: "", isAvailable: true }])} data-testid="button-add-variant"><Plus size={16} /> إضافة خيار</button>
                </section>
              </div>
              {formError && <div className="admin-alert editor-alert" role="alert" data-testid="status-item-form-error"><AlertCircle size={16} /><span>{formError}</span></div>}
              <footer className="admin-editor-actions">
                <button type="button" className="admin-cancel-button" onClick={() => setFormOpen(false)} disabled={saving} data-testid="button-cancel-item-edit">إلغاء</button>
                <button type="submit" className="admin-primary-button" disabled={saving || uploadingBase || uploadingVariant !== null} data-testid="button-save-menu-item">
                  {saving ? <><LoaderCircle size={17} className="admin-spin" /> جارٍ الحفظ…</> : <><Save size={17} /> حفظ الصنف</>}
                </button>
              </footer>
            </form>
            </Form>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="admin-modal-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteTarget(null); }}>
          <section className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" data-testid="dialog-delete-confirmation">
            <div className="delete-mark"><Trash2 size={20} /></div>
            <span className="admin-eyebrow">إزالة من القائمة</span>
            <h2 id="delete-title">حذف «{deleteTarget.name}»؟</h2>
            <p>سيُحذف الصنف ومكوّناته وخياراته نهائياً. لا يمكن التراجع عن ذلك.</p>
            <div className="confirm-actions">
              <button className="admin-cancel-button" onClick={() => setDeleteTarget(null)} disabled={deleting} data-testid="button-cancel-delete">إبقاء الصنف</button>
              <button className="admin-delete-button" onClick={() => void confirmDelete()} disabled={deleting} data-testid="button-confirm-delete">{deleting ? <><LoaderCircle size={16} className="admin-spin" /> جارٍ الحذف…</> : <><Trash2 size={16} /> حذف نهائي</>}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default AdminPanel;
