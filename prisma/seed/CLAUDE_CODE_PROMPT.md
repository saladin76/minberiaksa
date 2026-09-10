# CLAUDE_CODE_PROMPT.md — أمر جاهز لـ Claude Code

انسخ الأمر التالي كما هو داخل مشروعك (حيث `prisma/schema.prisma`):

---

```
Add the following content models to prisma/schema.prisma (MongoDB provider). Follow the EXACT conventions already used in this schema: @id @default(auto()) @map("_id") @db.ObjectId, timestamps (createdAt @default(now()), updatedAt @updatedAt), a separate *Translation model per translatable model with a @@unique([<parent>Id, locale]) compound key and onDelete: Cascade, and slug @unique on the parent. Do not change or rename any existing model. (Make sure to add them to the dashboard like campaigns and blogs and all that stuff in the same sub menu and allow to create edit delete like them)

1) Story — homepage story rail (scheduled, expiring)
   slug @unique, title, image, linkUrl String?, order Int @default(0),
   isActive Boolean @default(true), startsAt DateTime?, endsAt DateTime? (Add 24h default and add option in dashboard to make it unlimited time dashboard)
   + StoryTranslation { locale, title }

2) VideoPlaylist — "برامجنا المصورة" (YouTube playlists / series)
   slug @unique, title, description String?, youtubePlaylistUrl String?,
   kind PlaylistKind @default(PROGRAM), coverImage String?, order Int @default(0), isActive Boolean @default(true)
   + PlaylistTranslation { locale, title, description }
   + relation videos PlaylistVideo[]

3) PlaylistVideo — episodes inside a playlist
   playlistId @db.ObjectId, youtubeId, url, thumbnail String?, title String?,
   durationSeconds Int?, order Int @default(0), isActive Boolean @default(true)
   playlist VideoPlaylist @relation(fields: [playlistId], references: [id], onDelete: Cascade)

4) Course — "دوراتنا"
   slug @unique, title, description String?, coverImage String?,
   introVideoId String?, introVideoUrl String?, unitsCount Int?,
   isPinned Boolean @default(false), isExternal Boolean @default(false), externalUrl String?,
   hasDetailPage Boolean @default(false), order Int @default(0), isActive Boolean @default(true)
   + CourseTranslation { locale, title, description }
   + relation videos CourseVideo[]

5) CourseVideo
   courseId @db.ObjectId, youtubeId, url, thumbnail String?, title String?, order Int @default(0)
   course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

6) Video — standalone videos ("إنجازاتنا" + "تزكياتنا")
   slug @unique, type VideoType, title, youtubeId String?, url String?, startSeconds Int?,
   thumbnail String?, regionKey String?, localeFilter String[] @default([]),
   showOnHome Boolean @default(false), order Int @default(0), isActive Boolean @default(true)
   + VideoTranslation { locale, title }
   NOTE: localeFilter limits visibility to specific locales (Turkish endorsements are tr-only). Empty = all locales.

7) Report — "التقارير" (PDF reports)
   slug @unique, title, description String?, fileUrl, coverImage String?,
   year Int?, order Int @default(0), isPublished Boolean @default(true)
   + ReportTranslation { locale, title, description }

8) Booklet — "كتيبات المؤسسة"
   slug @unique, title, description String?, fileUrl, coverImage String?, order Int @default(0), isPublished Boolean @default(true)
   + BookletTranslation { locale, title, description }

9) BankAccount + BankAccountCurrency — bank transfer donations
   BankAccount: slug @unique, name, branch String?, swift String?, holder,
     logo String?, locales String[] @default([]), order Int @default(0), isActive Boolean @default(true)
   BankAccountCurrency: bankAccountId @db.ObjectId, code (ISO 4217), accountNo String?, extNo String?, iban String?
     bankAccount BankAccount @relation(..., onDelete: Cascade)
   + BankAccountTranslation { locale, name, branch, holder }
   NOTE: each locale/country may publish different banks — hence locales[] on BankAccount.

10) UrgentBanner — urgent campaign banner with auto-expiry
    slug @unique, title, description String?, image String?, ctaLabel String?, ctaUrl String?,
    campaignId String? @db.ObjectId, suggestedAmounts Int[] @default([]),
    priority Int @default(0), locales String[] @default([]),
    startsAt DateTime?, endsAt DateTime?, isActive Boolean @default(true)
    + UrgentBannerTranslation { locale, title, description, ctaLabel }

11) Faq
    question, answer, page String?, order Int @default(0), isActive Boolean @default(true)
    + FaqTranslation { locale, question, answer }

12) SiteSetting — single-row-per-key settings (contact info, socials, WhatsApp number)
    key @unique, value Json, group String?

Enums:
  enum PlaylistKind { PROGRAM SERIES }
  enum VideoType { ACHIEVEMENT ENDORSEMENT FIELD }

After editing the schema:
- run: npx prisma generate
- extend prisma/seed.ts with upsert blocks for Story, VideoPlaylist(+PlaylistVideo), Course(+CourseVideo) and Video, reading prisma/seed-data-extra.json (same upsert-on-slug, idempotent style as the existing blocks).
- For nested children (PlaylistVideo, CourseVideo, BankAccountCurrency): deleteMany by parentId then createMany, so re-running the seed never duplicates rows.
```

---

## البيانات الجاهزة الآن (في `seed-data-extra.json`)

| النموذج | العدد | المصدر |
|---|---:|---|
| `Story` | 6 | شريط قصص الرئيسية |
| `VideoPlaylist` | 4 | برامجنا المصورة (قوائم يوتيوب رسمية) |
| `PlaylistVideo` | 12 | حلقات البرامج |
| `Course` | 7 | دوراتنا (منها «نور الدين زنكي» بصفحة تفاصيل) |
| `Video` | 16 | 5 إنجازات + 11 تزكية (منها 5 تركية بـ`localeFilter: ["tr"]`) |

كلها مترجمة **ar (master) + en + tr**.

## نماذج تحتاج بيانات رسمية منك (لا تُبذر الآن)

| النموذج | لماذا |
|---|---|
| `Report` · `Booklet` | تحتاج روابط ملفات PDF الرسمية |
| `BankAccount` | **لا تُبذر أبدًا بأرقام تجريبية** — IBAN/SWIFT رسمية تُدخل من الداشبورد فقط |
| `UrgentBanner` | تُنشأ عند إطلاق حملة فعلية |
| `Faq` · `SiteSetting` | محتوى تحريري/إعدادات تُدار من الداشبورد |
