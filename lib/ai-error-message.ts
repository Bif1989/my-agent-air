export function aiErrorMessage(code: string | undefined, isRu: boolean) {
  const messages: Record<string, [string, string]> = {
    USER_LIMIT: ["Bugungi AI limiti tugadi. Toshkent vaqti bilan 00:00 dan keyin qayta urinishingiz yoki anketani qo‘lda to‘ldirishingiz mumkin.", "Лимит AI на сегодня исчерпан. Попробуйте после 00:00 по Ташкенту или заполните анкету вручную."],
    GLOBAL_LIMIT: ["Saytning bugungi AI limiti tugadi. Anketani qo‘lda to‘ldirish mumkin.", "Дневной лимит AI сайта исчерпан. Анкету можно заполнить вручную."],
    TOO_FAST: ["AI’ga qayta yuborishdan oldin 6 soniya kuting.", "Подождите 6 секунд перед повторным запросом к AI."],
    ACCOUNT_INACTIVE: ["AI uchun faol hisob kerak. Administrator bilan bog‘laning.", "Для AI нужен активный аккаунт. Свяжитесь с администратором."],
    AI_NOT_CONFIGURED: ["AI hali serverga ulanmagan. Anketani qo‘lda to‘ldirishingiz mumkin.", "AI пока не подключён на сервере. Анкету можно заполнить вручную."],
    UNAUTHORIZED: ["Hisobingizga qayta kiring.", "Войдите в аккаунт снова."],
    AI_INCOMPLETE: ["AI javobi to‘liq kelmadi. Xizmatlarni kichikroq guruhlarga ajratib qayta yuboring.", "Ответ AI пришёл не полностью. Повторите запрос меньшими группами услуг."],
  };
  return messages[code || ""]?.[isRu ? 1 : 0];
}
