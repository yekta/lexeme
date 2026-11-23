-- Page reads sync to the app like the other reading tables. Dropping reading_days
-- and reading_sessions (0012) already took them out of the publication.
ALTER PUBLICATION zero_data ADD TABLE "page_reads";
