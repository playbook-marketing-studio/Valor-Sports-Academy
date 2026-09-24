-- Parents can log the same workout more than once ("Log Again"); coaches edit their own log in place from the app.
drop index if exists public.workout_logs_coach_one_per_workout;
