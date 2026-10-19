-- SALT OKUMA. Her adımdan önce ve sonra çalıştırılır.
SELECT category, count(*) total, count(*) FILTER (WHERE active) active FROM public.shop_items
WHERE category IN ('profile_title','countries') GROUP BY 1;
SELECT count(*) AS title_equipped FROM public.users WHERE equipped_title_id IS NOT NULL;
SELECT count(*) AS country_equipped FROM public.users WHERE equipped_country_id IS NOT NULL;
SELECT si.sku, ui.acquired_via, count(*) FROM public.user_inventory ui JOIN public.shop_items si ON si.id = ui.item_id
WHERE si.category = 'profile_title' GROUP BY 1,2 ORDER BY 1,2;
