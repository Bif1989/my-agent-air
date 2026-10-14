const { readFields, integerAmount, positiveInteger, send, errorReply, reasonError, sbRpc, serviceReady } = require('../lib/click-shop');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: -3, error_note: 'Action not found' });

  const fields = readFields(req);
  const required = [
    fields.click_trans_id, fields.service_id, fields.click_paydoc_id, fields.merchant_trans_id,
    fields.merchant_prepare_id, fields.amount, fields.action, fields.error, fields.sign_time, fields.sign_string,
  ];
  if (required.some((v) => !v)) return errorReply(res, fields, -8, 'Error in request');

  const [ready, code, note] = serviceReady(fields, '1', true);
  if (!ready) return errorReply(res, fields, code, note);

  const amount = integerAmount(fields.amount);
  const clickTransId = positiveInteger(fields.click_trans_id);
  const clickPaydocId = positiveInteger(fields.click_paydoc_id);
  const merchantPrepareId = positiveInteger(fields.merchant_prepare_id);
  const providerError = Number(fields.error);
  if (amount === null || clickTransId === null || clickPaydocId === null || merchantPrepareId === null || !Number.isInteger(providerError)) {
    return errorReply(res, fields, -8, 'Incorrect parameters');
  }

  try {
    if (providerError < 0) {
      await sbRpc('cancel_vk_click_payment_order', {
        p_order_ref: fields.merchant_trans_id,
        p_click_trans_id: clickTransId,
        p_provider_error: providerError,
        p_provider_error_note: fields.error_note,
      });
      return errorReply(res, fields, -9, 'Transaction cancelled');
    }

    const result = await sbRpc('complete_vk_click_payment_order', {
      p_order_ref: fields.merchant_trans_id,
      p_click_trans_id: clickTransId,
      p_click_paydoc_id: clickPaydocId,
      p_merchant_prepare_id: merchantPrepareId,
    });
    if (!result?.ok || !Number.isInteger(result?.merchant_confirm_id)) {
      const [error, errorNote] = reasonError(result?.reason);
      return errorReply(res, fields, error, errorNote);
    }

    return send(res, {
      click_trans_id: clickTransId,
      merchant_trans_id: fields.merchant_trans_id,
      merchant_confirm_id: result.merchant_confirm_id,
      error: 0,
      error_note: 'Success',
    });
  } catch (e) {
    console.error('click_complete_failed', { message: e.message });
    return errorReply(res, fields, -8, 'Service unavailable');
  }
};
