/*
# 本人に「自分で挙げた人」との比較を見せる

pilot_survey_get の references に、運営が測った値（metrics）と測った日（measured_at）を足す。
運営が見る人（staff_say）は引き続き返さない。
*/

CREATE OR REPLACE FUNCTION public.pilot_survey_get(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'subject_code', p.subject_code,
    'answers', coalesce(s.answers, '{}'::jsonb),
    'submitted_at', s.submitted_at,
    'references', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'person_name', r.person_name,
        'image_path', r.image_path, 'source_note', r.source_note,
        'metrics', r.metrics, 'measured_at', r.measured_at
      ) ORDER BY r.created_at)
      FROM pilot_reference_people r WHERE r.token = p.token AND r.kind <> 'staff_say'
    ), '[]'::jsonb)
  )
  FROM pilot_participants p
  LEFT JOIN pilot_survey s ON s.token = p.token
  WHERE p.token = p_token;
$function$;
