-- Values the user typed for the template's parameters when generating, and the name of the generated file
-- (it can include parameters, the input file name and the processing date).
alter table transformation_jobs
  add column if not exists run_parameters jsonb,
  add column if not exists output_file_name text;
