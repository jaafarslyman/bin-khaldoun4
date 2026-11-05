import { supabase } from "@/lib/supabase";

export type AdminIngredient = {
  id: string;
  name: string;
  isExcludable: boolean;
  sortOrder: number;
};

export type AdminVariant = {
  id: string;
  name: string;
  priceOverride: number | null;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
};

export type AdminMenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string;
  isDrink: boolean;
  isAvailable: boolean;
  sortOrder: number;
  ingredients: AdminIngredient[];
  variants: AdminVariant[];
};

export type MenuItemDraft = {
  id: string;
  name: string;
  category: string;
  price: number;
  image_url: string;
  is_drink: boolean;
  is_available: boolean;
  sort_order: number;
  ingredients: { name: string; is_excludable: boolean; sort_order: number }[];
  variants: {
    name: string;
    price_override: number | null;
    image_url: string | null;
    is_available: boolean;
    sort_order: number;
  }[];
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function getCurrentAdmin(): Promise<{
  id: string;
  email: string;
} | null> {
  const client = requireSupabase();
  const {
    data: { session },
    error,
  } = await client.auth.getSession();

  if (error) throw error;
  if (!session) return null;

  if (!(await isAdminUser(session.user.id))) {
    await client.auth.signOut();
    return null;
  }

  return { id: session.user.id, email: session.user.email ?? "" };
}

export async function signInAdmin(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;
  if (!data.user || !(await isAdminUser(data.user.id))) {
    await client.auth.signOut();
    throw new Error("ADMIN_NOT_AUTHORIZED");
  }

  return { id: data.user.id, email: data.user.email ?? "" };
}

export async function signOutAdmin() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export async function loadAdminMenu(): Promise<AdminMenuItem[]> {
  const { data, error } = await requireSupabase()
    .from("menu_items")
    .select(
      "id, name, category, price, image_url, is_drink, is_available, sort_order, menu_item_ingredients(id, name, is_excludable, sort_order), menu_item_variants(id, name, price_override, image_url, is_available, sort_order)",
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    imageUrl: row.image_url,
    isDrink: row.is_drink,
    isAvailable: row.is_available,
    sortOrder: row.sort_order,
    ingredients: [...(row.menu_item_ingredients ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        isExcludable: ingredient.is_excludable,
        sortOrder: ingredient.sort_order,
      })),
    variants: [...(row.menu_item_variants ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        priceOverride:
          variant.price_override === null
            ? null
            : Number(variant.price_override),
        imageUrl: variant.image_url,
        isAvailable: variant.is_available,
        sortOrder: variant.sort_order,
      })),
  }));
}

export async function saveMenuItem(draft: MenuItemDraft): Promise<string> {
  const { data, error } = await requireSupabase().rpc("save_menu_item", {
    p_item: draft,
  });

  if (error) throw error;
  if (!data || typeof data !== "object" || typeof data.id !== "string") {
    throw new Error("The menu service returned an invalid response.");
  }
  return data.id;
}

export async function deleteMenuItem(itemId: string) {
  const { error } = await requireSupabase().rpc("delete_menu_item", {
    p_item_id: itemId,
  });
  if (error) throw error;
}

export async function uploadMenuImage(file: File): Promise<string> {
  const client = requireSupabase();
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("يُسمح فقط بصور JPG أو PNG أو WebP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("يجب أن يكون حجم الصورة أقل من 5 ميغابايت.");
  }

  const extension =
    file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `menu/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await client.storage
    .from("menu-images")
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;
  return client.storage.from("menu-images").getPublicUrl(data.path).data
    .publicUrl;
}
