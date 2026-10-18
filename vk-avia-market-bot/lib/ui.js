const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';
const MARKET_CHAT_URL = process.env.VK_MARKET_CHAT_URL || 'https://vk.me/join/9Dn9taRYkLOBOpxp7ussbi/P6NICNIX98ZY=';

function payload(cmd, extra = {}) { return JSON.stringify({ cmd, v: 4, ...extra }); }
function callbackButton(label, cmd, color = 'secondary', extra = {}) {
  return { action: { type: 'callback', label, payload: payload(cmd, extra) }, color };
}

function privateMenu() {
  return {
    inline: true,
    buttons: [
      [{ action: { type: 'open_link', label: '🌐 UMUMIY CHAT', link: MARKET_CHAT_URL } }],
      [
        callbackButton('➕ TAKLIF BERISH', 'new_offer', 'primary'),
        callbackButton('🔎 SO‘ROV BERISH', 'new_search', 'primary'),
      ],
      [
        callbackButton('🌐 TAKLIFLAR', 'offers'),
        callbackButton('👥 SO‘ROVLAR', 'searches'),
      ],
      [
        callbackButton('📦 MENING TAKLIFLARIM', 'my_offers'),
        callbackButton('📋 MENING SO‘ROVLARIM', 'my_searches'),
      ],
      [
        callbackButton('👤 KABINET', 'cabinet'),
        callbackButton('📊 STATISTIKA', 'stats'),
      ],
    ],
  };
}

function profileMenu() {
  return {
    inline: true,
    buttons: [
      [callbackButton('✏️ KONTAKTLARNI SOZLASH', 'profile_edit', 'primary')],
      [
        callbackButton('📦 TAKLIFLARIM', 'my_offers'),
        callbackButton('📋 SO‘ROVLARIM', 'my_searches'),
      ],
      [callbackButton('🏠 MENYU', 'home')],
    ],
  };
}

function listingManageMenu(items = []) {
  const buttons = [];
  for (const [index, item] of items.slice(0, 5).entries()) {
    const id = Number(item?.id || 0);
    if (!id) continue;
    buttons.push([
      callbackButton(`✏️ ${index + 1}`, 'edit_listing', 'primary', { id }),
      callbackButton(`🗑 ${index + 1}`, 'delete_listing', 'negative', { id }),
    ]);
  }
  buttons.push([callbackButton('🏠 MENYU', 'home')]);
  return { inline: true, buttons };
}

function confirmDeleteMenu(listingId) {
  const id = Number(listingId || 0);
  return {
    inline: true,
    buttons: [[
      callbackButton('✅ O‘CHIRISH', 'confirm_delete_listing', 'negative', { id }),
      callbackButton('↩️ BEKOR', 'cancel_delete_listing', 'secondary', { id }),
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
      [callbackButton('📌 QOIDALARNI YANGILASH', 'admin_pinmenu', 'primary')],
      [callbackButton('🧹 BOT E’LONLARINI TOZALASH', 'admin_cleanall', 'negative')],
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
      '🌐 UMUMIY CHAT tugmasi ASOSIY AVIA MARKET chatini to‘g‘ridan-to‘g‘ri ochadi.',
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