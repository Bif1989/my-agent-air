"use client";

import Link from "next/link";
import { ANALYTICS_SETTINGS_EVENT } from "@/lib/landing-analytics-consent";
import { UiControls, useUiSettings } from "@/lib/ui-settings";

export default function CookiePolicy() {
  const { isRu } = useUiSettings();
  const title = isRu ? "Политика использования cookie" : "Cookie va brauzer xotirasi siyosati";
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 dark:border-slate-700 dark:bg-slate-900">
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm font-semibold text-blue-700 dark:text-blue-300">← My Agent Air</Link>
          <UiControls compact />
        </nav>
        <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
          <p>{isRu ? "Необходимые данные в браузере поддерживают ваш сеанс, выбранный язык, тему и настройки сайта. Отключение дополнительной аналитики не влияет на эти функции. Сеанс завершает кнопка выхода; настройки браузера можно очистить в самом браузере." : "Brauzerdagi zaruriy ma’lumotlar hisob sessiyasi, tanlangan til, mavzu va sayt sozlamalarini saqlashga xizmat qiladi. Ixtiyoriy statistikani o‘chirish bu funksiyalarga ta’sir qilmaydi. Sessiyani chiqish tugmasi orqali tugatish va brauzer ma’lumotlarini brauzerning o‘zidan tozalash mumkin."}</p>
          <p>{isRu ? "Если дополнительная аналитика подключена, Google Analytics получает измерения посещения только главной страницы и только после вашего согласия. Сайт не передаёт в эту интеграцию параметры URL, содержимое анкет, чатов и личных кабинетов. Рекламное отслеживание этой интеграцией не включается." : "Ixtiyoriy statistika ulangan bo‘lsa, Google Analytics faqat bosh sahifaga tashrif o‘lchovini va faqat roziligingizdan keyin oladi. Ushbu ulanishga URL parametrlari, anketalar, yozishmalar va shaxsiy kabinet mazmuni yuborilmaydi. Bu ulanish reklama kuzatuvini yoqmaydi."}</p>
          <p>{isRu ? "Ваш выбор хранится в файле __Host-maa-analytics до 180 дней. В настройках ниже вы можете изменить решение. Отказ останавливает дальнейший сбор через эту интеграцию; он не удаляет сведения, которые были отправлены раньше." : "Tanlovingiz __Host-maa-analytics cookie faylida 180 kungacha saqlanadi. Quyidagi sozlamada qaroringizni o‘zgartirishingiz mumkin. Rad etish ushbu ulanish orqali kelgusida yig‘ishni to‘xtatadi, avval yuborilgan ma’lumotlarni o‘chirmaydi."}</p>
          <p>
            <Link href="/privacy" className="text-blue-700 underline dark:text-blue-300">{isRu ? "Политика конфиденциальности" : "Maxfiylik qoidalari"}</Link>
            {" · "}
            <Link href="/help" className="text-blue-700 underline dark:text-blue-300">{isRu ? "Помощь" : "Yordam"}</Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(ANALYTICS_SETTINGS_EVENT))}
          className="mt-6 rounded-xl border border-slate-400 px-4 py-2 text-sm font-semibold"
        >
          {isRu ? "Изменить настройки cookie" : "Cookie sozlamalarini o‘zgartirish"}
        </button>
      </article>
    </main>
  );
}
