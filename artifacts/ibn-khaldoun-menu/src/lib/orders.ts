import { supabase } from "@/lib/supabase";

export type OrderLineStatus = "pending" | "served" | "cancelled";
export type OrderStatus = "received" | "served" | "cancelled";
export type ServiceRequestType = "waiter" | "bill";
export type ServiceRequestStatus = "pending" | "resolved";

export type SessionOrderItem = {
  id: string;
  itemName: string;
  variantName: string | null;
  sugar: string | null;
  excludedIngredients: string[];
  quantity: number;
  unitPrice: number;
  total: number;
  status: OrderLineStatus;
  servedAt: string | null;
  cancelledAt: string | null;
};

export type SessionOrder = {
  id: string;
  tableNumber: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  paidAt: string | null;
  items: SessionOrderItem[];
};

export type DiningSession = {
  id: string;
  tableNumber: string;
  openedAt: string;
  closedAt: string | null;
  paidAt: string | null;
  tipAmount: number;
  total: number;
  waiterRequested: boolean;
  billRequested: boolean;
  orders: SessionOrder[];
};

export type AdminServiceRequest = {
  id: string;
  tableNumber: string;
  sessionId: string | null;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  billAmount: number | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type AdminOrdersSnapshot = {
  sessions: DiningSession[];
  requests: AdminServiceRequest[];
};

type RawRecord = Record<string, unknown>;

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : {};
}

function asArray(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mapOrderItem(row: RawRecord): SessionOrderItem {
  const status = asString(row.status);
  return {
    id: asString(row.id),
    itemName: asString(row.item_name),
    variantName: asNullableString(row.variant_name),
    sugar: asNullableString(row.sugar),
    excludedIngredients: Array.isArray(row.excluded_ingredients)
      ? row.excluded_ingredients.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    quantity: asNumber(row.quantity),
    unitPrice: asNumber(row.unit_price),
    total: asNumber(row.line_total),
    status:
      status === "served" || status === "cancelled" ? status : "pending",
    servedAt: asNullableString(row.served_at),
    cancelledAt: asNullableString(row.cancelled_at),
  };
}

function mapOrder(row: RawRecord): SessionOrder {
  const status = asString(row.status);
  return {
    id: asString(row.id),
    tableNumber: asString(row.table_number),
    status: status === "served" || status === "cancelled" ? status : "received",
    total: asNumber(row.total),
    createdAt: asString(row.created_at),
    paidAt: asNullableString(row.paid_at),
    items: asArray(row.order_items ?? row.items).map(mapOrderItem),
  };
}

function mapSession(row: RawRecord): DiningSession {
  const orders = asArray(row.orders).map(mapOrder);
  const tipAmount = asNumber(row.tip_amount);
  const paidAt = asNullableString(row.paid_at);
  const calculatedTotal =
    orders.reduce(
      (sessionTotal, order) =>
        sessionTotal +
        (order.paidAt
          ? 0
          : order.items.reduce(
              (orderTotal, item) =>
                orderTotal + (item.status === "cancelled" ? 0 : item.total),
              0,
            )),
      0,
    ) + (paidAt ? 0 : tipAmount);
  return {
    id: asString(row.id),
    tableNumber: asString(row.table_number),
    openedAt: asString(row.opened_at),
    closedAt: asNullableString(row.closed_at),
    paidAt,
    tipAmount,
    total: row.total === undefined ? calculatedTotal : asNumber(row.total),
    waiterRequested: row.waiter_requested === true,
    billRequested: row.bill_requested === true,
    orders,
  };
}

function mapServiceRequest(row: RawRecord): AdminServiceRequest {
  const type = asString(row.request_type);
  return {
    id: asString(row.id),
    tableNumber: asString(row.table_number),
    sessionId: asNullableString(row.session_id),
    type: type === "bill" ? "bill" : "waiter",
    status: row.status === "resolved" ? "resolved" : "pending",
    billAmount:
      row.bill_amount === null || row.bill_amount === undefined
        ? null
        : asNumber(row.bill_amount),
    createdAt: asString(row.created_at),
    resolvedAt: asNullableString(row.resolved_at),
  };
}

export async function getActiveTableSession(
  tableNumber: string,
  sessionId: string,
): Promise<DiningSession | null> {
  const { data, error } = await requireSupabase().rpc(
    "get_active_table_session",
    {
      p_table_number: tableNumber,
      p_session_id: sessionId,
    },
  );
  if (error) throw error;
  return data ? mapSession(asRecord(data)) : null;
}

export async function loadAdminOrders(): Promise<AdminOrdersSnapshot> {
  const client = requireSupabase();
  const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [sessionResult, requestResult] = await Promise.all([
    client
      .from("dining_sessions")
      .select(
        "id, table_number, opened_at, closed_at, paid_at, tip_amount, orders(id, table_number, status, total, created_at, paid_at, order_items(id, item_name, variant_name, sugar, excluded_ingredients, quantity, unit_price, line_total, status, served_at, cancelled_at))",
      )
      .or(`closed_at.is.null,opened_at.gte.${recentSince}`)
      .order("opened_at", { ascending: false })
      .limit(100),
    client
      .from("service_requests")
      .select(
        "id, table_number, session_id, request_type, status, bill_amount, created_at, resolved_at",
      )
      .or(`status.eq.pending,created_at.gte.${recentSince}`)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (sessionResult.error) throw sessionResult.error;
  if (requestResult.error) throw requestResult.error;

  const sessions = ((sessionResult.data ?? []) as RawRecord[]).map((row) =>
    mapSession(asRecord(row)),
  );
  const requests = ((requestResult.data ?? []) as RawRecord[]).map((row) =>
    mapServiceRequest(asRecord(row)),
  );
  return {
    sessions: sessions.map((session) => ({
      ...session,
      waiterRequested: requests.some(
        (request) =>
          request.status === "pending" &&
          request.type === "waiter" &&
          request.tableNumber === session.tableNumber &&
          (!request.sessionId || request.sessionId === session.id),
      ),
      billRequested: requests.some(
        (request) =>
          request.status === "pending" &&
          request.type === "bill" &&
          request.sessionId === session.id,
      ),
    })),
    requests,
  };
}

async function callAdminRpc(
  functionName:
    | "admin_mark_order_served"
    | "admin_mark_order_item_served"
    | "admin_mark_order_paid"
    | "admin_close_dining_session"
    | "admin_mark_dining_session_paid"
    | "admin_resolve_service_request",
  args: Record<string, string>,
) {
  const { error } = await requireSupabase().rpc(functionName, args);
  if (error) throw error;
}

export function cancelSessionOrder(sessionId: string, orderId: string) {
  return callAdminOrCustomerRpc("cancel_session_order", {
    p_session_id: sessionId,
    p_order_id: orderId,
  });
}

export function cancelSessionOrderItem(sessionId: string, itemId: string) {
  return callAdminOrCustomerRpc("cancel_session_order_item", {
    p_session_id: sessionId,
    p_order_item_id: itemId,
  });
}

async function callAdminOrCustomerRpc(
  functionName: "cancel_session_order" | "cancel_session_order_item",
  args: Record<string, string>,
) {
  const { error } = await requireSupabase().rpc(functionName, args);
  if (error) throw error;
}

export async function requestWaiter(
  tableNumber: string,
  sessionId: string | null,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc("request_waiter", {
    p_table_number: tableNumber,
    p_session_id: sessionId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || !("request_id" in data)) {
    throw new Error("The waiter request returned an invalid response.");
  }
  return String((data as { request_id: unknown }).request_id);
}

export async function requestBill(
  sessionId: string,
  tipAmount: number,
): Promise<{ requestId: string; billAmount: number }> {
  const { data, error } = await requireSupabase().rpc("request_session_bill", {
    p_session_id: sessionId,
    p_tip_amount: tipAmount,
  });
  if (error) throw error;
  const result = asRecord(data);
  if (typeof result.request_id !== "string") {
    throw new Error("The bill request returned an invalid response.");
  }
  return {
    requestId: result.request_id,
    billAmount: asNumber(result.bill_amount),
  };
}

export async function adminMarkOrderServed(orderId: string) {
  await callAdminRpc("admin_mark_order_served", { p_order_id: orderId });
}

export async function adminMarkOrderPaid(orderId: string) {
  await callAdminRpc("admin_mark_order_paid", { p_order_id: orderId });
}

export async function adminMarkOrderItemServed(itemId: string) {
  await callAdminRpc("admin_mark_order_item_served", {
    p_order_item_id: itemId,
  });
}

export async function adminCloseDiningSession(sessionId: string) {
  await callAdminRpc("admin_close_dining_session", {
    p_session_id: sessionId,
  });
}

export async function adminMarkDiningSessionPaid(sessionId: string) {
  await callAdminRpc("admin_mark_dining_session_paid", {
    p_session_id: sessionId,
  });
}

export async function adminResolveServiceRequest(requestId: string) {
  await callAdminRpc("admin_resolve_service_request", {
    p_request_id: requestId,
  });
}
