/*
# Normalize empty-string national_id to NULL

`national_id` on `customers` was already nullable and UNIQUE at the
database level, so blank national IDs were never rejected here. The bug
was purely on the application side: the edit/add form was saving an empty
string ('') instead of NULL when the field was left blank. Since '' is a
distinct, non-null value for a UNIQUE constraint, a second customer saved
with a blank national ID would collide with the first '' row and fail.

This migration only normalizes any pre-existing empty-string values to
NULL (same real-world meaning: "no national ID recorded"), so the app fix
(saving NULL instead of '' going forward, see application code) does not
immediately collide with old data. No other column or row is touched, and
no non-empty national_id value is modified.
*/

UPDATE public.customers SET national_id = NULL WHERE national_id = '';
