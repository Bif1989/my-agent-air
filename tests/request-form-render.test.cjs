const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.tsx'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(result.outputText, filename);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { UiSettingsProvider } = require('../lib/ui-settings.tsx');
const RequestForm = require('../app/requests/request-form.tsx').default;
const RequestServiceDetails = require('../app/requests/request-service-details.tsx').default;
const { SERVICE_CATEGORIES, serviceDefinition, fieldVisible } = require('../lib/service-request.ts');
const render = (component, props) => renderToStaticMarkup(React.createElement(UiSettingsProvider, null, React.createElement(component, props)));

test('all seven forms render their relevant required fields without nested forms', () => {
  for (const category of SERVICE_CATEGORIES) {
    const details = { trip_type: 'round_trip', transfer_type: 'round_trip' };
    const html = render(RequestForm, { initialValues: { category, service_details: details }, submitLabel: 'Saqlash', submittingLabel: 'Saqlanmoqda', onSubmit: async () => {} });
    assert.equal((html.match(/<form\b/g) || []).length, 1, category);
    assert.ok(html.includes('id="request-destination"'), category);
    assert.equal(html.includes('id="request-origin"'), Boolean(serviceDefinition(category).origin), category);
    for (const field of serviceDefinition(category).fields.filter(item => item.required && fieldVisible(item, details))) assert.ok(html.includes(`id="request-service_details-${field.key}"`), `${category}: ${field.key}`);
    assert.ok(html.includes('id="request-ai-text"'), category);
  }
});
test('hotel display retains dates, room counts, ages, meal plan and budget basis without flight baggage', () => {
  const html = render(RequestServiceDetails, { request: { category: 'Mehmonxona', travel_date: '2099-11-12', adults: 2, children: 1, infants: 0, budget: 100, currency: 'USD', baggage: 'LEGACY_AIR_ONLY', description: 'Tinch xona', service_details: { check_out: '2099-11-15', rooms: '2', child_ages: '7', meal_plan: 'breakfast', budget_basis: 'per_room_night' } } });
  for (const text of ['Chiqish sanasi', 'Xonalar soni', 'Tunlar soni', 'Bolalar yoshi', 'Nonushta', 'Bir xona / bir tun', 'Tinch xona']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('LEGACY_AIR_ONLY'));
});
