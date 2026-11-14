create or replace function public.operation_payload_valid(kind text, payload jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare key text; value jsonb; number_value numeric;
begin
  if jsonb_typeof(payload) is distinct from 'object' then return false; end if;
  case kind
    when 'reading' then
      if not (payload ?& array['sentenceId','position'])
        or jsonb_typeof(payload->'sentenceId') is distinct from 'string'
        or length(payload->>'sentenceId') not between 1 and 512
        or jsonb_typeof(payload->'position') is distinct from 'number' then return false; end if;
      number_value := (payload->>'position')::numeric;
      if number_value < 0 or number_value > 9007199254740991
        or trunc(number_value) <> number_value then return false; end if;
      for key, value in select * from jsonb_each(payload) loop
        if key not in ('sentenceId','position','bookId','chapterId') then return false; end if;
        if key in ('bookId','chapterId') and (jsonb_typeof(value) <> 'string'
          or length(value #>> '{}') > 512) then return false; end if;
      end loop;
    when 'learning' then
      if jsonb_typeof(payload->'status') is distinct from 'string'
        or payload->>'status' not in ('encountered','learning','known','mastered') then return false; end if;
      for key, value in select * from jsonb_each(payload) loop
        if key not in ('status','automatic') then return false; end if;
        if key = 'automatic' and (jsonb_typeof(value) <> 'boolean'
          or (value = 'true'::jsonb and payload->>'status' <> 'encountered')) then return false; end if;
      end loop;
    when 'favorite' then
      if (select count(*) from jsonb_object_keys(payload)) <> 1
        or jsonb_typeof(payload->'active') is distinct from 'boolean' then return false; end if;
    when 'review' then
      if jsonb_typeof(payload->'rating') is distinct from 'string'
        or payload->>'rating' not in ('again','hard','good','easy') then return false; end if;
      if payload ? 'reviewedAt' then
        if jsonb_typeof(payload->'reviewedAt') is distinct from 'string'
          or not public.operation_timestamp_valid(payload->>'reviewedAt') then return false; end if;
      end if;
      for key, value in select * from jsonb_each(payload) loop
        if key in ('rating','reviewedAt') then continue;
        elsif key = 'correct' then
          if jsonb_typeof(value) <> 'boolean' then return false; end if;
        elsif key = 'taskId' then
          if jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 512 then return false; end if;
        elsif key in ('repetitions','intervalDays','dueAt') then
          if jsonb_typeof(value) <> 'number' then return false; end if;
          number_value := value::text::numeric;
          if number_value < 0 or number_value > 9007199254740991
            or (key <> 'intervalDays' and trunc(number_value) <> number_value) then return false; end if;
        else return false;
        end if;
      end loop;
    when 'preferences' then
      for key, value in select * from jsonb_each(payload) loop
        if key in ('canvasMode','furigana','furiganaSeparateLine','hiragana','hiraganaSeparateLine',
          'romaji','romajiSeparateLine','literal','literalSeparateLine','natural','naturalSeparateLine',
          'translationsSeparateLine','words','kanji','grammar','adaptiveHideKnown','syncEnabled') then
          if jsonb_typeof(value) <> 'boolean' then return false; end if;
        elsif key in ('fontSize','readingFontSize','translationFontSize','cardFontSize','wordsFontSize',
          'kanjiFontSize','grammarFontSize','lineHeight','width','cardScalePercent','dailyReviewLimit') then
          if jsonb_typeof(value) <> 'number' then return false; end if;
          number_value := value::text::numeric;
          if (key in ('fontSize','readingFontSize','translationFontSize','cardFontSize','wordsFontSize',
              'kanjiFontSize','grammarFontSize') and (number_value < 10 or number_value > 80))
            or (key = 'lineHeight' and (number_value < 1 or number_value > 4))
            or (key = 'width' and (number_value < 200 or number_value > 2000))
            or (key = 'cardScalePercent' and (number_value < 70 or number_value > 150
              or trunc(number_value) <> number_value))
            or (key = 'dailyReviewLimit' and (number_value < 1 or number_value > 1000
              or trunc(number_value) <> number_value)) then return false; end if;
        elsif key = 'language' then
          if value not in ('"ru"'::jsonb,'"en"'::jsonb) then return false; end if;
        elsif key = 'theme' then
          if value not in ('"light"'::jsonb,'"dark"'::jsonb,'"system"'::jsonb) then return false; end if;
        elsif key = 'mode' then
          if value not in ('"detailed"'::jsonb,'"adaptive"'::jsonb,'"continuous"'::jsonb) then return false; end if;
        else return false;
        end if;
      end loop;
    else return false;
  end case;
  return true;
exception when others then return false;
end;
$$;
