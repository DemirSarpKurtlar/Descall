-- Duyurular: refresh the four live announcements (data only, Nov 2026).
-- Apply AFTER 20261115_announcements_schema.sql. Touches only these four rows by id
-- and deletes nothing. Priority and pinned stay as they are; pin_order keeps the
-- order people see today (newest pinned first). Each row gets:
--   - a key of the new line icon set instead of the stored emoji (emoji cleared)
--   - title and text without emojis (wording kept; the duplicated "Selam!" at the
--     start of the first text is removed)
--   - the source language (Turkish, except "Leave a Review!" which was written in
--     English) and versions for all 7 app languages (tr, en, de, es, fr, pt-BR, ru)
--   - a button: report a bug / send feedback (opens the in-app feedback window),
--     write an App Store review, open the store
--   - status 'live' and published_at = created_at (unchanged visibility)
-- Safe to re-run.

BEGIN;

UPDATE public.announcements SET
  icon = $a$heart$a$,
  emoji = '',
  title = $a$Selam!$a$,
  content = $a$Descall'da fark ettiğiniz en küçük hatayı ya da geliştirme önerinizi bizimle paylaşabilirsiniz. 1 hafta içinde düzeltmek ve iyileştirmek için çalışacağız. Katkı sağlayanlara özel rozet de vereceğiz!$a$,
  source_lang = $a$tr$a$,
  translations = $a${"en":{"title":"Hi there!","content":"Spotted even the smallest bug in Descall, or have an idea to make it better? Share it with us. We will work on fixing and improving it within a week, and everyone who contributes gets a special badge!","cta_label":"Report a bug","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"de":{"title":"Hallo!","content":"Dir ist in Descall ein noch so kleiner Fehler aufgefallen oder du hast eine Idee für eine Verbesserung? Teile sie mit uns. Wir kümmern uns innerhalb einer Woche darum, und wer mithilft, bekommt ein besonderes Abzeichen!","cta_label":"Fehler melden","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"es":{"title":"¡Hola!","content":"¿Has encontrado algún error en Descall, por pequeño que sea, o tienes una idea para mejorarlo? Cuéntanoslo. Trabajaremos para corregirlo y mejorarlo en una semana, y quienes colaboren recibirán una insignia especial.","cta_label":"Informar de un error","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"fr":{"title":"Bonjour !","content":"Vous avez repéré un bug dans Descall, même minime, ou vous avez une idée d'amélioration ? Partagez-la avec nous. Nous nous engageons à corriger et à améliorer les choses sous une semaine, et chaque contributeur recevra un badge spécial !","cta_label":"Signaler un bug","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"pt-BR":{"title":"Olá!","content":"Encontrou algum erro no Descall, por menor que seja, ou tem uma ideia para melhorar o app? Conte para a gente. Vamos trabalhar para corrigir e melhorar em até uma semana, e quem contribuir ganha um emblema especial!","cta_label":"Relatar um erro","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"ru":{"title":"Привет!","content":"Заметили в Descall даже самую мелкую ошибку или знаете, что можно улучшить? Напишите нам. Мы постараемся всё исправить и улучшить в течение недели, а все, кто помогает, получат особый значок!","cta_label":"Сообщить об ошибке","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"}}$a$::jsonb,
  cta_label = $a$Hata bildir$a$,
  cta_url = $a$/feedback?type=bug$a$,
  status = 'live',
  published_at = COALESCE(published_at, created_at),
  pin_order = CASE WHEN pinned THEN 1 ELSE NULL END,
  updated_at = now(),
  updated_by_name = 'migration'
WHERE id = $a$f0e80971-8aaf-4134-8c9c-7d9b79313bb3$a$::uuid AND is_active = true;

UPDATE public.announcements SET
  icon = $a$message$a$,
  emoji = '',
  title = $a$Geri Bildirimlerinizi Bekliyoruz!$a$,
  content = $a$Uygulamamız hakkında öneri, istek ve düşüncelerinizi bizimle paylaşmayı unutmayın!

Ayrıca uygulamaya eklenmesini istediğiniz özelliklerle ilgili fikirlerinizi de bizimle paylaşabilirsiniz.

Sizlerden gelen geri bildirimler ve özellik önerileri bizim için çok önemli. Uygulamayı hep birlikte daha iyi hale getirebilmek için aklınızdaki fikirleri bizimle paylaşmaktan çekinmeyin!$a$,
  source_lang = $a$tr$a$,
  translations = $a${"en":{"title":"We'd Love Your Feedback!","content":"Don't forget to share your suggestions, requests and thoughts about the app with us!\n\nYou can also tell us about features you would like to see added.\n\nYour feedback and feature ideas matter a lot to us. Don't hesitate to share what's on your mind so we can make the app better together!","cta_label":"Send feedback","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"de":{"title":"Wir freuen uns auf dein Feedback!","content":"Teile uns gern deine Vorschläge, Wünsche und Gedanken zur App mit!\n\nDu kannst uns auch sagen, welche Funktionen du dir noch wünschst.\n\nDein Feedback und deine Ideen sind uns sehr wichtig. Erzähl uns, was dir einfällt, damit wir die App gemeinsam besser machen!","cta_label":"Feedback senden","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"es":{"title":"¡Queremos conocer tu opinión!","content":"No olvides contarnos tus sugerencias, peticiones e ideas sobre la aplicación.\n\nTambién puedes decirnos qué funciones te gustaría que añadiéramos.\n\nTus comentarios y propuestas son muy importantes para nosotros. No dudes en compartir lo que pienses para que juntos mejoremos la aplicación.","cta_label":"Enviar comentarios","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"fr":{"title":"Votre avis nous intéresse !","content":"N'oubliez pas de nous faire part de vos suggestions, demandes et impressions sur l'application !\n\nVous pouvez aussi nous dire quelles fonctionnalités vous aimeriez voir arriver.\n\nVos retours et vos idées comptent beaucoup pour nous. N'hésitez pas à les partager pour que nous améliorions l'application ensemble !","cta_label":"Donner mon avis","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"pt-BR":{"title":"Queremos ouvir você!","content":"Não se esqueça de compartilhar com a gente suas sugestões, pedidos e opiniões sobre o app!\n\nVocê também pode contar quais recursos gostaria de ver no aplicativo.\n\nSeu feedback e suas ideias são muito importantes para nós. Compartilhe o que estiver pensando para deixarmos o app ainda melhor juntos!","cta_label":"Enviar feedback","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"ru":{"title":"Ждём ваших отзывов!","content":"Делитесь с нами предложениями, пожеланиями и мыслями о приложении!\n\nРасскажите и о том, какие функции вы хотели бы увидеть.\n\nВаши отзывы и идеи очень важны для нас. Не стесняйтесь писать, чтобы вместе сделать приложение лучше!","cta_label":"Оставить отзыв","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"}}$a$::jsonb,
  cta_label = $a$Geri bildirim gönder$a$,
  cta_url = $a$/feedback$a$,
  status = 'live',
  published_at = COALESCE(published_at, created_at),
  pin_order = CASE WHEN pinned THEN 2 ELSE NULL END,
  updated_at = now(),
  updated_by_name = 'migration'
WHERE id = $a$1199cd69-17ce-4c87-bb42-cdbd84fc0c9b$a$::uuid AND is_active = true;

UPDATE public.announcements SET
  icon = $a$star$a$,
  emoji = '',
  title = $a$Leave a Review!$a$,
  content = $a$Don't forget to leave a review and help us make Descall even better!$a$,
  source_lang = $a$en$a$,
  translations = $a${"tr":{"title":"Değerlendirme Bırakın!","content":"Descall'u birlikte daha da iyi hale getirmek için bir değerlendirme bırakmayı unutmayın!","cta_label":"Değerlendirme yaz","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"de":{"title":"Gib uns eine Bewertung!","content":"Vergiss nicht, eine Bewertung abzugeben, und hilf uns, Descall noch besser zu machen!","cta_label":"Bewertung schreiben","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"es":{"title":"¡Déjanos una reseña!","content":"No olvides dejar una reseña y ayudarnos a mejorar Descall.","cta_label":"Escribir una reseña","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"fr":{"title":"Laissez-nous un avis !","content":"N'oubliez pas de laisser un avis pour nous aider à améliorer Descall !","cta_label":"Écrire un avis","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"pt-BR":{"title":"Deixe sua avaliação!","content":"Não se esqueça de deixar uma avaliação e nos ajudar a melhorar o Descall!","cta_label":"Escrever avaliação","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"ru":{"title":"Оставьте отзыв!","content":"Не забудьте оставить отзыв: так вы поможете нам сделать Descall ещё лучше!","cta_label":"Написать отзыв","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"}}$a$::jsonb,
  cta_label = $a$Write a review$a$,
  cta_url = $a$https://apps.apple.com/app/id6820558264?action=write-review$a$,
  status = 'live',
  published_at = COALESCE(published_at, created_at),
  pin_order = CASE WHEN pinned THEN 3 ELSE NULL END,
  updated_at = now(),
  updated_by_name = 'migration'
WHERE id = $a$42f42eb2-04f7-42e1-afaa-e2102a9dd224$a$::uuid AND is_active = true;

UPDATE public.announcements SET
  icon = $a$shop$a$,
  emoji = '',
  title = $a$Mağazaya Girip Kataloğa Göz Atmayı Unutmayın!$a$,
  content = $a$Mağazamıza göz atmayı unutmayın!
Katalogda sizler için hazırlanan ürünleri inceleyebilir, yeni eklenen ürünleri keşfedebilirsiniz.$a$,
  source_lang = $a$tr$a$,
  translations = $a${"en":{"title":"Don't Forget to Check Out the Store!","content":"Take a look at our store!\nBrowse the items we prepared for you in the catalog and discover the latest additions.","cta_label":"Open the store","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"de":{"title":"Schau im Shop vorbei!","content":"Wirf einen Blick in unseren Shop!\nIm Katalog findest du Artikel, die wir für dich vorbereitet haben, und entdeckst die neuesten Ergänzungen.","cta_label":"Shop öffnen","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"es":{"title":"¡No olvides visitar la tienda!","content":"¡Echa un vistazo a nuestra tienda!\nEn el catálogo puedes ver los artículos que preparamos para ti y descubrir las últimas novedades.","cta_label":"Abrir la tienda","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"fr":{"title":"Pensez à faire un tour dans la boutique !","content":"Jetez un œil à notre boutique !\nDans le catalogue, découvrez les articles préparés pour vous et les dernières nouveautés.","cta_label":"Ouvrir la boutique","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"pt-BR":{"title":"Não deixe de conferir a loja!","content":"Dê uma olhada na nossa loja!\nNo catálogo, você encontra os itens que preparamos para você e as últimas novidades.","cta_label":"Abrir a loja","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"},"ru":{"title":"Загляните в магазин!","content":"Посмотрите, что есть в нашем магазине!\nВ каталоге вас ждут подготовленные для вас товары и последние новинки.","cta_label":"Открыть магазин","state":"ready","by":"migration","at":"2026-11-15T00:00:00.000Z"}}$a$::jsonb,
  cta_label = $a$Mağazayı aç$a$,
  cta_url = $a$/settings/shop$a$,
  status = 'live',
  published_at = COALESCE(published_at, created_at),
  pin_order = NULL,
  updated_at = now(),
  updated_by_name = 'migration'
WHERE id = $a$a032e926-721d-48a2-b002-d58b80d4c8db$a$::uuid AND is_active = true;

COMMIT;
