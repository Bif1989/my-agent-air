const assert = require('assert');

process.env.VK_PRIMARY_PEER_ID = process.env.VK_PRIMARY_PEER_ID || '2000000001';
const billing = require('../lib/billing');

assert.strictEqual(billing.formatMoney(0).replace(/\s/g, ''), '0so‘m');
assert.strictEqual(billing.formatMoney(5000).replace(/\s/g, ''), '5000so‘m');
assert(billing.TOPUP_AMOUNTS.has(5000));
assert(billing.TOPUP_AMOUNTS.has(200000));
assert(!billing.TOPUP_AMOUNTS.has(4999));

const cabinet = billing.cabinetMenu();
assert(cabinet.buttons[0][0].action.payload.includes('billing'));
assert(cabinet.buttons[1][0].action.payload.includes('profile_edit'));

const topups = billing.billingMenu();
assert(topups.buttons[0][0].action.payload.includes('topup_amount'));
assert(topups.buttons[2][1].action.payload.includes('200000'));

const pay = billing.paymentMenu('https://my.click.uz/services/pay?x=1');
assert.strictEqual(pay.buttons[0][0].action.type, 'open_link');
assert.strictEqual(pay.buttons[0][0].color, undefined);
assert(pay.buttons[0][0].action.link.startsWith('https://my.click.uz/'));

assert(billing.insufficientBalanceMenu().buttons[0][0].action.payload.includes('billing'));

console.log('billing tests: OK');
