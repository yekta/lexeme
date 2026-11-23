-- The reading tables sync to the app like decks and cards do, so they join the
-- publication zero-cache reads (see 0003). device_pairings stays out: it holds
-- poll token hashes.
ALTER PUBLICATION zero_data ADD TABLE "books", "reading_days", "highlights", "lookups";
