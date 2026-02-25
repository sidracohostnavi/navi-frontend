ALTER TABLE cohost_properties
  ADD COLUMN cleaning_pre_days integer not null default 0,
  ADD COLUMN cleaning_post_days integer not null default 0;

ALTER TABLE cohost_properties
  ADD CONSTRAINT cleaning_pre_days_check CHECK (cleaning_pre_days >= 0),
  ADD CONSTRAINT cleaning_post_days_check CHECK (cleaning_post_days >= 0);
