import { createHash, timingSafeEqual } from "node:crypto";

export type ClickCallbackFields = {
  click_trans_id: string;
  service_id: string;
  click_paydoc_id: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string;
  error: string;
  error_note: string;
  sign_time: string;
  sign_string: string;
};

export const CLICK_ERROR_NOTES: Record<number, string> = {
  0: "Success",
  [-1]: "SIGN CHECK FAILED",
  [-2]: "Incorrect parameter amount",
  [-3]: "Action not found",
  [-4]: "Already paid",
  [-5]: "User does not exist",
  [-6]: "Transaction does not exist",
  [-7]: "Failed to update user",
  [-8]: "Error in request from click",
  [-9]: "Transaction cancelled",
};

const COMMON_FIELDS = [
  "click_trans_id",
  "service_id",
  "click_paydoc_id",
  "merchant_trans_id",
  "amount",
  "action",
  "error",
  "error_note",
  "sign_time",
  "sign_string",
] as const;

export function parseClickForm(body: string, requirePrepareId: boolean): ClickCallbackFields | null {
  if (!body || body.length > 32_000) return null;
  const params = new URLSearchParams(body);
  for (const field of COMMON_FIELDS) {
    if (!params.has(field)) return null;
  }
  if (requirePrepareId && !params.has("merchant_prepare_id")) return null;

  const value = (key: string) => params.get(key)?.trim() || "";
  const result: ClickCallbackFields = {
    click_trans_id: value("click_trans_id"),
    service_id: value("service_id"),
    click_paydoc_id: value("click_paydoc_id"),
    merchant_trans_id: value("merchant_trans_id"),
    amount: value("amount"),
    action: value("action"),
    error: value("error"),
    error_note: value("error_note"),
    sign_time: value("sign_time"),
    sign_string: value("sign_string"),
  };
  if (requirePrepareId) result.merchant_prepare_id = value("merchant_prepare_id");
  return result;
}

function md5(value: string) {
  return createHash("md5").update(value, "utf8").digest("hex");
}

export function expectedClickSignature(fields: ClickCallbackFields, secretKey: string) {
  const prefix = fields.click_trans_id + fields.service_id + secretKey + fields.merchant_trans_id;
  const preparePart = fields.action === "1" ? (fields.merchant_prepare_id || "") : "";
  return md5(prefix + preparePart + fields.amount + fields.action + fields.sign_time);
}

export function verifyClickSignature(fields: ClickCallbackFields, secretKey: string) {
  if (!secretKey || !/^[a-fA-F0-9]{32}$/.test(fields.sign_string)) return false;
  const expected = Buffer.from(expectedClickSignature(fields, secretKey).toLowerCase(), "utf8");
  const received = Buffer.from(fields.sign_string.toLowerCase(), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function parseClickAmountUzs(value: string) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  if (match[2] && !/^0{1,2}$/.test(match[2])) return null;
  const amount = Number(match[1]);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 2_147_483_647 ? amount : null;
}

export function isDecimalInteger(value: string, maxDigits = 19) {
  return new RegExp(`^\\d{1,${maxDigits}}$`).test(value);
}

export function clickResponseBase(fields: Partial<ClickCallbackFields>) {
  return {
    click_trans_id: fields.click_trans_id || "",
    merchant_trans_id: fields.merchant_trans_id || "",
  };
}

export function clickError(fields: Partial<ClickCallbackFields>, error: number) {
  return {
    ...clickResponseBase(fields),
    error,
    error_note: CLICK_ERROR_NOTES[error] || CLICK_ERROR_NOTES[-8],
  };
}

export function buildClickPaymentUrl(input: {
  paymentUrl: string;
  serviceId: string;
  merchantId: string;
  merchantUserId?: string;
  orderRef: string;
  amount: number;
  returnUrl: string;
}) {
  const url = new URL(input.paymentUrl);
  url.searchParams.set("service_id", input.serviceId);
  url.searchParams.set("merchant_id", input.merchantId);
  if (input.merchantUserId) url.searchParams.set("merchant_user_id", input.merchantUserId);
  url.searchParams.set("amount", String(input.amount));
  url.searchParams.set("transaction_param", input.orderRef);
  url.searchParams.set("return_url", input.returnUrl);
  return url.toString();
}
