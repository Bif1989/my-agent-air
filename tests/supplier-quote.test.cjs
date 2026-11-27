const { test } = require('node:test');
const assert = require('node:assert/strict');
const { supplierQuoteComment, supplierQuoteCurrency } = require('../lib/supplier-quote.ts');

test('external quote preserves separately entered taxes and cancellation for the buyer', () => {
  const draft = { available:true,tax:' Kiritilgan ', cancellation:'48 soat oldin bepul', comment:'Nonushta bilan' };
  assert.equal(supplierQuoteComment({...draft,lang:'uz'}), 'Soliqlar va yig‘imlar: Kiritilgan\nBekor qilish shartlari: 48 soat oldin bepul\nNonushta bilan');
  assert.match(supplierQuoteComment({...draft,lang:'ru'}), /^Налоги и сборы: Kiritilgan\nУсловия отмены:/);
});

test('external quote remains compatible with legacy text and bounded RPC', () => {
  assert.equal(supplierQuoteComment({ available:false, tax:'Ignore',cancellation:'Ignore',comment:'Joy yo‘q',lang:'uz' }), 'Joy yo‘q');
  assert.equal(supplierQuoteComment({ available:true,tax:'',cancellation:'',comment:'',lang:'uz' }),null);
  assert.ok(supplierQuoteComment({ available:true,tax:'x'.repeat(600),cancellation:'a'.repeat(600),comment:'b'.repeat(1000),lang:'ru' }).length <= 1000);
  assert.equal(supplierQuoteCurrency('USD'),'USD');
  assert.equal(supplierQuoteCurrency('unsupported'),'UZS');
});
