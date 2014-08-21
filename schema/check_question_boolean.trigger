-- Function: check_question_boolean_function()

-- DROP FUNCTION check_question_boolean_function();

CREATE OR REPLACE FUNCTION check_question_boolean_function()
  RETURNS trigger AS
$BODY$
DECLARE
    the_question_type text;
begin
  SELECT question_type
    into the_question_type
  FROM question
  WHERE question.id = NEW.question_id;
  IF the_question_type != 'boolean' THEN
    raise exception 'boolean questions must have answer_boolean answers';
  end if;
RETURN NEW;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;
ALTER FUNCTION check_question_boolean_function()
  OWNER TO postgres;

-- Trigger: check_question_boolean_trigger on answer_boolean

-- DROP TRIGGER check_question_boolean_trigger ON answer_boolean;

CREATE TRIGGER check_question_boolean_trigger
  BEFORE INSERT OR UPDATE
  ON answer_boolean
  FOR EACH ROW
  EXECUTE PROCEDURE check_question_boolean_function();
