-- ONE-TIME RESET: permanently delete every existing Penubaka announcement
-- (draft, published and archived). Run this once before creating fresh posts.
delete from public.announcements
where village_id in (select id from public.villages where slug = 'penubaka');
