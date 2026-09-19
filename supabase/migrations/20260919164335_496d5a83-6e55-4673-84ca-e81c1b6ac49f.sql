CREATE TABLE public.active_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_name text NOT NULL,
  selected_language text NOT NULL CHECK (selected_language IN ('Spanish', 'Mandarin', 'Hindi', 'Vietnamese', 'Arabic', 'Nepali', 'Swahili')),
  noise_suppression_db numeric(5,1) NOT NULL DEFAULT -96.0 CHECK (noise_suppression_db BETWEEN -96 AND 0),
  latency_ms integer NOT NULL DEFAULT 1400 CHECK (latency_ms >= 0),
  original_transcript text NOT NULL DEFAULT '',
  translated_transcript text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disconnected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.active_streams TO anon, authenticated;
GRANT ALL ON public.active_streams TO service_role;

ALTER TABLE public.active_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view venue stream telemetry"
ON public.active_streams
FOR SELECT
TO anon, authenticated
USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.active_streams;

INSERT INTO public.active_streams
  (attendee_name, selected_language, noise_suppression_db, latency_ms, original_transcript, translated_transcript, status, created_at)
VALUES
  ('Guest A-104', 'Spanish', -91.6, 1320, 'Welcome to tonight’s keynote on the future of accessible public experiences.', 'Bienvenidos a la conferencia de esta noche sobre el futuro de las experiencias públicas accesibles.', 'active', now() - interval '8 minutes'),
  ('Guest B-218', 'Mandarin', -94.2, 1450, 'Our acoustic array identifies the stage speaker while removing reflected crowd noise.', '我们的声学阵列能够识别舞台上的演讲者，同时消除人群的反射噪声。', 'active', now() - interval '6 minutes'),
  ('Guest C-307', 'Hindi', -95.4, 1380, 'Every attendee deserves clear, immediate access to the ideas being shared.', 'हर सहभागी साझा किए जा रहे विचारों तक स्पष्ट और तत्काल पहुँच का हकदार है।', 'active', now() - interval '4 minutes'),
  ('Guest D-412', 'Spanish', -93.8, 1410, 'The system continuously adapts as the speaker moves across the stage.', 'El sistema se adapta continuamente a medida que el orador se desplaza por el escenario.', 'active', now() - interval '2 minutes');