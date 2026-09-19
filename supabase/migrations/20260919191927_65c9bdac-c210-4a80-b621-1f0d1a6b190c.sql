ALTER TABLE public.active_streams DROP CONSTRAINT IF EXISTS active_streams_selected_language_check;
ALTER TABLE public.active_streams ADD CONSTRAINT active_streams_selected_language_check
  CHECK (selected_language IN ('Spanish','Mandarin','Hindi','Vietnamese','Arabic','Nepali','Swahili','German','French'));