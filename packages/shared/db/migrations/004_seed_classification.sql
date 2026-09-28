-- Classify the original seed created before templates had destination/process.
update templates
set destination = coalesce(destination, 'PlanVital'),
    process = coalesce(process, 'Licencias médicas PAGEX')
where slug = 'planvital-pagex';
