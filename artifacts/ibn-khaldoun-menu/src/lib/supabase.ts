import { createClient } from "@supabase/supabase-js";

export type Dish = {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  ingredients: IngredientOption[];
  variants: DishVariant[];
  drink: boolean;
};

export type IngredientOption = {
  id: string;
  name: string;
  isExcludable: boolean;
};

export type DishVariant = {
  id: string;
  name: string;
  price: number;
  image: string;
};

export type OrderItemInput = {
  id: string;
  quantity: number;
  sugar: string | null;
  variantId: string | null;
  excludedIngredientIds: string[];
};

export type OrderReceipt = {
  id: string;
  total: number;
  sessionId: string;
  sessionTotal: number;
};

type MenuItemRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  image_url: string;
  is_drink: boolean;
  menu_item_ingredients: {
    id: string;
    name: string;
    is_excludable: boolean;
    sort_order: number;
  }[];
  menu_item_variants: {
    id: string;
    name: string;
    price_override: number | null;
    image_url: string | null;
    is_available: boolean;
    sort_order: number;
  }[];
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase =
  isSupabaseConfigured && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export async function fetchMenu(): Promise<Dish[]> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("menu_items")
    .select(
      "id, name, category, price, image_url, is_drink, menu_item_ingredients(id, name, is_excludable, sort_order), menu_item_variants(id, name, price_override, image_url, is_available, sort_order)",
    )
    .eq("is_available", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as MenuItemRow[])
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      price: Number(item.price),
      image: item.image_url,
      hasVariants: (item.menu_item_variants ?? []).length > 0,
      ingredients: [...(item.menu_item_ingredients ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          isExcludable: ingredient.is_excludable,
        })),
      variants: [...(item.menu_item_variants ?? [])]
        .filter((variant) => variant.is_available)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: Number(variant.price_override ?? item.price),
          image: variant.image_url || item.image_url,
        })),
      drink: item.is_drink,
    }))
    .filter((item) => !item.hasVariants || item.variants.length > 0)
    .map(({ hasVariants: _hasVariants, ...item }) => item);
}

export async function placeOrder(
  tableNumber: string,
  items: OrderItemInput[],
): Promise<OrderReceipt> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("place_order", {
    p_table_number: tableNumber,
    p_items: items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      sugar: item.sugar,
      variant_id: item.variantId,
      excluded_ingredient_ids: item.excludedIngredientIds,
    })),
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The order service returned an invalid response.");
  }

  const result = data as {
    order_id?: unknown;
    session_id?: unknown;
    order_total?: unknown;
    session_total?: unknown;
  };
  if (
    typeof result.order_id !== "string" ||
    typeof result.session_id !== "string" ||
    typeof result.order_total !== "number" ||
    typeof result.session_total !== "number"
  ) {
    throw new Error("The order service returned an invalid response.");
  }

  return {
    id: result.order_id,
    total: result.order_total,
    sessionId: result.session_id,
    sessionTotal: result.session_total,
  };
}
