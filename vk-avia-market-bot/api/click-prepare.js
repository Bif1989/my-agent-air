const { readFields, integerAmount, positiveInteger, send, errorReply, reasonError, sbRpc, serviceReady } = require('../lib/click-shop');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: -3, error_note: 'Action not found' });

  const fields = readFields(req);
  const required = [
    fields.click_trans_id, fields.service_id, fields.click_paydoc_id, fields.merchant_trans_id,
    fields.amount, fields.action, fields.error, fields.sign_time, fields.sign_string,
  ];
  if (required.some((v) => !v)) return errorReply(res, fields, -8, 'Error in request');

  const [ready, code, note] = serviceReady(fields, '0', false);
  if (!ready) return errorReply(res, fields, code, note);

  const amount = integerAmount(fields.amount);
  const clickTransId = positiveInteger(fields.click_trans_id);
  const clickPaydocId = positiveInteger(fields.click_paydoc_id);
  if (amount === null || clickTransId === null || clickPaydocId === null) {
    return errorReply(res, fields, -8, 'Incorrect parameters');
  }

  try {
    const result = await sbRpc('prepare_vk_click_payment_order', {
      p_order_ref: fields.merchant_trans_id,
      p_click_trans_id: clickTransId,
      p_click_paydoc_id: clickPaydocId,
      p_amount: amount,
    });
    if (!result?.ok || !Number.isInteger(result?.merchant_prepare_id)) {
      const [error, errorNote] = reasonError(result?.reason);
      return errorReply(res, fields, error, errorNote);
    }
    return send(res, {
      click_trans_id: clickTransId,
      merchant_trans_id: fields.merchant_trans_id,
      merchant_prepare_id: result.merchant_prepare_id,
      error: 0,
      error_note: 'Success',
    });
  } catch (e) {
    console.error('click_prepare_failed', { message: e.message });
    return errorReply(res, fields, -8, 'Service unavailable');
  }
};
