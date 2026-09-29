#!/usr/bin/env node
/**
 * Add the `ProjectExtras` message namespace to the locale files.
 *
 * The parts of the Minbar project page that show campaign data the page did
 * not use before: the campaign's own video, every category it is filed under,
 * and donors' messages (Comment rows) with the form to leave one.
 *
 * App-level (PascalCase) namespace, like `TeamSupport` and `ProjectShares`:
 * `scripts/sync-minbar-messages.mjs` rewrites the Minbar namespaces. Locales
 * not listed are filled from `en` by `buildNormalizedMessages()`.
 *
 * Idempotent.  node scripts/add-project-extras-messages.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const PROJECT_EXTRAS = {
  ar: {
    updateBadge: "تحديث من المشروع",
    readMore: "اقرأ المزيد",
    showLess: "عرض أقل",
    video: "فيديو المشروع",
    categories: "التصنيفات",
    tabComments: "رسائل المتبرعين",
    commentsEmpty: "لا توجد رسائل بعد. كن أول من يترك دعاءً أو كلمة دعم.",
    commentPh: "اكتب دعاءً أو كلمة دعم…",
    commentSend: "إرسال",
    commentSignIn: "سجّل الدخول لترك رسالة",
    commentFailed: "تعذّر إرسال رسالتك. حاول مرة أخرى.",
  },
  en: {
    updateBadge: "Project update",
    readMore: "Read more",
    showLess: "Show less",
    video: "Project video",
    categories: "Categories",
    tabComments: "Donor messages",
    commentsEmpty: "No messages yet. Be the first to leave a prayer or a word of support.",
    commentPh: "Write a prayer or a word of support…",
    commentSend: "Send",
    commentSignIn: "Sign in to leave a message",
    commentFailed: "Your message could not be sent. Please try again.",
  },
  tr: {
    updateBadge: "Proje güncellemesi",
    readMore: "Devamını oku",
    showLess: "Daha az göster",
    video: "Proje videosu",
    categories: "Kategoriler",
    tabComments: "Bağışçı mesajları",
    commentsEmpty: "Henüz mesaj yok. Bir dua ya da destek sözü bırakan ilk kişi olun.",
    commentPh: "Bir dua ya da destek sözü yazın…",
    commentSend: "Gönder",
    commentSignIn: "Mesaj bırakmak için giriş yapın",
    commentFailed: "Mesajınız gönderilemedi. Lütfen tekrar deneyin.",
  },
  fr: {
    updateBadge: "Actualité du projet",
    readMore: "Lire la suite",
    showLess: "Réduire",
    video: "Vidéo du projet",
    categories: "Catégories",
    tabComments: "Messages des donateurs",
    commentsEmpty: "Aucun message pour l'instant. Soyez le premier à laisser une prière ou un mot de soutien.",
    commentPh: "Écrivez une prière ou un mot de soutien…",
    commentSend: "Envoyer",
    commentSignIn: "Connectez-vous pour laisser un message",
    commentFailed: "Votre message n'a pas pu être envoyé. Veuillez réessayer.",
  },
  de: {
    updateBadge: "Projekt-Update",
    readMore: "Weiterlesen",
    showLess: "Weniger anzeigen",
    video: "Projektvideo",
    categories: "Kategorien",
    tabComments: "Nachrichten der Spender",
    commentsEmpty: "Noch keine Nachrichten. Hinterlassen Sie als Erster ein Bittgebet oder ein Wort der Unterstützung.",
    commentPh: "Schreiben Sie ein Bittgebet oder ein Wort der Unterstützung…",
    commentSend: "Senden",
    commentSignIn: "Melden Sie sich an, um eine Nachricht zu hinterlassen",
    commentFailed: "Ihre Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
  },
  es: {
    updateBadge: "Novedad del proyecto",
    readMore: "Leer más",
    showLess: "Mostrar menos",
    video: "Vídeo del proyecto",
    categories: "Categorías",
    tabComments: "Mensajes de los donantes",
    commentsEmpty: "Aún no hay mensajes. Sé el primero en dejar una oración o una palabra de apoyo.",
    commentPh: "Escribe una oración o una palabra de apoyo…",
    commentSend: "Enviar",
    commentSignIn: "Inicia sesión para dejar un mensaje",
    commentFailed: "No se pudo enviar tu mensaje. Inténtalo de nuevo.",
  },
  pt: {
    updateBadge: "Atualização do projeto",
    readMore: "Ler mais",
    showLess: "Mostrar menos",
    video: "Vídeo do projeto",
    categories: "Categorias",
    tabComments: "Mensagens dos doadores",
    commentsEmpty: "Ainda não há mensagens. Seja o primeiro a deixar uma oração ou uma palavra de apoio.",
    commentPh: "Escreva uma oração ou uma palavra de apoio…",
    commentSend: "Enviar",
    commentSignIn: "Inicie sessão para deixar uma mensagem",
    commentFailed: "Não foi possível enviar a sua mensagem. Tente novamente.",
  },
  id: {
    updateBadge: "Kabar proyek",
    readMore: "Baca selengkapnya",
    showLess: "Tampilkan lebih sedikit",
    video: "Video proyek",
    categories: "Kategori",
    tabComments: "Pesan para donatur",
    commentsEmpty: "Belum ada pesan. Jadilah yang pertama meninggalkan doa atau kata dukungan.",
    commentPh: "Tulis doa atau kata dukungan…",
    commentSend: "Kirim",
    commentSignIn: "Masuk untuk meninggalkan pesan",
    commentFailed: "Pesan Anda tidak dapat dikirim. Silakan coba lagi.",
  },
};

let written = 0;
for (const locale of Object.keys(PROJECT_EXTRAS)) {
  const file = `i18n/messages/${locale}.json`;
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.ProjectExtras = PROJECT_EXTRAS[locale];
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  written += 1;
}
console.log(`[project-extras-messages] wrote ProjectExtras namespace to ${written} locale files`);
