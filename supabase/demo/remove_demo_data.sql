-- Undo supabase/demo/demo_data.sql: removes the demo bookings (with their
-- reviews, chats, history), packages, add-ons, working hours, blocked days,
-- follows and shortlist entries of the test users + Brian's demo bookings.
-- Run this before deleting the test users (bookings block deleting a user).
-- Albums, photos and the accounts themselves are left alone.

with people as (
  select id from public.profiles
  where username::text in ('mayachen', 'jonahshoots', 'priya.frames', 'leo.spaces', 'sofia.wild', 'diego.alvarez',
                           'hanakim.studio', 'jordanlee', 'sampatel', 'rosa.d', 'kai.film', 'taylorb')
),
listings as (
  select id from public.providers where profile_id in (select id from people)
),
gone_bookings as (
  delete from public.bookings
  where provider_id in (select id from listings) or client_id in (select id from people)
  returning id
),
gone_inquiries as (
  delete from public.conversations where kind = 'inquiry' and provider_id in (select id from listings) returning id
),
gone_packages as (
  delete from public.packages where provider_id in (select id from listings) returning id
),
gone_addons as (
  delete from public.package_addons where provider_id in (select id from listings) returning id
),
gone_rules as (
  delete from public.availability_rules where provider_id in (select id from listings) returning id
),
gone_blackouts as (
  delete from public.blackouts where provider_id in (select id from listings) returning id
),
gone_follows as (
  delete from public.follows where provider_id in (select id from listings) returning 1
),
gone_saved as (
  delete from public.saved_providers where provider_id in (select id from listings) returning 1
)
select (select count(*) from gone_bookings) as bookings, (select count(*) from gone_packages) as packages,
       (select count(*) from gone_inquiries) as inquiries;
