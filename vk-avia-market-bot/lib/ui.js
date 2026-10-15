const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';
const MARKET_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000001);
const MARKET_CHAT_ID = MARKET_PEER_ID >= 2000000000 ? MARKET_PEER_ID - 2000000000 : MARKET_PEER_ID;
const MARKET_CHAT_URL = process.env.VK_MARKET_CHAT_URL || `https://vk.ru/im?sel=c${MARKET_CHAT_ID}`;

function payload(cmd, extra = {}) { return JSON.stringify({ cmd, v: 2, ...extra }); }

function privateMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'open_link', label: '🌐 UMUMIY CHAT', link: MARKET_CHAT_URL } }],
      [
        { action: { type: 'callback', label: '➕ TAKLIF BERISH', payload: payload('new_offer') }, color: 'primary' },
        { action: { type: 'callback', label: '🔎 SO‘ROV BERISH', payload: payload('new_search') }, color: 'primary' },
      ],
      [
        { action: { type: 'callback', label: '🌐 TAKLIFLAR', payload: payload('offers') }, color: 'secondary' },
        { action: { type: 'callback', label: '👥 SO‘ROVLAR', payload: payload('searches') }, color: 'secondary' },
      ],
      [
        { action: { type: 'callback', label: '📦 MENING TAKLIFLARIM', payload: payload('my_offers') }, color: 'secondary' },
        { action: { type: 'callback', label: '📋 MENING SO‘ROVLARIM', payload: payload('my_searches') }, color: 'secondary' },
      ],
      [
        { action: { type: 'callback', label: '👤 KABINET', payload: payload('cabinet') }, color: 'secondary' },
        { action: { type: 'callback', label: '📊 STATISTIKA', payload: payload('stats') }, color: 'secondary' },
      ],
    ],
  };
}

function profileMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'callback', label: '✏️ KONTAKTLARNI SOZLASH', payload: payload('profile_edit') }, color: 'primary' }],
      [
        { action: { type: 'callback', label: '📦 TAKLIFLARIM', payload: payload('my_offers') }, color: 'secondary' },
        { action: { type: 'callback', label: '📋 SO‘ROVLARIM', payload: payload('my_searches') }, color: 'secondary' },
      ],
      [{ action: { type: 'callback', label: '🏠 MENYU', payload: payload('home') }, color: 'secondary' }],
    ],
  };
}

function listingManageMenu(items = []) {
  const buttons = [];
  for (const [index, item] of items.slice(0, 5).entries()) {
    const id = Number(item?.id || 0);
    if (!id) continue;
    buttons.push([
      { action: { type: 'callback', label: `✏️ ${index + 1}`, payload: payload('edit_listing', { id }) }, color: 'primary' },
      { action: { type: 'callback', label: `🗑 ${index + 1}`, payload: payload('delete_listing', { id }) }, color: 'negative' },
    ]);
  }
  buttons.push([{ action: { type: 'callback', label: '🏠 MENYU', payload: payload('home') }, color: 'secondary' }]);
  return { inline: true, buttons };
}

function confirmDeleteMenu(listingId) {
  const id = Number(listingId || 0);
  return {
    inline: true,
    buttons: [[
      { action: { type: 'callback', label: '✅ O‘CHIRISH', payload: payload('confirm_delete_listing', { id }) }, color: 'negative' },
      { action: { type: 'callback', label: '↩️ BEKOR', payload: payload('cancel_delete_listing', { id }) }, color: 'secondary' },
    ]],
  };
}

function groupMenu() {
  return null;
}

function adminMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'callback', label: '📌 QOIDALARNI YANGILASH', payload: payload('admin_pinmenu') }, color: 'primary' }],
      [{ action: { type: 'callback', label: '🧹 BOT E’LONLARINI TOZALASH', payload: payload('admin_cleanall') }, color: 'negative' }],
    ],
  };
}

function privateHome() {
  return {
    text: [
      '📌 AVIA MARKET — SHAXSIY BOT QOIDALARI', '',
      '1️⃣ Taklif yoki So‘rovni faqat tegishli tugma orqali yuboring.',
      '2️⃣ Bir xil Taklif/So‘rov 24 soat ichida faqat 1 marta joylanadi.',
      '3️⃣ Yangi e’lonlar orasida kamida 30 soniya bo‘lishi kerak.',
      '4️⃣ Yo‘nalish, sana, narx, joy soni va bagajni imkon qadar aniq yozing.',
      '5️⃣ KABINETda kompaniya, telefon va Telegramni saqlasangiz, ular yangi e’lonlaringizga avtomatik qo‘shiladi.',
      '6️⃣ “MENING TAKLIFLARIM / SO‘ROVLARIM” orqali o‘z e’loningizni o‘zgartirish yoki o‘chirish mumkin.',
      '7️⃣ Spam, flood, haqorat, firibgarlik va mavzuga aloqasiz reklama taqiqlanadi.', '',
      '✈️ E’lon berish:',
      '“➕ TAKLIF BERISH” yoki “🔎 SO‘ROV BERISH” → keyingi BITTA xabarda matnni yuboring.', '',
      '🌐 UMUMIY CHAT tugmasi ASOSIY AVIA MARKET chatini ochadi.',
      '🛡 Bot boshqa VK besedalarga admin qilib qo‘shilsa, ularda ham forward va takroriy xabarlarni nazorat qiladi.',
    ].join('\n'),
    keyboard: privateMenu(),
  };
}

function groupHome({ isPrimary = true } = {}) {
  const footer = isPrimary
    ? 'Shaxsiy bot orqali berilgan Taklif/So‘rovlar shu ASOSIY CHATga avtomatik chiqariladi.'
    : 'Bu qo‘shimcha chatda bot moderatsiya qiladi. Shaxsiy botdagi Taklif/So‘rovlar faqat ASOSIY AVIA MARKET chatiga avtomatik chiqariladi.';

  return {
    text: [
      '📌 AVIA MARKET — UMUMIY CHAT QOIDALARI', '',
      '1️⃣ Chat ochiq: barcha ishtirokchilar erkin yozishi va javob berishi mumkin.',
      '2️⃣ Bir foydalanuvchi aynan bir xil 10+ belgilik xabarni 24 soat ichida faqat 1 marta qoldira oladi. Takrori bot tomonidan o‘chiriladi.',
      '3️⃣ Boshqa gruppa, kanal yoki chatdan pereslat (forward) qilingan xabarlar taqiqlanadi va bot tomonidan o‘chiriladi.',
      '4️⃣ Taklif va So‘rovlarni tartibli joylash uchun SHAXSIY BOTdan foydalaning.',
      '5️⃣ Yo‘nalish, sana, narx, joy soni va bagajni imkon qadar aniq yozing.',
      '6️⃣ Spam, flood, haqorat, firibgarlik va mavzuga aloqasiz reklama taqiqlanadi.',
      '7️⃣ Har bir agent o‘zi bergan ma’lumot va kelishuv uchun javobgar.', '',
      '🔒 SHAXSIY BOT:',
      BOT_OPEN_URL,
      '',
      footer,
    ].join('\n'),
    keyboard: null,
  };
}

function adminHome() {
  return {
    text: [
      '⚙️ AVIA MARKET — ADMIN BOSHQARUV', '',
      'Bu bo‘lim faqat admin akkauntida ko‘rinadi.',
      'Alohida ADMIN BOT yo‘q — boshqaruv shu SHAXSIY BOT ichida.', '',
      '🛡 MULTI-CHAT REJIM: bot qo‘shilgan barcha VK besedalarda forward va 24 soatlik takroriy xabar nazorati ishlaydi.',
      '📌 Qo‘shimcha chatda qoidani pin qilish uchun o‘sha chatning o‘zida /menu yozing.',
      '📌 Qoidalarni yangilash — ASOSIY UMUMIY CHATga yangi qoidalarni yuboradi va eski zakreplyon xabar o‘rniga pin qiladi.',
      '🧹 Bot e’lonlarini tozalash — faqat ASOSIY CHATdagi bot kuzatgan e’lon/xizmat xabarlarini tozalaydi; oddiy foydalanuvchi yozishmalariga tegmaydi.', '',
      '↩️ Shaxsiy menyuga qaytish: /menu',
    ].join('\n'),
    keyboard: adminMenu(),
  };
}

module.exports = {
  privateMenu,
  profileMenu,
  listingManageMenu,
  confirmDeleteMenu,
  groupMenu,
  adminMenu,
  privateHome,
  groupHome,
  adminHome,
};
